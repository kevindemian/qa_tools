/** Test result parsers for Mochawesome and CTRF JSON formats.
 * Provides unified flattening, detection, and file-I/O wrappers. */

import fs from 'fs';
import path from 'path';
import { rootLogger } from './logger.js';

const EMPTY_PARSE_RESULT: ParseResult = Object.freeze({
    tests: [],
    stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
});

function readAndParse<T>(filePath: string, parser: (data: T) => ParseResult): ParseResultWithError {
    try {
        const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
        const json: unknown = JSON.parse(raw);
        return parser(json as T);
    } catch (err: unknown) {
        const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : undefined;
        let msg: string;
        if (code === 'ENOENT') {
            msg = 'Arquivo não encontrado: ' + filePath;
        } else {
            msg = 'Erro ao ler/parsear arquivo: ' + filePath + ' (' + String(err) + ')';
        }
        return { ...EMPTY_PARSE_RESULT, error: msg };
    }
}

interface MochawesomeSuite {
    title?: string;
    tests?: Array<{
        title?: string;
        state?: string;
        duration?: number;
        err?: Array<{ message?: string; title?: string }>;
    }>;
    suites?: MochawesomeSuite[];
}

/** Top-level Mochawesome JSON report structure. */
export interface MochawesomeData {
    results?: Array<{
        suites?: MochawesomeSuite[];
    }>;
    stats?: {
        duration?: number;
    };
}

/** A single test entry in CTRF format. */
export interface CtrfTest {
    /** Test name. */
    name: string;
    /** Execution status: passed, failed, skipped, pending, or other. */
    status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
    /** Execution duration in milliseconds. */
    duration: number;
    /** Failure or error message. */
    message?: string;
    /** Stack trace on failure. */
    trace?: string;
    /** Suite name the test belongs to. */
    suite?: string;
    /** Arbitrary tags attached to the test. */
    tags?: string[];
    /** Test type (e.g. unit, integration, e2e). */
    type?: string;
    /** Path to the test source file. */
    filePath?: string;
    /** Whether the test is known to be flaky. */
    flaky?: boolean;
}

/** Aggregate statistics for a CTRF test run. */
export interface CtrfSummary {
    /** Total number of tests. */
    tests: number;
    /** Number of passed tests. */
    passed: number;
    /** Number of failed tests. */
    failed: number;
    /** Number of skipped tests. */
    skipped: number;
    /** Number of pending tests. */
    pending: number;
    /** Number of tests with other status. */
    other: number;
    /** Start timestamp (epoch ms). */
    start: number;
    /** Stop timestamp (epoch ms). */
    stop: number;
    /** Total duration in ms. */
    duration?: number;
    /** Number of flaky tests (passed after retry). */
    flaky?: number;
    /** Number of tests that were retried (regardless of final outcome). */
    retried?: number;
}

/** Environment metadata for a CTRF test run. */
export interface CtrfEnvironment {
    /** Application name. */
    appName?: string;
    /** Build name or version. */
    buildName?: string;
    /** Build number. */
    buildNumber?: string;
}

/** Top-level CTRF results payload containing summary and tests. */
export interface CtrfResults {
    /** Tool that generated the report. */
    tool?: { name?: string };
    /** Aggregate run summary. */
    summary: CtrfSummary | null | undefined;
    /** Array of individual test results. */
    tests: CtrfTest[];
    /** Environment context. */
    environment?: CtrfEnvironment;
}

/** CTRF JSON envelope. */
export interface CtrfData {
    results: CtrfResults | null | undefined;
}

/** A single test step for display in the HTML report. */
export interface ReportStep {
    action?: string;
    expected?: string;
}

/** A screenshot attachment embedded in the HTML report. */
export interface ReportScreenshot {
    title: string;
    dataUri: string;
}

