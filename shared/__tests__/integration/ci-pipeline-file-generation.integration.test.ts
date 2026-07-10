import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface CtrfSummary {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
    start: number;
    stop: number;
}

interface CtrfReport {
    results: {
        tool: { name: string };
        summary: CtrfSummary;
        tests: Array<{ name: string; status: string; duration: number }>;
    };
}

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const NODE_BIN = process.execPath;
const VITEST_BIN = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe('CI pipeline file generation (real)', () => {
    let TMPDIR: string;

    beforeAll(() => {
        TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-pipeline-gen-'));
    });

    afterEach(() => {
        fs.rmSync(TMPDIR, { recursive: true, force: true });
        TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-pipeline-gen-'));
    });

    it('ctrf reporter creates report file when vitest runs', () => {
        expect.hasAssertions();

        const reportDir = path.join(TMPDIR, 'reports');
        const reportFile = path.join(reportDir, 'ctrf-report.json');

        fs.mkdirSync(reportDir, { recursive: true });

        const testFile = path.join(TMPDIR, 'sample.test.ts');
        fs.writeFileSync(
            testFile,
            `import { it, expect } from 'vitest';
it('passes', () => { expect(1 + 1).toBe(2); });`,
        );

        execFileSync(NODE_BIN, [VITEST_BIN, 'run', '--root', TMPDIR, '--config', `${ROOT}/vitest.config.ts`], {
            cwd: ROOT,
            env: {
                CTRF_OUTPUT_DIR: reportDir,
                CTRF_OUTPUT_FILE: 'ctrf-report.json',
            },
            timeout: 60_000,
            stdio: 'pipe',
        });

        expect(fs.existsSync(reportFile)).toBeTruthy();

        const content: CtrfReport = JSON.parse(fs.readFileSync(reportFile, 'utf8')) as CtrfReport;

        expect(content.results).toBeDefined();
        expect(content.results.summary.tests).toBeGreaterThanOrEqual(1);
    });

    it('pr-report-core cli returns early when no DataHub data available', () => {
        expect.hasAssertions();

        const reportDir = path.join(TMPDIR, 'reports');
        const htmlFile = path.join(reportDir, 'pr-report.html');

        fs.mkdirSync(reportDir, { recursive: true });

        // Set up feature config so main() doesn't skip execution
        const configDir = path.join(ROOT, 'config');
        const configFile = path.join(configDir, 'features.json');
        const configBackup = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : null;
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(
            configFile,
            JSON.stringify({
                qa_tools: {
                    gitProvider: 'github',
                    features: {
                        prReport: {
                            enabled: true,
                            publishTarget: 'github-actions',
                            skipAi: false,
                            skipQuality: false,
                            skipFlaky: false,
                        },
                    },
                },
            }),
        );

        execFileSync(
            NODE_BIN,
            [
                TSX_BIN,
                'shared/pr-report-core.ts',
                '--project',
                'qa_tools',
                '--no-ai',
                '--no-quality',
                '--no-flaky',
                '--html-output',
                htmlFile,
            ],
            {
                cwd: ROOT,
                timeout: 60_000,
                stdio: 'pipe',
                env: { ...process.env, VITEST: undefined },
            },
        );

        // main() should return early when DataHub has no test data
        // HTML file should NOT be generated
        expect(fs.existsSync(htmlFile)).toBeFalsy();

        // Restore original config file
        if (configBackup !== null) {
            fs.writeFileSync(configFile, configBackup);
        } else {
            fs.rmSync(configFile, { force: true });
        }
    });
});
