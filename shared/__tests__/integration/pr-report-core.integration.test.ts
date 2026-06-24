import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlatTest } from '../../result_parser.js';

// ── Mock external boundaries ──────────────────────────────────────────────

vi.mock('../../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../../github-check-run.js', () => ({
    createCheckRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../github-pr-comment.js', () => ({
    postPrComment: vi.fn().mockResolvedValue({ html_url: 'https://github.com/mock/pull/1' }),
}));

vi.mock('../../report-html.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../report-html.js')>();
    return { ...actual, generateHtmlReport: vi.fn(actual.generateHtmlReport) };
});

// Mock store-backend to avoid git operations and use temp dir instead
const mockStorageDir = vi.hoisted(() => ({ value: '' }));
vi.mock('../../store-backend.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../store-backend.js')>();
    return {
        ...actual,
        detectProjectGitDir: () => null,
        detectStoreBackend: () => new actual.FsStoreBackend(mockStorageDir.value),
    };
});

// ── Fixtures ──────────────────────────────────────────────────────────────

const PASSING_TESTS: FlatTest[] = [
    { title: 'Auth > Login', state: 'passed', duration: 120 },
    { title: 'Auth > Logout', state: 'passed', duration: 80 },
    { title: 'Dashboard > Load', state: 'passed', duration: 300 },
    { title: 'API > Create', state: 'passed', duration: 450 },
    { title: 'API > Delete', state: 'passed', duration: 200 },
];

const MIXED_TESTS: FlatTest[] = [
    { title: 'Auth > Login', state: 'passed', duration: 120 },
    { title: 'Auth > Fail', state: 'failed', duration: 800, error: 'AssertionError: expected 1 to equal 2' },
    { title: 'Dashboard > Load', state: 'passed', duration: 300 },
    { title: 'Dashboard > Widget', state: 'failed', duration: 1500, error: 'TimeoutError: element not found' },
    { title: 'API > Create', state: 'passed', duration: 450 },
    { title: 'API > Delete', state: 'skipped', duration: 0 },
];

const MIXED_STATS = {
    passed: 3,
    failed: 2,
    skipped: 1,
    total: 6,
    duration: 3170,
};

// ── Helpers ───────────────────────────────────────────────────────────────

let TEST_DIR: string;

function writeCtrfFixture(tests: FlatTest[]): string {
    const ctrfPath = path.join(TEST_DIR, 'ctrf-report.json');
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    const skipped = tests.filter((t) => t.state === 'skipped').length;
    const ctrf = {
        results: {
            tool: { name: 'vitest' },
            summary: {
                tests: tests.length,
                passed,
                failed,
                skipped,
                pending: 0,
                other: 0,
                start: Date.now() - tests.length * 1000,
                stop: Date.now(),
            },
            tests: tests.map((t) => ({
                name: t.title,
                status: t.state === 'passed' ? 'passed' : t.state === 'failed' ? 'failed' : 'skipped',
                duration: t.duration,
                ...(t.error ? { message: t.error } : {}),
            })),
        },
    };
    fs.writeFileSync(ctrfPath, JSON.stringify(ctrf, null, 2), 'utf8');
    return ctrfPath;
}

afterAll(() => {
    delete process.env['GITHUB_STEP_SUMMARY'];
});

beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env['GITHUB_STEP_SUMMARY'];
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-pr-report-'));
    mockStorageDir.value = TEST_DIR;
});

