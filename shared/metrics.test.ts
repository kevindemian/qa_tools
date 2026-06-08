import { vi, describe, expect, it, beforeEach } from 'vitest';
import path from 'path';

vi.mock('fs', async () => {
    const memfs = await import('memfs');
    const mfs = memfs.fs;
    return { default: mfs, ...mfs };
});

import fs from 'fs';

import {
    loadMetrics,
    saveRunMetrics,
    saveParseResult,
    saveCoverageSnapshot,
    calculateFlakiness,
    getTrends,
} from './metrics.js';
import Config from './config.js';
import type { MetricsRun, MetricsStore, CoverageSnapshot } from './metrics.js';
import type { ParseResult } from './result_parser.js';
import { nonNull } from './test-utils.js';

const TMP_DIR = '/tmp/test-metrics';

beforeEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
});

function makeConfig(tmpDir: string): Config {
    return Config.create({ xdgStateHome: tmpDir });
}

describe('saveRunMetrics / loadMetrics', () => {
    it('saves and loads a metrics run', async () => {
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
        expect(nonNull(loaded.runs[0]).project).toBe('test-project');
        expect(nonNull(loaded.runs[0]).passed).toBe(2);
        expect(nonNull(loaded.runs[0]).tests).toHaveLength(3);
    });

    it('returns empty store when no metrics file exists', async () => {
        const cfg = makeConfig(path.join(TMP_DIR, 'nonexistent'));
        const store = loadMetrics(cfg);
        expect(store.runs).toEqual([]);
    });

    it('returns empty store on corrupted JSON', async () => {
        const cfg = makeConfig(TMP_DIR);
        const dir = path.join(TMP_DIR, 'qa-tools', 'metrics');
        fs.mkdirSync(dir, { recursive: true });
        const sp = path.join(dir, 'metrics.json');
        fs.writeFileSync(sp, 'not valid json{{{');
        const store = loadMetrics(cfg);
        expect(store.runs).toEqual([]);
    });

    it('persists multiple runs', async () => {
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
    it('creates a MetricsRun from a ParseResult and saves it', async () => {
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
    it('returns empty when no runs', async () => {
        const store: MetricsStore = { runs: [] };
        expect(calculateFlakiness(store)).toEqual([]);
    });

    it('detects flaky tests across runs', async () => {
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
        expect(nonNull(flaky[0]).title).toBe('FlakyLogin');
        expect(nonNull(flaky[0]).passCount).toBe(1);
        expect(nonNull(flaky[0]).failCount).toBe(1);
        expect(nonNull(flaky[0]).rate).toBe(0.5);
    });

    it('handles skipped test state', async () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 0,
                    skipped: 1,
                    duration: 0,
                    tests: [{ title: 'Skippy', state: 'skipped', duration: 0 }],
                },
            ],
        };
        const flaky = calculateFlakiness(store);
        expect(flaky).toHaveLength(0);
    });

    it('handles test with pass and fail in different runs', async () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00.000Z',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 0,
                    tests: [{ title: 'T', state: 'failed', duration: 100 }],
                },
                {
                    timestamp: '2026-01-02T00:00:00.000Z',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [{ title: 'T', state: 'passed', duration: 100 }],
                },
            ],
        };
        const flaky = calculateFlakiness(store);
        expect(flaky).toHaveLength(1);
        expect(nonNull(flaky[0]).failCount).toBe(1);
        expect(nonNull(flaky[0]).passCount).toBe(1);
    });

    it('ignores tests below minRuns threshold', async () => {
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
    it('saves and loads coverage snapshots', async () => {
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
        expect(nonNull(nonNull(loaded.coverageHistory)[0]).coveragePct).toBe(75);
    });
});

describe('getTrends', () => {
    it('returns pass rate trend for recent runs', async () => {
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
        expect(nonNull(trends[0]).passRate).toBe(100);
        expect(nonNull(trends[1]).passRate).toBe(0);
    });

    it('respects window parameter', async () => {
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

describe('edge cases', () => {
    it('handles ensureDir mkdir failure gracefully', async () => {
        const cfg = makeConfig(TMP_DIR);
        const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
            throw new Error('EACCES');
        });
        try {
            const store = loadMetrics(cfg);
            expect(store.runs).toEqual([]);
        } finally {
            mkdirSpy.mockRestore();
        }
    });

    it('handles saveMetrics write failure gracefully', async () => {
        const cfg = makeConfig(TMP_DIR);
        const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
            throw new Error('ENOSPC');
        });
        try {
            const run: MetricsRun = {
                timestamp: '2026-01-01T00:00:00.000Z',
                project: 'fail-project',
                total: 1,
                passed: 1,
                failed: 0,
                skipped: 0,
                duration: 100,
                tests: [{ title: 'T1', state: 'passed', duration: 100 }],
            };
            expect(() => saveRunMetrics(run, cfg)).not.toThrow();
        } finally {
            writeSpy.mockRestore();
        }
    });

    it('prunes runs when exceeding max', async () => {
        const cfg = makeConfig(TMP_DIR);
        (cfg as unknown as { overrides: Record<string, string> }).overrides = { METRICS_MAX_RUNS: '1' };
        const run: MetricsRun = {
            timestamp: '2026-01-01T00:00:00.000Z',
            project: 'prune-test',
            total: 1,
            passed: 1,
            failed: 0,
            skipped: 0,
            duration: 100,
            tests: [{ title: 'T1', state: 'passed', duration: 100 }],
        };
        saveRunMetrics(run, cfg);
        saveRunMetrics(run, cfg);
        const loaded = loadMetrics(cfg);
        expect(loaded.runs.length).toBe(1);
    });
});
