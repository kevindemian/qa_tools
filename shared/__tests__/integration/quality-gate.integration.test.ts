/**
 * Integration tests — Quality Gate (FT-10)
 *
 * Validates the quality gate orchestrator:
 * - runQualityGate with/without metrics data
 * - Pass/fail overall based on threshold combination
 * - Individual checks: health-score, pass-rate, flaky-rate, coverage, suite-speed
 * - Project filtering
 * - formatQualityGateJson / formatQualityGateText output
 *
 * Uses vi.spyOn for loadMetrics (reads from disk) but keeps
 * calculateFlakiness real (pure function, no I/O).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MetricsRun } from '../../metrics.js';
import * as metrics from '../../metrics.js';

async function loadModules() {
    const qg = await import('../../quality-gate.js');
    return {
        runQualityGate: qg.runQualityGate,
        formatQualityGateJson: qg.formatQualityGateJson,
        formatQualityGateText: qg.formatQualityGateText,
    };
}

describe('Integration: Quality Gate', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('FT-10a: runQualityGate without data', () => {
        it('returns fail when no metrics data exists', async () => {
            expect.hasAssertions();

            vi.spyOn(metrics, 'loadMetrics').mockReturnValue({ runs: [] });
            const { runQualityGate } = await loadModules();
            const result = runQualityGate();

            expect(result.overall).toBe('fail');
            expect(result.checks).toHaveLength(1);

            const firstCheck = result.checks[0];

            expect(firstCheck).toBeDefined();
            expect(firstCheck?.name).toBe('metrics-data');
        });
    });

    describe('FT-10b: runQualityGate with good data', () => {
        it('returns pass when metrics are above all thresholds', async () => {
            expect.hasAssertions();

            const runs: MetricsRun[] = Array.from({ length: 15 }, (_, i) => ({
                timestamp: new Date(Date.now() + i * 60000).toISOString(),
                project: 'test-project',
                total: 100,
                passed: 98,
                failed: 1,
                skipped: 1,
                duration: 5000,
                tests: Array.from({ length: 100 }, (_, j) => {
                    let state: 'skipped' | 'passed' | 'failed';
                    if (j === 99) {
                        state = 'skipped';
                    } else if (j === 98) {
                        state = 'failed';
                    } else {
                        state = 'passed';
                    }
                    return {
                        title: `test-${j}`,
                        state,
                        duration: 50,
                    };
                }),
            }));

            vi.spyOn(metrics, 'loadMetrics').mockReturnValue({
                runs,
                coverageHistory: [
                    {
                        timestamp: new Date().toISOString(),
                        project: 'test-project',
                        totalIssues: 100,
                        mappedIssues: 85,
                        coveragePct: 85,
                    },
                ],
            });

            const { runQualityGate } = await loadModules();
            const result = runQualityGate({ project: 'test-project' });

            expect(result.overall).toBe('pass');
            expect(result.checks).toHaveLength(5);
            expect(result.score).toBeGreaterThan(0);
        });
    });

    describe('FT-10c: formatQualityGateJson', () => {
        it('produces valid JSON', async () => {
            expect.hasAssertions();

            const { formatQualityGateJson } = await loadModules();
            const result = { overall: 'pass' as const, checks: [], score: 85 };
            const json = formatQualityGateJson(result);

            expect(JSON.parse(json)).toHaveProperty('overall', 'pass');
        });
    });

    describe('FT-10d: formatQualityGateText', () => {
        it('produces human-readable output', async () => {
            expect.hasAssertions();

            const { formatQualityGateText } = await loadModules();
            const result = {
                overall: 'pass' as const,
                checks: [{ name: 'health-score', status: 'pass' as const, score: 85, threshold: 70, details: 'good' }],
                score: 85,
            };
            const text = formatQualityGateText(result);

            expect(text).toContain('Quality Gate');
            expect(text).toContain('PASS');
            expect(text).toContain('health-score');
        });
    });
});
