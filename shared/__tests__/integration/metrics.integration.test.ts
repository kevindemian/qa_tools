/**
 * Integration tests — Metrics Store (FT-04)
 *
 * Validates the full metrics persistence lifecycle:
 * - loadMetrics / saveMetrics round-trip
 * - saveParseResult creates MetricsRun from ParseResult
 * - saveRunMetrics respects METRICS_MAX_RUNS limit
 * - calculateFlakiness identifies flaky tests
 * - calculateFlakyRate returns correct percentage
 * - getTrends returns correct pass rates
 * - saveCoverageSnapshot persists coverage history
 *
 * Uses FsStoreBackend with isolated temp directories.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Config from '../../config.js';
import { rootLogger } from '../../logger.js';
import { createMetricsRunFixture, createCoverageSnapshotFixture } from './integration-helpers.js';

let TEST_DIR: string;

function getConfig() {
    return Config.create({ xdgStateHome: TEST_DIR, METRICS_MAX_RUNS: 50 });
}

describe('Integration: Metrics Store', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-metrics-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        } catch (err) {
            rootLogger.warn('Integration metrics cleanup: ' + (err instanceof Error ? err.message : String(err)));
        }
    });

    describe('FT-04a: saveMetrics and loadMetrics round-trip', () => {
        it('persists empty store and reloads', async () => {
            const { saveMetrics, loadMetrics } = await import('../../metrics.js');
            const config = getConfig();
            const store = { runs: [] };

            saveMetrics(store, config);
            const loaded = loadMetrics(config);

            expect(loaded.runs).toEqual([]);
        });

        it('persists store with runs and reloads', async () => {
            const { saveMetrics, loadMetrics } = await import('../../metrics.js');
            const config = getConfig();
            const store = { runs: [createMetricsRunFixture()] };

            saveMetrics(store, config);
            const loaded = loadMetrics(config);

            expect(loaded.runs).toHaveLength(1);

            const firstRun = loaded.runs[0];

            expect(firstRun).toBeDefined();

            const firstRunData = firstRun as { project: string; total: number; tests: unknown[] };

            expect(firstRunData.project).toBe('test-project');
            expect(firstRunData.total).toBe(100);
        });

        it('returns empty store when no data saved', async () => {
            const { loadMetrics } = await import('../../metrics.js');
            const config = getConfig();
            const loaded = loadMetrics(config);

            expect(loaded.runs).toEqual([]);
        });
    });

    describe('FT-04b: saveParseResult creates MetricsRun', () => {
        it('creates run from ParseResult and persists', async () => {
            const { saveParseResult, loadMetrics } = await import('../../metrics.js');
            const config = getConfig();
            const parseResult = {
                stats: { total: 50, passed: 45, failed: 3, skipped: 2, duration: 8000 },
                tests: [
                    { title: 'test1', state: 'passed' as const, duration: 100 },
                    { title: 'test2', state: 'failed' as const, duration: 200, error: 'fail' },
                ],
            };

            const run = saveParseResult('my-project', parseResult, config);

            expect(run.project).toBe('my-project');
            expect(run.total).toBe(50);
            expect(run.passed).toBe(45);
            expect(run.failed).toBe(3);

            const loaded = loadMetrics(config);

            expect(loaded.runs).toHaveLength(1);

            const firstRun = loaded.runs[0];

            expect(firstRun).toBeDefined();
            expect((firstRun as { tests: unknown[] }).tests).toHaveLength(2);
        });
    });

    describe('FT-04c: saveRunMetrics respects MAX_RUNS', () => {
        it('trims oldest runs when exceeding limit', async () => {
            const { saveRunMetrics, loadMetrics } = await import('../../metrics.js');
            const config = getConfig();

            for (let i = 0; i < 55; i++) {
                saveRunMetrics(
                    createMetricsRunFixture({ timestamp: new Date(Date.now() + i * 1000).toISOString() }),
                    config,
                );
            }

            const loaded = loadMetrics(config);

            expect(loaded.runs.length).toBeLessThanOrEqual(50);
            expect(loaded.runs.length).toBeGreaterThan(0);
        });
    });

    describe('FT-04d: calculateFlakiness', () => {
        it('identifies flaky tests across runs', async () => {
            const { calculateFlakiness } = await import('../../metrics.js');
            const store = {
                runs: [
                    createMetricsRunFixture({
                        tests: [
                            { title: 'flaky-test', state: 'passed', duration: 100 },
                            { title: 'stable-test', state: 'passed', duration: 50 },
                        ],
                    }),
                    createMetricsRunFixture({
                        tests: [
                            { title: 'flaky-test', state: 'failed', duration: 100, error: 'flaky' },
                            { title: 'stable-test', state: 'passed', duration: 50 },
                        ],
                    }),
                    createMetricsRunFixture({
                        tests: [
                            { title: 'flaky-test', state: 'passed', duration: 100 },
                            { title: 'stable-test', state: 'passed', duration: 50 },
                        ],
                    }),
                ],
            };

            const flaky = calculateFlakiness(store, 2);
            const flakyTest = flaky.find((f) => f.title === 'flaky-test');
            const stableTest = flaky.find((f) => f.title === 'stable-test');

            expect(flakyTest).toBeDefined();
            expect(flakyTest?.failCount).toBe(1);
            expect(flakyTest?.passCount).toBe(2);
            expect(stableTest).toBeUndefined();
        });
    });

    describe('FT-04e: calculateFlakyRate', () => {
        it('returns 0 when no flaky tests', async () => {
            const { calculateFlakyRate } = await import('../../metrics.js');
            const store = {
                runs: [
                    createMetricsRunFixture({
                        tests: [{ title: 'stable', state: 'passed', duration: 50 }],
                    }),
                ],
            };

            expect(calculateFlakyRate(store)).toBe(0);
        });

        it('calculates percentage of flaky tests', async () => {
            const { calculateFlakyRate } = await import('../../metrics.js');
            const store = {
                runs: [
                    createMetricsRunFixture({
                        tests: [
                            { title: 'flaky1', state: 'passed', duration: 100 },
                            { title: 'flaky2', state: 'passed', duration: 100 },
                            { title: 'stable', state: 'passed', duration: 50 },
                        ],
                    }),
                    createMetricsRunFixture({
                        tests: [
                            { title: 'flaky1', state: 'failed', duration: 100, error: 'flaky' },
                            { title: 'flaky2', state: 'failed', duration: 100, error: 'flaky' },
                            { title: 'stable', state: 'passed', duration: 50 },
                        ],
                    }),
                ],
            };
            const rate = calculateFlakyRate(store, 2);

            expect(rate).toBeGreaterThan(0);
        });
    });

    describe('FT-04f: getTrends', () => {
        it('returns pass rate trend data', async () => {
            const { getTrends } = await import('../../metrics.js');
            const store = {
                runs: [
                    createMetricsRunFixture({ passed: 80, failed: 20, total: 100, timestamp: '2026-01-01T00:00:00Z' }),
                    createMetricsRunFixture({ passed: 90, failed: 10, total: 100, timestamp: '2026-01-02T00:00:00Z' }),
                ],
            };

            const trends = getTrends(store, 10);

            expect(trends).toHaveLength(2);

            const firstTrend = trends[0];
            const secondTrend = trends[1];

            expect(firstTrend).toBeDefined();
            expect(secondTrend).toBeDefined();
            expect((firstTrend as { passRate: number; failed: number }).passRate).toBeCloseTo(80);
            expect((secondTrend as { passRate: number }).passRate).toBeCloseTo(90);
            expect((firstTrend as { passRate: number; failed: number }).failed).toBe(20);
        });
    });

    describe('FT-04g: saveCoverageSnapshot', () => {
        it('persists coverage snapshot to history', async () => {
            const { saveCoverageSnapshot, loadMetrics } = await import('../../metrics.js');
            const config = getConfig();

            saveCoverageSnapshot(createCoverageSnapshotFixture({ coveragePct: 85 }), config);
            saveCoverageSnapshot(createCoverageSnapshotFixture({ coveragePct: 92 }), config);

            const loaded = loadMetrics(config);

            expect(loaded.coverageHistory).toBeDefined();
            expect(loaded.coverageHistory).toHaveLength(2);

            const coverageHistory = loaded.coverageHistory as Array<{ coveragePct: number }>;
            const first = coverageHistory[0] as { coveragePct: number };
            const second = coverageHistory[1] as { coveragePct: number };

            expect(first.coveragePct).toBe(85);
            expect(second.coveragePct).toBe(92);
        });
    });
});