/** Normalised flat test result used throughout the codebase. */
export interface FlatTest {
    /** Test name. */
    title: string;
    /** Test result. */
    state: 'passed' | 'failed' | 'skipped';
    /** Execution time in milliseconds. */
    duration: number;
    /** Failure message if any. */
    error?: string;
    /** Suite hierarchy if available (e.g. "Root > Sub > test"). */
    fullTitle?: string;
    /** Ordered steps for collapsible detail view. */
    steps?: ReportStep[];
    /** Inline screenshots (data URIs). */
    screenshots?: ReportScreenshot[];
    /** Collapsible log lines. */
    logs?: string[];
}

/** Parsed output with flat test list and aggregate stats.
 * Both `tests` and `stats` are always present — empty array / zero-filled stats
 * are returned when the input is malformed or absent. */
export interface ParseResult {
    /** Flat test list. Always an array — empty if no tests parsed. */
    tests: FlatTest[];
    /** Aggregate statistics derived from the test list. Always present. */
    stats: {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
        duration: number;
    };
}

/** Parse result that may carry a top-level error message on failure. */
interface ParseResultWithError extends ParseResult {
    error?: string;
}

function mapTestState(state: string | undefined): FlatTest['state'] {
    if (state === 'passed') return 'passed';
    if (state === 'failed') return 'failed';
    return 'skipped';
}

function _flattenTests(suite: MochawesomeSuite, parentTitle?: string): FlatTest[] {
    const tests: FlatTest[] = [];
    const suiteTitle = suite.title ?? '';
    const currentPath = parentTitle ? parentTitle + ' > ' + suiteTitle : suiteTitle;
    if (suite.tests) {
        for (const t of suite.tests) {
            const state = mapTestState(t.state);
            const errMsg = t.err?.[0]?.message ?? t.err?.[0]?.title ?? undefined;
            tests.push({
                title: t.title ?? '',
                state,
                duration: t.duration ?? 0,
                ...(errMsg !== undefined ? { error: errMsg } : {}),
                ...(currentPath ? { fullTitle: currentPath + ' > ' + (t.title ?? '') } : {}),
            });
        }
    }
    if (suite.suites) {
        for (const sub of suite.suites) {
            tests.push(..._flattenTests(sub, currentPath));
        }
    }
    return tests;
}

/** Parse a Mochawesome JSON report into a normalised {@link ParseResult}.
 * Returns an empty result if the input structure is invalid.
 * @deprecated Use CTRF format (https://ctrf.io) instead. This parser will be removed in the next major version.
 * @internal Not part of public API. Only used internally by `parseTestResults` and `parseCypressResults`. */
export function parseMochawesome(jsonData: MochawesomeData | null | undefined): ParseResult {
    rootLogger.warn(
        '[deprecated] Mochawesome format detected. Migrate to CTRF (ctrf.io) — mochawesome support will be removed in a future version.',
    );
    return _parseMochawesomeData(jsonData);
}

function _parseMochawesomeData(jsonData: MochawesomeData | null | undefined): ParseResult {
    if (!jsonData?.results) return EMPTY_PARSE_RESULT;

    const allTests: FlatTest[] = [];
    for (const result of jsonData.results) {
        if (result.suites) {
            for (const suite of result.suites) {
                allTests.push(..._flattenTests(suite));
            }
        }
    }

    const counts = allTests.reduce(
        (acc, t) => {
            if (t.state === 'passed') acc.passed++;
            else if (t.state === 'failed') acc.failed++;
            else acc.skipped++;
            return acc;
        },
        { passed: 0, failed: 0, skipped: 0 },
    );
    const duration = jsonData.stats?.duration ?? 0;

    return {
        tests: allTests,
        stats: {
            passed: counts.passed,
            failed: counts.failed,
            skipped: counts.skipped,
            total: allTests.length,
            duration,
        },
    };
}

/** Parse a CTRF (Common Test Report Format) JSON payload.
 * Maps `passed` / `failed` status directly; everything else becomes `skipped`.
 * Falls back to computed test counts when summary fields are missing.
 * @internal Not part of public API. Use `parseTestResults` (auto-dispatch) instead. */
