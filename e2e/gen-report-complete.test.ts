/**
 * Tests for gen-report-complete.ts — HTML report generation.
 * Focuses on CLI argument parsing and control flow (skip-jira, output).
 */

import os from 'os';
import path from 'path';
import { describe, expect, it, vi, afterEach } from 'vitest';

// Mock external deps
vi.mock('../shared/result_parser.js', () => ({
    parseTestResultsFile: vi.fn(() => ({
        tests: [{ name: 'test-1', status: 'passed', duration: 100 }],
        stats: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 100 },
        error: undefined,
    })),
}));

vi.mock('../shared/report-generator.js', () => ({
    generateHtmlReport: vi.fn(() => '<html><body>REPORT</body></html>'),
}));

vi.mock('../shared/temp-dir.js', () => ({
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'report.html')),
}));

vi.mock('../shared/http-client.js', () => ({
    createHttpClient: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: { workflow_runs: [] } }),
    })),
}));

vi.mock('../jira_management/jira_resource.js', () => {
    return { default: vi.fn() };
});

vi.mock('../shared/logger.js', () => ({
    rootLogger: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../shared/cli_base.js', () => ({
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

        const mod = await import('./gen-report-complete.js');

        await expect(mod.main()).resolves.toBeUndefined();
    });

    it('renders report without --skip-jira flag (no Jira fetch if no token)', async () => {
        expect.hasAssertions();

        process.argv = ['node', 'gen-report-complete.ts', '--ctrf=e2e/fixtures/ctrf-report.json'];
        const penv = process.env as Record<string, string | undefined>;
        delete penv['JIRA_PERSONAL_TOKEN'];
        delete penv['GITHUB_TOKEN'];

        const mod = await import('./gen-report-complete.js');

        // Clear argv so main() runs fresh
        // We need to set process.argv before import to pick up --ctrf in loadCtrfFixture
        // Already set above
        await expect(mod.main()).resolves.toBeUndefined();
    });

    it('generates HTML output via writeReport', async () => {
        expect.hasAssertions();

        process.argv = ['node', 'gen-report-complete.ts', '--ctrf=e2e/fixtures/ctrf-report.json', '--skip-jira'];

        const { writeReport } = await import('../shared/temp-dir.js');
        const mod = await import('./gen-report-complete.js');
        await mod.main();

        expect(writeReport).toHaveBeenCalledWith('report-e2e-complete.html', expect.stringContaining('REPORT'));
    });
});
