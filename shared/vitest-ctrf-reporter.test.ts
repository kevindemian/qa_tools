/**
 * Tests for VitestCtrfReporter.
 *
 * Verifies that the reporter correctly generates CTRF JSON files
 * that are compatible with shared/result_parser.ts's isCtrfFormat().
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TestCase } from 'vitest/node';
import { isCtrfFormat, parseTestResults, type CtrfData } from './result_parser.js';
import { VitestCtrfReporter } from './vitest-ctrf-reporter.js';

const TEST_OUTPUT_DIR = resolve('reports-test');
const TEST_OUTPUT_FILE = 'test-ctrf-report.json';

// ---------------------------------------------------------------------------
// Mock factories for vitest types
// ---------------------------------------------------------------------------

interface MockError {
    message: string;
    stack: string;
}

interface MockTestCaseResult {
    state: 'passed' | 'failed' | 'skipped' | 'pending';
    errors?: ReadonlyArray<MockError>;
}

interface MockTestDiagnostic {
    duration: number;
    retryCount: number;
    slow: boolean;
    heap: number | undefined;
    startTime: number;
}

interface MockLocation {
    line: number;
    column: number;
}

interface MockParent {
    readonly type: string;
    readonly name: string;
    readonly parent: MockParent | { readonly type: 'module' };
}

interface MockModule {
    readonly name: string;
}

interface MockTestCase {
    readonly type: 'test';
    readonly name: string;
    readonly module: MockModule;
    readonly parent: MockParent | { readonly type: 'module' };
    readonly tags: string[];
    readonly location: MockLocation | undefined;
    result: () => MockTestCaseResult;
    diagnostic: () => MockTestDiagnostic | undefined;
    ok: () => boolean;
    meta: () => Record<string, unknown>;
    annotations: () => ReadonlyArray<unknown>;
    artifacts: () => ReadonlyArray<unknown>;
    toTestSpecification: () => unknown;
}

/** Wrap a MockTestCase as TestCase for vitest's Reporter interface (private fields are structurally incompatible). */
function asTestCase(mock: MockTestCase): TestCase {
    return mock as unknown as TestCase; // structural: vitest's TestCase has private fields — no object literal satisfies it
}

/** Non-null results accessor for tests (reporter always populates these). */
function resultsOf(d: CtrfData): Required<NonNullable<CtrfData['results']>> & {
    summary: Required<NonNullable<NonNullable<CtrfData['results']>['summary']>>;
} {
    if (!d.results) throw new Error('results are null');
    return d.results as ReturnType<typeof resultsOf>;
}

/** Narrow a possibly-null value — for test assertions where we know the value exists. */
function defined<T>(value: T): NonNullable<T> {
    return value as NonNullable<T>;
}

function createMockParent(type: string, name: string): MockParent {
    return {
        type,
        name,
        parent: { type: 'module' },
    };
}

