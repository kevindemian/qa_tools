import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    loadMetrics,
    saveRunMetrics,
    saveParseResult,
    saveCoverageSnapshot,
    calculateFlakiness,
    getTrends,
} from './metrics';
import Config from './config';
import type { MetricsRun, MetricsStore, CoverageSnapshot } from './metrics';
import type { ParseResult } from './result_parser';

const TMP_DIR = path.join(os.tmpdir(), 'qa-tools-metrics-test-' + Date.now());

beforeEach(() => {
    // Clean any leftover files
    try {
        fs.rmSync(TMP_DIR, { recursive: true });
    } catch {
        /* ok */
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterAll(() => {
    try {
        fs.rmSync(TMP_DIR, { recursive: true });
    } catch {
        /* ok */
    }
});

function makeConfig(tmpDir: string): Config {
    return Config.create({ xdgStateHome: tmpDir });
}

describe('saveRunMetrics / loadMetrics', () => {
    it('saves and loads a metrics run', () => {
        const cfg = makeConfig(TMP_DIR);
        const run: MetricsRun = {
            timestamp: '2026-01-01T00:00:00.000Z',
            project: 'test-project',
            total: 3,
            passed: 2,
            failed: 1,
            skipped: 0,
            duration: 5000,
            tests: [
                { title: 'Login', state: 'passed', duration: 1000 },
                { title: 'Logout', state: 'passed', duration: 2000 },
                { title: 'Crash', state: 'failed', duration: 2000 },
            ],
        };

        saveRunMetrics(run, cfg);

        const loaded = loadMetrics(cfg);
        expect(loaded.runs).toHaveLength(1);
        expect(loaded.runs[0]!.project).toBe('test-project');
        expect(loaded.runs[0]!.passed).toBe(2);
        expect(loaded.runs[0]!.tests).toHaveLength(3);
    });

    it('returns empty store when no metrics file exists', () => {
        const cfg = makeConfig(path.join(TMP_DIR, 'nonexistent'));
        const store = loadMetrics(cfg);
        expect(store.runs).toEqual([]);
    });

    it('persists multiple runs', () => {
        const cfg = makeConfig(TMP_DIR);
        saveRunMetrics(
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'run1',
                total: 1,
                passed: 1,
                failed: 0,
                skipped: 0,
                duration: 100,
                tests: [{ title: 'A', state: 'passed', duration: 100 }],
            },
            cfg,
        );
        saveRunMetrics(
            {
                timestamp: '2026-01-02T00:00:00.000Z',
                project: 'run2',
                total: 1,
                passed: 0,
                failed: 1,
                skipped: 0,
                duration: 200,
                tests: [{ title: 'B', state: 'failed', duration: 200 }],
            },
            cfg,
        );

        const loaded = loadMetrics(cfg);
        expect(loaded.runs).toHaveLength(2);
    });
});

describe('saveParseResult', () => {
    it('creates a MetricsRun from a ParseResult and saves it', () => {
        const cfg = makeConfig(TMP_DIR);
        const parseResult: ParseResult = {
            tests: [
                { title: 'Test A', state: 'passed', duration: 500 },
                { title: 'Test B', state: 'failed', duration: 300 },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 800 },
        };

        const run = saveParseResult('my-project', parseResult, cfg);

        expect(run.project).toBe('my-project');
        expect(run.passed).toBe(1);
        expect(run.total).toBe(2);
        expect(run.tests).toHaveLength(2);

        const loaded = loadMetrics(cfg);
        expect(loaded.runs).toHaveLength(1);
    });
});

describe('calculateFlakiness', () => {
    it('returns empty when no runs', () => {
        const store: MetricsStore = { runs: [] };
        expect(calculateFlakiness(store)).toEqual([]);
    });

    it('detects flaky tests across runs', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'p',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 0,
                    tests: [
                        { title: 'FlakyLogin', state: 'passed', duration: 100 },
                        { title: 'AlwaysPass', state: 'passed', duration: 100 },
                    ],
                },
                {
                    timestamp: '2026-01-02T00:00:00.000Z',
                    project: 'p',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 0,
                    tests: [
                        { title: 'FlakyLogin', state: 'failed', duration: 100 },
                        { title: 'AlwaysPass', state: 'passed', duration: 100 },
                    ],
                },
            ],
        };

        const flaky = calculateFlakiness(store);
        expect(flaky).toHaveLength(1);
        expect(flaky[0]!.title).toBe('FlakyLogin');
        expect(flaky[0]!.passCount).toBe(1);
        expect(flaky[0]!.failCount).toBe(1);
        expect(flaky[0]!.rate).toBe(0.5);
    });

    it('ignores tests below minRuns threshold', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'p',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 0,
                    tests: [{ title: 'OnceOnly', state: 'passed', duration: 100 }],
                },
            ],
        };

        expect(calculateFlakiness(store, 2)).toEqual([]);
    });
});

describe('saveCoverageSnapshot', () => {
    it('saves and loads coverage snapshots', () => {
        const cfg = makeConfig(TMP_DIR);
        const snapshot: CoverageSnapshot = {
            timestamp: '2026-01-01T00:00:00.000Z',
            project: 'proj',
            totalIssues: 20,
            mappedIssues: 15,
            coveragePct: 75,
        };

        saveCoverageSnapshot(snapshot, cfg);

        const loaded = loadMetrics(cfg);
        expect(loaded.coverageHistory).toHaveLength(1);
        expect(loaded.coverageHistory![0]!.coveragePct).toBe(75);
    });
});

describe('getTrends', () => {
    it('returns pass rate trend for recent runs', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'p',
                    total: 2,
                    passed: 2,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                },
                {
                    timestamp: '2026-01-02T00:00:00.000Z',
                    project: 'p',
                    total: 2,
                    passed: 0,
                    failed: 2,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                },
            ],
        };

        const trends = getTrends(store);
        expect(trends).toHaveLength(2);
        expect(trends[0]!.passRate).toBe(100);
        expect(trends[1]!.passRate).toBe(0);
    });

    it('respects window parameter', () => {
        const runs: MetricsRun[] = Array.from({ length: 20 }, (_, i) => ({
            timestamp: `2026-01-${i + 1}T00:00:00.000Z`,
            project: 'p',
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }));
        const store: MetricsStore = { runs };

        const trends = getTrends(store, 5);
        expect(trends).toHaveLength(5);
    });
});
