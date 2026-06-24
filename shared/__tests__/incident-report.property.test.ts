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
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { buildIncidentReport, generateIncidentReportHtml } from '../incident-report.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

beforeEach(() => {
    vi.restoreAllMocks();
});

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

describe('BuildIncidentReport — property-based', () => {
    it('eventCount always matches events.length', () => {expect.hasAssertions();

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

    it('severity counts are non-negative and within bounds', () => {expect.hasAssertions();

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

                    expect(result.highCount).toBeGreaterThanOrEqual(0);
                    expect(result.mediumCount).toBeGreaterThanOrEqual(0);
                    expect(result.lowCount).toBeGreaterThanOrEqual(0);
                    expect(result.highCount + result.mediumCount + result.lowCount).toBeLessThanOrEqual(
                        result.eventCount,
                    );
                },
            ),
            { numRuns: 50 },
        );
    });

    it('severity count sum matches eventCount', () => {expect.hasAssertions();

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

                    expect(result.highCount + result.mediumCount + result.lowCount).toBe(result.eventCount);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('overallSeverity is consistent with severity counts', () => {expect.hasAssertions();

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

    it('timestamp is valid ISO string', () => {expect.hasAssertions();

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

    it('each event has required fields', () => {expect.hasAssertions();

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
                        expect(typeof event.date).toBe('string');
                        expect(event.date.length).toBeGreaterThan(0);
                        expect(['failure', 'regression', 'coverage_gap', 'seasonality']).toContain(event.type);
                        expect(['high', 'medium', 'low']).toContain(event.severity);
                        expect(typeof event.title).toBe('string');
                        expect(event.title.length).toBeGreaterThan(0);
                        expect(typeof event.description).toBe('string');
                        expect(event.description.length).toBeGreaterThan(0);
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('high severity events precede medium which precede low', () => {expect.hasAssertions();

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
                    let sawMedium = false;
                    let sawLow = false;
                    for (const event of result.events) {
                        if (event.severity === 'low') sawLow = true;
                        if (event.severity === 'medium') {
                            expect(sawLow).toBeFalsy();

                            sawMedium = true;
                        }
                        if (event.severity === 'high') {
                            expect(sawMedium).toBeFalsy();
                            expect(sawLow).toBeFalsy();
                        }
                    }
                },
            ),
            { numRuns: 50 },
        );
    });
});

describe('GenerateIncidentReportHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {expect.hasAssertions();

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

    it('contains severity badge and summary', () => {expect.hasAssertions();

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