function createMockTestCase(opts: {
    name: string;
    state: 'passed' | 'failed' | 'skipped' | 'pending';
    duration?: number;
    errorMessage?: string;
    errorStack?: string;
    suiteName?: string;
    moduleName?: string;
    retryCount?: number;
    line?: number;
}): MockTestCase {
    const result: MockTestCaseResult = {
        state: opts.state,
    };
    if (opts.errorMessage || opts.errorStack) {
        result.errors = [
            {
                message: opts.errorMessage ?? '',
                stack: opts.errorStack ?? '',
            },
        ];
    }

    const diagnostic: MockTestDiagnostic = {
        duration: opts.duration ?? 100,
        retryCount: opts.retryCount ?? 0,
        slow: false,
        heap: undefined,
        startTime: 0,
    };

    const parent: MockParent | { readonly type: 'module' } = opts.suiteName
        ? createMockParent('suite', opts.suiteName)
        : { type: 'module' };

    return {
        type: 'test',
        name: opts.name,
        module: { name: opts.moduleName ?? 'test-file.ts' },
        parent,
        tags: [],
        location: opts.line ? { line: opts.line, column: 1 } : undefined,
        result: () => result,
        diagnostic: () => diagnostic,
        ok: () => opts.state === 'passed',
        meta: () => ({}),
        annotations: () => [],
        artifacts: () => [],
        toTestSpecification: () => undefined,
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VitestCtrfReporter', () => {
    beforeEach(() => {
        rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    });

    afterEach(() => {
        rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    });

    function readReport(dir: string = TEST_OUTPUT_DIR, file: string = TEST_OUTPUT_FILE): CtrfData {
        const content = readFileSync(resolve(dir, file), 'utf8');
        return JSON.parse(content) as CtrfData;
    }

    it('generates a valid CTRF JSON file with correct structure', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(createMockTestCase({ name: 'test-1', state: 'passed', duration: 100, suiteName: 'Suite A' })),
        );
        reporter.onTestCaseResult(
            asTestCase(createMockTestCase({ name: 'test-2', state: 'failed', duration: 200, suiteName: 'Suite A' })),
        );
        reporter.onTestRunEnd();

        expect(existsSync(resolve(TEST_OUTPUT_DIR, TEST_OUTPUT_FILE))).toBe(true);
        const data = readReport();
        expect(isCtrfFormat(data)).toBe(true);
    });

    it('counts passed tests correctly', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'pass-1', state: 'passed' })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'pass-2', state: 'passed' })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'fail-1', state: 'failed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).summary.passed).toBe(2);
        expect(resultsOf(data).summary.failed).toBe(1);
        expect(resultsOf(data).summary.skipped).toBe(0);
        expect(resultsOf(data).summary.tests).toBe(3);
    });

    it('counts skipped tests correctly', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'skip-1', state: 'skipped' })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'pass-1', state: 'passed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).summary.skipped).toBe(1);
        expect(resultsOf(data).summary.passed).toBe(1);
    });

    it('ignores pending tests', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'pending-1', state: 'pending' })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'pass-1', state: 'passed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).summary.tests).toBe(1);
        expect(resultsOf(data).summary.passed).toBe(1);
    });

    it('captures error message and trace for failed tests', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(
                createMockTestCase({
                    name: 'fail-1',
                    state: 'failed',
                    errorMessage: 'Expected 5 but got 4',
                    errorStack: 'Error: Expected 5 but got 4\n    at Test.fail',
                }),
            ),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const failedTest = resultsOf(data).tests.find((t) => t.name === 'fail-1');
        expect(failedTest).toBeDefined();
        expect(defined(failedTest).message).toBe('Expected 5 but got 4');
        expect(defined(failedTest).trace).toContain('Error: Expected 5 but got 4');
    });

    it('builds suite hierarchy from parent chain', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(
                createMockTestCase({
                    name: 'test-in-suite',
                    state: 'passed',
                    suiteName: 'Parent Suite',
                }),
            ),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const test = resultsOf(data).tests.find((t) => t.name === 'test-in-suite');
        expect(test).toBeDefined();
        expect(defined(test).suite).toBe('Parent Suite');
    });

    it('marks test as flaky when passed after retries', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(
                createMockTestCase({
                    name: 'flaky-test',
                    state: 'passed',
                    retryCount: 2,
                }),
            ),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const test = resultsOf(data).tests.find((t) => t.name === 'flaky-test');
        expect(test).toBeDefined();
        expect(defined(test).flaky).toBe(true);
    });

    it('does not mark passed tests without retries as flaky', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(createMockTestCase({ name: 'stable-test', state: 'passed', retryCount: 0 })),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const test = resultsOf(data).tests.find((t) => t.name === 'stable-test');
        expect(defined(test).flaky).toBeUndefined();
    });

    it('includes file path with line number when location is available', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(
                createMockTestCase({
                    name: 'located-test',
                    state: 'passed',
                    moduleName: 'src/example.test.ts',
                    line: 42,
                }),
            ),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const test = resultsOf(data).tests.find((t) => t.name === 'located-test');
        expect(defined(test).filePath).toBe('src/example.test.ts:42');
    });

    it('includes environment metadata from parameters', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
            appName: 'MyApp',
            buildName: 'build-001',
            buildNumber: '42',
            testType: 'integration',
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'env-test', state: 'passed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).environment.appName).toBe('MyApp');
        expect(resultsOf(data).environment.buildName).toBe('build-001');
        expect(resultsOf(data).environment.buildNumber).toBe('42');
        const test = resultsOf(data).tests[0] as import('./result_parser.js').CtrfTest;
        expect(test.type).toBe('integration');
    });

    it('minimal mode excludes extra fields', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
            minimal: true,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(
            asTestCase(
                createMockTestCase({
                    name: 'minimal-test',
                    state: 'failed',
                    errorMessage: 'some error',
                    suiteName: 'Suite',
                }),
            ),
        );
        reporter.onTestRunEnd();

        const data = readReport();
        const test = resultsOf(data).tests.find((t) => t.name === 'minimal-test');
        expect(defined(test).message).toBeUndefined();
        expect(defined(test).trace).toBeUndefined();
        expect(defined(test).suite).toBeUndefined();
        expect(defined(test).flaky).toBeUndefined();
        expect(defined(test).filePath).toBeUndefined();
        expect(defined(test).type).toBe('unit');
    });

    it('produces output compatible with parseTestResults', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'p1', state: 'passed', duration: 100 })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'f1', state: 'failed', duration: 200 })));
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 's1', state: 'skipped', duration: 0 })));
        reporter.onTestRunEnd();

        const data = readReport();
        const parsed = parseTestResults(data);
        expect(parsed.tests).toHaveLength(3);
        expect(parsed.stats.passed).toBe(1);
        expect(parsed.stats.failed).toBe(1);
        expect(parsed.stats.skipped).toBe(1);
    });

    it('handles empty test run', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).tests).toHaveLength(0);
        expect(resultsOf(data).summary.tests).toBe(0);
        expect(resultsOf(data).summary.passed).toBe(0);
        expect(resultsOf(data).summary.failed).toBe(0);
        expect(isCtrfFormat(data)).toBe(true);
    });

    it('uses environment variables as defaults', () => {
        const origEnv = { ...process.env };
        const testEnv = process.env as Record<string, string | undefined>;
        testEnv['APP_NAME'] = 'EnvApp';
        testEnv['GITHUB_RUN_ID'] = 'run-123';
        testEnv['GITHUB_RUN_NUMBER'] = '99';

        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'env-defaults', state: 'passed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).environment.appName).toBe('EnvApp');
        expect(resultsOf(data).environment.buildName).toBe('run-123');
        expect(resultsOf(data).environment.buildNumber).toBe('99');

        process.env = origEnv;
    });

    it('respects custom output path', () => {
        const customDir = resolve('custom-reports');
        const customFile = 'custom-output.json';

        const reporter = new VitestCtrfReporter({
            outputDir: customDir,
            outputFile: customFile,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'custom-path', state: 'passed' })));
        reporter.onTestRunEnd();

        expect(existsSync(resolve(customDir, customFile))).toBe(true);
        const data = JSON.parse(readFileSync(resolve(customDir, customFile), 'utf8')) as CtrfData;
        expect(resultsOf(data).tests).toHaveLength(1);

        rmSync(customDir, { recursive: true, force: true });
    });

    it('sets start and stop timestamps (stop >= start)', () => {
        const reporter = new VitestCtrfReporter({
            outputDir: TEST_OUTPUT_DIR,
            outputFile: TEST_OUTPUT_FILE,
        });

        reporter.onTestRunStart();
        reporter.onTestCaseResult(asTestCase(createMockTestCase({ name: 'timing-test', state: 'passed' })));
        reporter.onTestRunEnd();

        const data = readReport();
        expect(resultsOf(data).summary.start).toBeGreaterThan(0);
        // stop must be >= start (same ms is possible for fast runs)
        expect(resultsOf(data).summary.stop).toBeGreaterThanOrEqual(resultsOf(data).summary.start);
    });
});
