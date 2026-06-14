/**
 * Quality gate — health score threshold validation via calculateHealthScore.
 *
 * NOTE: runQualityGate, formatQualityGateJson, formatQualityGateText are tested
 * in shared/quality-gate.test.ts (co-located with source).
 */
import { describe, it, expect } from 'vitest';
import { calculateHealthScore } from '../health-score.js';
import type { MetricsStore } from '../metrics.js';

describe('quality gate thresholds via health score', () => {
    it('quality gate passes with good metrics', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 100,
                    passed: 95,
                    failed: 5,
                    skipped: 0,
                    duration: 1000,
                    tests: Array.from({ length: 100 }, (_, i) => ({
                        title: `t${i}`,
                        state: i < 95 ? 'passed' : 'failed',
                        duration: 10,
                    })),
                },
            ],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 90, coveragePct: 90 },
            ],
        };
        const result = calculateHealthScore(store);
        expect(result.qualityGate).toBe('pass');
    });

    it('quality gate fails with low pass rate', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 100,
                    passed: 70,
                    failed: 30,
                    skipped: 0,
                    duration: 1000,
                    tests: Array.from({ length: 100 }, (_, i) => ({
                        title: `t${i}`,
                        state: i < 70 ? 'passed' : 'failed',
                        duration: 10,
                    })),
                },
            ],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 90, coveragePct: 90 },
            ],
        };
        const result = calculateHealthScore(store);
        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with low coverage', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 100,
                    passed: 95,
                    failed: 5,
                    skipped: 0,
                    duration: 1000,
                    tests: Array.from({ length: 100 }, (_, i) => ({
                        title: `t${i}`,
                        state: i < 95 ? 'passed' : 'failed',
                        duration: 10,
                    })),
                },
            ],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 50, coveragePct: 50 },
            ],
        };
        const result = calculateHealthScore(store);
        expect(result.qualityGate).toBe('fail');
    });

    it('quality gate fails with slow suite', () => {
        const store: MetricsStore = {
            runs: [
                {
                    timestamp: '2026-01-01',
                    project: 'p',
                    total: 10,
                    passed: 10,
                    failed: 0,
                    skipped: 0,
                    duration: 50000,
                    tests: Array.from({ length: 10 }, (_, i) => ({
                        title: `t${i}`,
                        state: 'passed',
                        duration: 5000,
                    })),
                },
            ],
            coverageHistory: [
                { timestamp: '2026-01-01', project: 'p', totalIssues: 100, mappedIssues: 90, coveragePct: 90 },
            ],
        };
        const result = calculateHealthScore(store);
        expect(result.qualityGate).toBe('fail');
    });
});
