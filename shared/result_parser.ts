import fs from 'fs';

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

export interface MochawesomeData {
    results?: Array<{
        suites?: MochawesomeSuite[];
    }>;
    stats?: {
        duration?: number;
    };
}

export interface CtrfTest {
    name: string;
    status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
    duration: number;
    message?: string;
    trace?: string;
    suite?: string;
    tags?: string[];
    type?: string;
    filePath?: string;
    flaky?: boolean;
}

export interface CtrfSummary {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
    start: number;
    stop: number;
}

export interface CtrfEnvironment {
    appName?: string;
    buildName?: string;
    buildNumber?: string;
}

export interface CtrfResults {
    tool?: { name?: string };
    summary: CtrfSummary;
    tests: CtrfTest[];
    environment?: CtrfEnvironment;
}

export interface CtrfData {
    results: CtrfResults;
}

export interface FlatTest {
    title: string;
    state: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
    fullTitle?: string;
}

export interface ParseResult {
    tests: FlatTest[];
    stats: {
        passed: number;
        failed: number;
        skipped: number;
        total: number;
        duration: number;
    };
}

interface ParseResultWithError extends ParseResult {
    error?: string;
}

function _flattenTests(suite: MochawesomeSuite, parentTitle?: string): FlatTest[] {
    const tests: FlatTest[] = [];
    const suiteTitle = suite.title || '';
    const currentPath = parentTitle ? parentTitle + ' > ' + suiteTitle : suiteTitle;
    if (suite.tests && Array.isArray(suite.tests)) {
        for (const t of suite.tests) {
            const rawState = t.state || 'pending';
            const state: 'passed' | 'failed' | 'skipped' =
                rawState === 'passed' ? 'passed' : rawState === 'failed' ? 'failed' : 'skipped';
            const errMsg = t.err?.[0]?.message || t.err?.[0]?.title || undefined;
            tests.push({
                title: t.title || '',
                state,
                duration: t.duration || 0,
                error: errMsg,
                fullTitle: currentPath ? currentPath + ' > ' + (t.title || '') : undefined,
            });
        }
    }
    if (suite.suites && Array.isArray(suite.suites)) {
        for (const sub of suite.suites) {
            tests.push(..._flattenTests(sub, currentPath));
        }
    }
    return tests;
}

export function parseMochawesome(jsonData: MochawesomeData): ParseResult {
    if (!jsonData || !jsonData.results || !Array.isArray(jsonData.results)) {
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 } };
    }

    const allTests: FlatTest[] = [];
    for (const result of jsonData.results) {
        if (result.suites) {
            for (const suite of result.suites) {
                allTests.push(..._flattenTests(suite));
            }
        }
    }

    const passed = allTests.filter((t) => t.state === 'passed').length;
    const failed = allTests.filter((t) => t.state === 'failed').length;
    const skipped = allTests.filter((t) => t.state === 'skipped').length;
    const stats = jsonData.stats || {};
    const duration = typeof stats.duration === 'number' ? stats.duration : 0;

    return {
        tests: allTests,
        stats: {
            passed,
            failed,
            skipped,
            total: allTests.length,
            duration,
        },
    };
}

export function parseCtrfResults(jsonData: CtrfData): ParseResult {
    if (!jsonData?.results?.tests || !Array.isArray(jsonData.results.tests)) {
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 } };
    }

    const summary = jsonData.results.summary;

    const tests: FlatTest[] = jsonData.results.tests.map((t) => ({
        title: t.name || '',
        state: t.status === 'passed' ? 'passed' : t.status === 'failed' ? 'failed' : 'skipped',
        duration: t.duration || 0,
        error: t.message || undefined,
        fullTitle: t.suite ? t.suite + ' > ' + (t.name || '') : undefined,
    }));

    const stats = {
        passed: typeof summary?.passed === 'number' ? summary.passed : tests.filter((t) => t.state === 'passed').length,
        failed: typeof summary?.failed === 'number' ? summary.failed : tests.filter((t) => t.state === 'failed').length,
        skipped:
            typeof summary?.skipped === 'number' ? summary.skipped : tests.filter((t) => t.state === 'skipped').length,
        total: typeof summary?.tests === 'number' ? summary.tests : tests.length,
        duration:
            summary?.stop && summary?.start
                ? summary.stop - summary.start
                : summary?.tests
                  ? 0
                  : tests.reduce((s, t) => s + t.duration, 0),
    };

    return { tests, stats };
}

export function isCtrfFormat(jsonData: unknown): jsonData is CtrfData {
    if (typeof jsonData !== 'object' || jsonData === null) return false;
    const obj = jsonData as Record<string, unknown>;
    if (typeof obj.results !== 'object' || obj.results === null) return false;
    const results = obj.results as Record<string, unknown>;
    return Array.isArray(results.tests) && typeof results.summary === 'object';
}

export function parseTestResults(jsonData: unknown): ParseResult {
    if (isCtrfFormat(jsonData)) {
        return parseCtrfResults(jsonData);
    }
    return parseMochawesome(jsonData as MochawesomeData);
}

export function parseTestResultsFile(filePath: string): ParseResultWithError {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        return parseTestResults(json);
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException & { message: string };
        const msg =
            e.code === 'ENOENT'
                ? 'Arquivo não encontrado: ' + filePath
                : 'Erro ao ler/parsear arquivo: ' + filePath + ' (' + e.message + ')';
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 }, error: msg };
    }
}

export function parseCypressResults(filePath: string): ParseResultWithError {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const json = JSON.parse(raw);
        return parseMochawesome(json);
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException & { message: string };
        const msg =
            e.code === 'ENOENT'
                ? 'Arquivo não encontrado: ' + filePath
                : 'Erro ao ler/parsear arquivo: ' + filePath + ' (' + e.message + ')';
        return { tests: [], stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 }, error: msg };
    }
}