export function parseCtrfResults(jsonData: CtrfData): ParseResult {
    if (!Array.isArray(jsonData.results?.tests)) {
        return EMPTY_PARSE_RESULT;
    }

    const summary = jsonData.results.summary;

    const tests: FlatTest[] = jsonData.results.tests.map((t) => {
        let state: FlatTest['state'];
        if (t.status === 'passed') {
            state = 'passed';
        } else if (t.status === 'failed') {
            state = 'failed';
        } else {
            state = 'skipped';
        }
        return {
            title: t.name || '',
            state,
            duration: t.duration,
            ...(t.message !== undefined ? { error: t.message } : {}),
            ...(t.suite ? { fullTitle: t.suite + ' > ' + (t.name || '') } : {}),
        };
    });

    const testCounts = tests.reduce(
        (acc, t) => {
            if (t.state === 'passed') acc.passed++;
            else if (t.state === 'failed') acc.failed++;
            else acc.skipped++;
            return acc;
        },
        { passed: 0, failed: 0, skipped: 0 },
    );

    const wallDuration =
        summary?.stop && summary.start ? summary.stop - summary.start : tests.reduce((s, t) => s + t.duration, 0);

    const stats = {
        passed: testCounts.passed,
        failed: testCounts.failed,
        skipped: testCounts.skipped,
        total: tests.length,
        duration: wallDuration,
    };

    if (typeof summary?.passed === 'number' && summary.passed !== testCounts.passed) {
        rootLogger.warn(
            `CTRF summary.passed (${summary.passed}) != computed (${testCounts.passed}). Using computed value.`,
        );
    }
    if (typeof summary?.failed === 'number' && summary.failed !== testCounts.failed) {
        rootLogger.warn(
            `CTRF summary.failed (${summary.failed}) != computed (${testCounts.failed}). Using computed value.`,
        );
    }
    if (typeof summary?.skipped === 'number' && summary.skipped !== testCounts.skipped) {
        rootLogger.warn(
            `CTRF summary.skipped (${summary.skipped}) != computed (${testCounts.skipped}). Using computed value.`,
        );
    }
    if (typeof summary?.tests === 'number' && summary.tests !== tests.length) {
        rootLogger.warn(`CTRF summary.tests (${summary.tests}) != computed (${tests.length}). Using computed value.`);
    }

    return { tests, stats };
}

/** Type guard that checks whether an unknown value matches the CTRF envelope shape
 * (`results.tests` array + `results.summary` object).
 * @internal Not part of public API. Used internally by `parseTestResults`. */
export function isCtrfFormat(jsonData: unknown): jsonData is CtrfData {
    if (typeof jsonData !== 'object' || jsonData === null) return false;
    const obj = jsonData as CtrfData;
    if (typeof obj.results !== 'object' || obj.results === null) return false;
    const results = obj.results;
    return Array.isArray(results.tests) && results.summary !== null && typeof results.summary === 'object';
}

/** Auto-detect format (CTRF or Mochawesome) and dispatch to the correct parser. */
export function parseTestResults(jsonData: unknown): ParseResult {
    if (isCtrfFormat(jsonData)) {
        return parseCtrfResults(jsonData);
    }
    return _parseMochawesomeData(jsonData as MochawesomeData);
}

/** Read a JSON file from disk, detect its format, and parse test results.
 * Returns an error string in the result on I/O or parse failure. */
export function parseTestResultsFile(filePath: string): ParseResultWithError {
    return readAndParse(filePath, parseTestResults);
}

/** Legacy wrapper — reads a Mochawesome JSON file and parses it.
 * Returns an error string in the result on I/O or parse failure.
 * @deprecated Use {@link parseTestResultsFile} instead. Will be removed in the next major version. */
export function parseCypressResults(filePath: string): ParseResultWithError {
    return readAndParse(filePath, _parseMochawesomeData);
}
