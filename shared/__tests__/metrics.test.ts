/**
 * Metrics unit tests — validates unified metric calculations.
 *
 * Covers:
 * - Pass rate denominator consistency (excludes skipped)
 * - Flaky rate unified implementation
 * - Coverage history preservation
 * - Edge cases: 100% skipped, 0 executed, 1 test, threshold boundaries
 */
import { describe, it, expect } from 'vitest';
import { calculateFlakiness, calculateFlakyRate, getTrends } from '../metrics.js';
import type { MetricsStore } from '../metrics.js';

describe('calculateFlakyRate — unified implementation', () => {
    it('returns 0 when no tests', () => {
        const store: MetricsStore = { runs: [] };
        expect(calculateFlakyRate(store)).toBe(0);
    });

    it('returns 0 when all tests pass consistently', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 100,
                    tests: [{ title: 't1', state: 'passed', duration: 10 }],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 100,
                    tests: [{ title: 't1', state: 'passed', duration: 10 }],
                },
            ],
        };
        expect(calculateFlakyRate(store, 2)).toBe(0);
    });

    it('detects flaky test (both pass and fail)', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'passed', duration: 10 }],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'failed', duration: 10 }],
                },
            ],
        };
        expect(calculateFlakyRate(store, 2)).toBe(100);
    });

    it('excludes skipped tests from denominator', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 3,
                    passed: 1,
                    failed: 0,
                    skipped: 2,
                    duration: 10,
                    tests: [
                        { title: 'passer', state: 'passed', duration: 10 },
                        { title: 'skip1', state: 'skipped', duration: 0 },
                        { title: 'skip2', state: 'skipped', duration: 0 },
                    ],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 3,
                    passed: 1,
                    failed: 0,
                    skipped: 2,
                    duration: 10,
                    tests: [
                        { title: 'passer', state: 'passed', duration: 10 },
                        { title: 'skip1', state: 'skipped', duration: 0 },
                        { title: 'skip2', state: 'skipped', duration: 0 },
                    ],
                },
            ],
        };
        // 1 test (passer) has 2 appearances, 0 flaky → 0%
        expect(calculateFlakyRate(store, 2)).toBe(0);
    });

    it('respects minRuns threshold', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 't1', state: 'passed', duration: 10 }],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 't1', state: 'failed', duration: 10 }],
                },
            ],
        };
        // With minRuns=3, test with 2 appearances is excluded
        expect(calculateFlakyRate(store, 3)).toBe(0);
        // With minRuns=2, test is included
        expect(calculateFlakyRate(store, 2)).toBe(100);
    });

    it('handles 100% skipped scenario', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 3,
                    passed: 0,
                    failed: 0,
                    skipped: 3,
                    duration: 10,
                    tests: [
                        { title: 's1', state: 'skipped', duration: 0 },
                        { title: 's2', state: 'skipped', duration: 0 },
                        { title: 's3', state: 'skipped', duration: 0 },
                    ],
                },
            ],
        };
        expect(calculateFlakyRate(store, 2)).toBe(0);
    });

    it('handles 0 executed tests', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 0,
                    passed: 0,
                    failed: 0,
                    skipped: 0,
                    duration: 0,
                    tests: [],
                },
            ],
        };
        expect(calculateFlakyRate(store, 2)).toBe(0);
    });

    it('returns intermediate value when mix of flaky and stable tests', () => {
        // 1 flaky + 1 stable, both meet minRuns=2 → rate = 1/2 * 100 = 50
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [
                        { title: 'stable', state: 'passed', duration: 10 },
                        { title: 'flaky', state: 'passed', duration: 10 },
                    ],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 2,
                    passed: 1,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [
                        { title: 'stable', state: 'passed', duration: 10 },
                        { title: 'flaky', state: 'failed', duration: 10, error: 'err' },
                    ],
                },
            ],
        };
        expect(calculateFlakyRate(store, 2)).toBe(50);
    });

    it('handles 1 single test', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'only', state: 'passed', duration: 10 }],
                },
            ],
        };
        // 1 test with 1 appearance, minRuns=2 → excluded
        expect(calculateFlakyRate(store, 2)).toBe(0);
    });
});

describe('getTrends — pass rate excludes skipped', () => {
    it('returns empty array for empty store', () => {
        const store: MetricsStore = { runs: [] };
        expect(getTrends(store)).toEqual([]);
    });

    it('calculates pass rate as passed/(passed+failed)', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00Z',
                    project: 'p',
                    total: 100,
                    passed: 80,
                    failed: 10,
                    skipped: 10,
                    duration: 1000,
                    tests: [],
                },
            ],
        };
        const trends = getTrends(store);
        expect(trends[0]?.passRate).toBeCloseTo(88.89, 1); // 80/(80+10)*100
    });

    it('returns 0% when 0 executed', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01T00:00:00Z',
                    project: 'p',
                    total: 10,
                    passed: 0,
                    failed: 0,
                    skipped: 10,
                    duration: 100,
                    tests: [],
                },
            ],
        };
        const trends = getTrends(store);
        expect(trends[0]?.passRate).toBe(0);
    });
});

describe('calculateFlakiness — display function (kept for backward compat)', () => {
    it('returns entries with rate >= threshold', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 1,
                    passed: 1,
                    failed: 0,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'passed', duration: 10 }],
                },
                {
                    timestamp: '2026-01-02',
                    project: 'p',
                    total: 1,
                    passed: 0,
                    failed: 1,
                    skipped: 0,
                    duration: 10,
                    tests: [{ title: 'flaky', state: 'failed', duration: 10 }],
                },
            ],
        };
        const entries = calculateFlakiness(store, 2);
        expect(entries.length).toBe(1);
        expect(entries[0]?.rate).toBe(0.5); // 1 fail / 2 total
    });
});
