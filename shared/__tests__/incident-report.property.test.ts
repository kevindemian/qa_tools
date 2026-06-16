/**
 * Property-Based Tests — Incident Investigation Report (FT-31)
 *
 * Invariants:
 * - buildIncidentReport always returns correct counts and consistent severity
 * - eventCount matches events.length
 * - Severity counts reflect actual events
 * - overallSeverity is consistent with severity counts
 * - Timestamp is valid ISO
 * - generateIncidentReportHtml always produces valid HTML
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildIncidentReport, generateIncidentReportHtml } from '../incident-report.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

const FailRateArb = fc.option(
    fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true }).map((n) => Math.round(n * 10) / 10),
    { nil: null },
);
const PassRateArb = fc.option(
    fc.float({ min: 0, max: 100, noDefaultInfinity: true, noNaN: true }).map((n) => Math.round(n * 10) / 10),
    { nil: null },
);
const RegressionCountArb = fc.nat({ max: 20 });
const SeasonalityPeakArb = fc.constantFrom('N/A', 'January', 'February', 'March', 'April', 'May', 'June Peak');
const UncoveredEpicsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.length > 0),
    {
        minLength: 0,
        maxLength: 5,
    },
);

describe('buildIncidentReport — property-based', () => {
    it('eventCount always matches events.length', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    expect(result.eventCount).toBe(result.events.length);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('severity counts match actual events', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    const expectedHigh = result.events.filter((e) => e.severity === 'high').length;
                    const expectedMedium = result.events.filter((e) => e.severity === 'medium').length;
                    const expectedLow = result.events.filter((e) => e.severity === 'low').length;

                    expect(result.highCount).toBe(expectedHigh);
                    expect(result.mediumCount).toBe(expectedMedium);
                    expect(result.lowCount).toBe(expectedLow);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('overallSeverity is consistent with severity counts', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );

                    if (result.highCount > 0) {
                        expect(result.overallSeverity).toBe('high');
                    } else if (result.mediumCount > 0) {
                        expect(result.overallSeverity).toBe('medium');
                    } else if (result.lowCount > 0) {
                        expect(result.overallSeverity).toBe('low');
                    } else {
                        expect(result.overallSeverity).toBe('none');
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('timestamp is valid ISO string', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('each event has required fields', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    for (const event of result.events) {
                        expect(event.date).toBeTruthy();
                        expect(['failure', 'regression', 'coverage_gap', 'seasonality']).toContain(event.type);
                        expect(['high', 'medium', 'low']).toContain(event.severity);
                        expect(event.title).toBeTruthy();
                        expect(event.description).toBeTruthy();
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('events are sorted by severity then type', () => {
        const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const typeRank: Record<string, number> = { failure: 0, regression: 1, coverage_gap: 2, seasonality: 3 };

        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const result = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    for (let i = 1; i < result.events.length; i++) {
                        const prev = result.events[i - 1];
                        const curr = result.events[i];
                        if (curr === undefined || prev === undefined) return;
                        const prevRank = severityRank[prev.severity] ?? 99;
                        const currRank = severityRank[curr.severity] ?? 99;
                        if (prevRank === currRank) {
                            expect((typeRank[prev.type] ?? 99) <= (typeRank[curr.type] ?? 99)).toBe(true);
                        } else {
                            expect(prevRank < currRank).toBe(true);
                        }
                    }
                },
            ),
            { numRuns: 50 },
        );
    });
});

describe('generateIncidentReportHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const report = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    const html = generateIncidentReportHtml(report);
                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains severity badge and summary', () => {
        fc.assert(
            fc.property(
                FailRateArb,
                RegressionCountArb,
                SeasonalityPeakArb,
                UncoveredEpicsArb,
                PassRateArb,
                (failRate, regressionCount, seasonalityPeak, uncoveredEpics, passRate) => {
                    const report = buildIncidentReport(
                        failRate,
                        regressionCount,
                        seasonalityPeak,
                        uncoveredEpics,
                        passRate,
                    );
                    const html = generateIncidentReportHtml(report);
                    expect(html).toContain('Overall Severity');
                    expect(html).toContain(report.summary);
                },
            ),
            { numRuns: 50 },
        );
    });
});
