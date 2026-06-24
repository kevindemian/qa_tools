/**
 * Property-Based Tests — Impact Alert (FT-30)
 *
 * Invariants:
 * - analyzePipelineImpact: severity counts match filtered alerts
 * - deduplication by title always holds
 * - critical alert only when passRate < 70 AND coveragePct < 70
 * - 'All clear' only when passRate >= 80 AND coveragePct >= 80
 * - null/undefined passRate or coveragePct returns DEFAULT_RESULT
 * - generateImpactAlertHtml always produces valid HTML
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { analyzePipelineImpact, generateImpactAlertHtml } from '../impact-alert.js';
import type { ImpactAlertResult } from '../impact-alert.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

/* ── Helpers ─────────────────────────────────────────────────── */

const pctArb = fc.integer({ min: 0, max: 100 });
const failingJobsArb = fc.nat({ max: 20 });
const failureListArb = fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 });
const epicListArb = fc.array(fc.string({ minLength: 1, maxLength: 15 }), { maxLength: 10 });

/* ── Tests ───────────────────────────────────────────────────── */

describe('AnalyzePipelineImpact — property-based', () => {
    it('every alert has non-empty title, message, affectedArea and recommendation', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );
                    for (const alert of result.alerts) {
                        expect(alert.title.length).toBeGreaterThan(0);
                        expect(alert.message.length).toBeGreaterThan(0);
                        expect(alert.affectedArea.length).toBeGreaterThan(0);
                        expect(alert.recommendation.length).toBeGreaterThan(0);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('no duplicate alert titles', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );
                    const titles = result.alerts.map((a) => a.title);

                    expect(new Set(titles).size).toBe(titles.length);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('total alerts = criticalCount + warningCount + infoCount', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );

                    expect(result.alerts).toHaveLength(result.criticalCount + result.warningCount + result.infoCount);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('critical alert only when both passRate < 70 and coveragePct < 70', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );
                    const hasCritical = result.alerts.some((a) => a.severity === 'critical');
                    if (passRate < 70 && coveragePct < 70) {
                        expect(hasCritical).toBeTruthy();
                    } else {
                        expect(hasCritical).toBeFalsy();
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('all clear alert only when passRate >= 80 and coveragePct >= 80', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );
                    const hasAllClear = result.alerts.some((a) => a.title === 'All clear');
                    if (passRate >= 80 && coveragePct >= 80) {
                        expect(hasAllClear).toBeTruthy();
                    } else {
                        expect(hasAllClear).toBeFalsy();
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('returns DEFAULT_RESULT for null passRate', () => {
        fc.assert(
            fc.property(
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(null, failingJobs, topFailures, coveragePct, uncoveredEpics);

                    expect(result.alerts).toHaveLength(1);
                    expect(result.alerts[0]?.title).toBe('Insufficient data');
                    expect(result.criticalCount).toBe(0);
                    expect(result.warningCount).toBe(0);
                    expect(result.infoCount).toBe(1);
                },
            ),
            { numRuns: 10 },
        );
    });

    it('returns DEFAULT_RESULT for undefined coveragePct', () => {
        fc.assert(
            fc.property(pctArb, failingJobsArb, failureListArb, (passRate, failingJobs, topFailures) => {
                const result = analyzePipelineImpact(passRate, failingJobs, topFailures, undefined, []);

                expect(result.alerts).toHaveLength(1);
                expect(result.alerts[0]?.title).toBe('Insufficient data');
            }),
            { numRuns: 10 },
        );
    });

    it('warning count > 0 when coverage below 70', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 70, max: 100 }),
                fc.constant(0),
                fc.constant<string[]>([]),
                fc.integer({ min: 0, max: 69 }),
                fc.constant<string[]>([]),
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );

                    expect(result.warningCount).toBeGreaterThanOrEqual(1);
                    expect(result.alerts.some((a) => a.title === 'Coverage below threshold')).toBeTruthy();
                },
            ),
            { numRuns: 50 },
        );
    });

    it('produces valid timestamp', () => {
        fc.assert(
            fc.property(
                pctArb,
                failingJobsArb,
                failureListArb,
                pctArb,
                epicListArb,
                (passRate, failingJobs, topFailures, coveragePct, uncoveredEpics) => {
                    const result = analyzePipelineImpact(
                        passRate,
                        failingJobs,
                        topFailures,
                        coveragePct,
                        uncoveredEpics,
                    );

                    expect(() => new Date(result.timestamp)).not.toThrow();
                    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                },
            ),
            { numRuns: 50 },
        );
    });
});

describe('GenerateImpactAlertHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        severity: fc.constantFrom('critical' as const, 'warning' as const, 'info' as const),
                        title: fc.string({ minLength: 1, maxLength: 20 }),
                        message: fc.string({ minLength: 1, maxLength: 50 }),
                        affectedArea: fc.string({ minLength: 1, maxLength: 20 }),
                        recommendation: fc.string({ minLength: 1, maxLength: 50 }),
                    }),
                    { maxLength: 10 },
                ),
                fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
                (alerts, customTitle) => {
                    const counts = { critical: 0, warning: 0, info: 0 };
                    for (const a of alerts) counts[a.severity]++;
                    const result = {
                        alerts,
                        criticalCount: counts.critical,
                        warningCount: counts.warning,
                        infoCount: counts.info,
                        timestamp: new Date().toISOString(),
                    } satisfies ImpactAlertResult;
                    const html = generateImpactAlertHtml(result, customTitle ?? undefined);

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains summary cards with alert counts', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        severity: fc.constantFrom('critical' as const, 'warning' as const, 'info' as const),
                        title: fc.string({ minLength: 1, maxLength: 20 }),
                        message: fc.string({ minLength: 1, maxLength: 50 }),
                        affectedArea: fc.string({ minLength: 1, maxLength: 20 }),
                        recommendation: fc.string({ minLength: 1, maxLength: 50 }),
                    }),
                    { maxLength: 10 },
                ),
                (alerts) => {
                    const counts = { critical: 0, warning: 0, info: 0 };
                    for (const a of alerts) counts[a.severity]++;
                    const result = {
                        alerts,
                        criticalCount: counts.critical,
                        warningCount: counts.warning,
                        infoCount: counts.info,
                        timestamp: new Date().toISOString(),
                    } satisfies ImpactAlertResult;
                    const html = generateImpactAlertHtml(result);

                    expect(html).toContain('Total Alerts');
                    expect(html).toContain('Critical');
                    expect(html).toContain('Warning');
                    expect(html).toContain('Info');
                    expect(html).toContain(String(result.alerts.length));
                },
            ),
            { numRuns: 50 },
        );
    });

    it('returns error page for null/undefined result', () => {
        fc.assert(
            fc.property(fc.boolean(), () => {
                const html = generateImpactAlertHtml(null);

                expect(html).toContain('Impact Alert Report Error');
            }),
            { numRuns: 10 },
        );
    });
});