afterEach(() => {
    try {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
        /* best effort */
    }
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Integration: PR Report (FT-16)', () => {
    describe('FT-16a: generatePrReport with all-passing tests', () => {
        it('returns health score and generates HTML file', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const result = await generatePrReport({
                tests: PASSING_TESTS,
                stats: { passed: 5, failed: 0, skipped: 0, total: 5, duration: 1150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(result.healthScore.overall).toBeGreaterThanOrEqual(0);
            expect(result.healthScore.overall).toBeLessThanOrEqual(100);
            expect(result.passRate).toBe(100);
            expect(fs.existsSync(htmlPath)).toBeTruthy();

            const html = fs.readFileSync(htmlPath, 'utf8');

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('</html>');
        });

        it('returns comment URL when posted', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const result = await generatePrReport({
                tests: PASSING_TESTS,
                stats: { passed: 5, failed: 0, skipped: 0, total: 5, duration: 1150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(result.commentUrl).toBe('https://github.com/mock/pull/1');
        });

        it('persists run to metrics store', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { loadMetrics } = await import('../../metrics.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            await generatePrReport({
                tests: PASSING_TESTS,
                stats: { passed: 5, failed: 0, skipped: 0, total: 5, duration: 1150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            const store = loadMetrics();

            expect(store.runs.length).toBeGreaterThanOrEqual(1);

            const lastRun = store.runs[store.runs.length - 1] as (typeof store.runs)[number];

            expect(lastRun.project).toBe('test-project');
            expect(lastRun.total).toBe(5);
            expect(lastRun.passed).toBe(5);
        });
    });

    describe('FT-16b: generatePrReport with failures', () => {
        it('includes lower pass rate with failures', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const result = await generatePrReport({
                tests: MIXED_TESTS,
                stats: MIXED_STATS,
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            // 3 passed out of 5 executed = 60%
            expect(result.passRate).toBe(60);
        });

        it('calculates health score reflecting failures', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const result = await generatePrReport({
                tests: MIXED_TESTS,
                stats: MIXED_STATS,
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            // Lower pass rate should yield lower health score
            expect(result.passRate).toBe(60);
            expect(result.healthScore.dimensions.passRate.score).toBeLessThan(100);
            expect(result.healthScore.overall).toBeLessThan(100);
        });
    });

    describe('FT-16c: generatePrReport with quality gate', () => {
        it('creates check run when quality gate runs', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { createCheckRun } = await import('../../github-check-run.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            await generatePrReport({
                tests: MIXED_TESTS,
                stats: MIXED_STATS,
                project: 'test-project',
                skipAi: true,
                skipQuality: false,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(createCheckRun).toHaveBeenCalled();
        });

        it('posts quality gate check with pass/fail conclusion', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { createCheckRun } = await import('../../github-check-run.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            await generatePrReport({
                tests: PASSING_TESTS,
                stats: { passed: 5, failed: 0, skipped: 0, total: 5, duration: 1150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: false,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(createCheckRun).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'Quality Gate',
                    status: 'completed',
                }),
            );
        });
    });

    describe('FT-16d: CTRF parsing integration', () => {
        it('parses real CTRF fixture into FlatTest array', async () => {expect.hasAssertions();

            const ctrfPath = writeCtrfFixture(MIXED_TESTS);
            const { parseTestResultsFile } = await import('../../result_parser.js');

            const result = parseTestResultsFile(ctrfPath);

            expect(result.error).toBeUndefined();
            expect(result.tests).toHaveLength(MIXED_TESTS.length);
            expect(result.stats.failed).toBe(2);
            expect(result.stats.passed).toBe(3);

            const failedTest = result.tests.find((t) => t.state === 'failed');

            expect(failedTest).not.toBeNull();
            expect(failedTest?.error).toBe('AssertionError: expected 1 to equal 2');
        });

        it('feeds parsed CTRF data into generatePrReport', async () => {expect.hasAssertions();

            const ctrfPath = writeCtrfFixture(PASSING_TESTS);
            const { parseTestResultsFile } = await import('../../result_parser.js');
            const { generatePrReport } = await import('../../pr-report-core.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const parsed = parseTestResultsFile(ctrfPath);

            expect(parsed.error).toBeUndefined();

            const result = await generatePrReport({
                tests: parsed.tests,
                stats: parsed.stats,
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(result.passRate).toBe(100);
            expect(fs.existsSync(htmlPath)).toBeTruthy();
        });
    });

    describe('FT-16f: error handling in generatePrReport', () => {
        it('logs warning and continues when createCheckRun fails', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { createCheckRun } = await import('../../github-check-run.js');
            const { rootLogger } = await import('../../logger.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            vi.mocked(createCheckRun).mockRejectedValueOnce(new Error('check run failed'));

            const result = await generatePrReport({
                tests: MIXED_TESTS,
                stats: MIXED_STATS,
                project: 'test-project',
                skipAi: true,
                skipQuality: false,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(vi.spyOn(rootLogger, 'warn')).toHaveBeenCalledWith(expect.stringContaining('createCheckRun error'));
            expect(result.healthScore).toBeDefined();
        });

        it('logs error and returns result when generateHtmlReport throws', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { generateHtmlReport } = await import('../../report-html.js');
            const { rootLogger } = await import('../../logger.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            vi.mocked(generateHtmlReport).mockImplementationOnce(() => {
                throw new Error('HTML generation failed');
            });

            const result = await generatePrReport({
                tests: PASSING_TESTS,
                stats: { passed: 5, failed: 0, skipped: 0, total: 5, duration: 1150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            expect(vi.spyOn(rootLogger, 'error')).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate HTML report'),
            );
            expect(result.healthScore).toBeDefined();
            expect(result.passRate).toBe(100);
        });
    });

    describe('FT-16e: computeDiffComparison integration', () => {
        it('detects new failures between runs', async () => {expect.hasAssertions();

            const prev: FlatTest[] = [
                { title: 'Login', state: 'passed', duration: 100 },
                { title: 'Logout', state: 'passed', duration: 50 },
                { title: 'Dashboard', state: 'passed', duration: 200 },
            ];
            const curr: FlatTest[] = [
                { title: 'Login', state: 'passed', duration: 100 },
                { title: 'Logout', state: 'failed', duration: 50, error: 'fail' },
                { title: 'Dashboard', state: 'passed', duration: 200 },
                { title: 'New test skipped', state: 'skipped', duration: 0 },
            ];

            const { computeDiffComparison } = await import('../../pr-report-core.js');

            const diff = computeDiffComparison(curr, prev);
            if (!diff) throw new Error('Expected diff to be defined');

            expect(diff.newFailures).toHaveLength(1);
            expect(diff.newFailures[0]).toMatchObject({ title: 'Logout' });
            expect(diff.newPasses).toHaveLength(0);
        });

        it('returns undefined when identical', async () => {expect.hasAssertions();

            const tests: FlatTest[] = [
                { title: 'T1', state: 'passed', duration: 100 },
                { title: 'T2', state: 'failed', duration: 50, error: 'err' },
            ];

            const { computeDiffComparison } = await import('../../pr-report-core.js');

            const diff = computeDiffComparison(tests, tests);

            expect(diff).toBeUndefined();
        });

        it('uses previous run from metrics store when previous exists', async () => {expect.hasAssertions();

            const { generatePrReport } = await import('../../pr-report-core.js');
            const { computeDiffComparison } = await import('../../pr-report-core.js');
            const { loadMetrics } = await import('../../metrics.js');
            const htmlPath = path.join(TEST_DIR, 'pr-report.html');

            const firstTests: FlatTest[] = [
                { title: 'T1', state: 'passed', duration: 100 },
                { title: 'T2', state: 'failed', duration: 50, error: 'err' },
            ];
            const secondTests: FlatTest[] = [
                { title: 'T1', state: 'passed', duration: 100 },
                { title: 'T2', state: 'passed', duration: 50 },
            ];

            // Run 1 — persists to metrics
            await generatePrReport({
                tests: firstTests,
                stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
                project: 'test-project',
                skipAi: true,
                skipQuality: true,
                skipFlaky: true,
                htmlOutputPath: htmlPath,
            });

            // Run 2 — load previous from store and diff
            const store = loadMetrics();
            const previousRun = store.runs.length > 0 ? store.runs[store.runs.length - 1] : undefined;
            const diff = previousRun ? computeDiffComparison(secondTests, previousRun.tests) : undefined;

            if (!diff) throw new Error('Expected diff to be defined');

            expect(diff.newPasses).toHaveLength(1);
            expect(diff.newPasses[0]).toMatchObject({ title: 'T2' });
        });
    });
});
