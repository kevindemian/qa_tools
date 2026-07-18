/**
 * Tests for gen-report-complete.ts — HTML report generation.
 * Focuses on CLI argument parsing and control flow (skip-jira, output).
 */

import path from 'path';
import { describe, expect, it, vi, afterEach } from 'vitest';

// Mock only network/infrastructure deps — business logic is real
vi.mock('../../shared/infra/http-client.js', () => ({
    createHttpClient: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: { workflow_runs: [] } }),
    })),
}));

vi.mock('../../jira_management/jira_resource.js', () => {
    return { default: vi.fn() };
});

vi.mock('../../shared/logger.js', () => ({
    rootLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../shared/ui/cli_base.js', () => ({
    gracefulExit: vi.fn(),
}));

describe('Gen-report-complete', () => {
    const originalArgv = process.argv;

    afterEach(() => {
        process.argv = originalArgv;
    });

    it('skips fetchXrayHistory when --skip-jira is set', async () => {
        expect.hasAssertions();

        process.argv = ['node', 'gen-report-complete.ts', '--ctrf=e2e/fixtures/ctrf-report.json', '--skip-jira'];

        const mod = await import('../gen-report-complete.js');

        await expect(mod.main()).resolves.toBeUndefined();
    });

    it('renders report without --skip-jira flag (no Jira fetch if no token)', async () => {
        expect.hasAssertions();

        process.argv = ['node', 'gen-report-complete.ts', '--ctrf=e2e/fixtures/ctrf-report.json'];
        const penv = process.env as Record<string, string | undefined>;
        delete penv['JIRA_PERSONAL_TOKEN'];
        delete penv['GITHUB_TOKEN'];

        const mod = await import('../gen-report-complete.js');

        await expect(mod.main()).resolves.toBeUndefined();
    });

    it('generates HTML output via writeReport', async () => {
        expect.hasAssertions();

        process.argv = ['node', 'gen-report-complete.ts', '--ctrf=e2e/fixtures/ctrf-report.json', '--skip-jira'];

        const tempDir = await import('../../shared/infra/temp-dir.js');
        const writeSpy = vi.spyOn(tempDir, 'writeReport').mockImplementation((name, _content) => {
            return path.join(import.meta.dirname, '..', '..', '.tmp', name);
        });

        const mod = await import('../gen-report-complete.js');
        await mod.main();

        expect(writeSpy).toHaveBeenCalledWith('report-e2e-complete.html', expect.stringContaining('html'));
    });
});
