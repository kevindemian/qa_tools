import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { compareAiVsManual, generateAiComparisonHtml } from '../ai-comparison.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const recordArb = fc.record({
    testTitle: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,20}$/),
    generatedBy: fc.constantFrom('ai' as const, 'manual' as const),
    accepted: fc.boolean(),
    passed: fc.boolean(),
    duration: fc.integer({ min: 0, max: 60000 }),
    flakiness: fc.float({ min: 0, max: 1 }),
    promptVersion: fc.stringMatching(/^[a-zA-Z0-9._-]{0,10}$/),
});

const recordsArb = fc.array(recordArb, { minLength: 0, maxLength: 20 });

describe('CompareAiVsManual — property-based', () => {
    it('total counts match record filtering', () => {expect.hasAssertions();

        fc.assert(
            fc.property(recordsArb, (records) => {
                const result = compareAiVsManual(records);
                const aiCount = records.filter((r) => r.generatedBy === 'ai').length;
                const manualCount = records.filter((r) => r.generatedBy === 'manual').length;

                expect(result.aiTotal).toBe(aiCount);
                expect(result.manualTotal).toBe(manualCount);
            }),
            { numRuns: 50 },
        );
    });

    it('aiAdvantage postconditions hold for all inputs', () => {expect.hasAssertions();

        fc.assert(
            fc.property(recordsArb, (records) => {
                const result = compareAiVsManual(records);

                expect(['pass_rate', 'flakiness', 'none']).toContain(result.aiAdvantage);

                if (result.aiAdvantage === 'pass_rate') {
                    expect(result.aiPassRate).toBeGreaterThan(result.manualPassRate);
                } else if (result.aiAdvantage === 'flakiness') {
                    expect(result.aiFlakinessAvg).toBeLessThan(result.manualFlakinessAvg);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('byVersion counts sum to aiTotal', () => {expect.hasAssertions();

        fc.assert(
            fc.property(recordsArb, (records) => {
                const result = compareAiVsManual(records);
                const sum = result.byVersion.reduce((s, v) => s + v.count, 0);
                const expectedAi = records.filter((r) => r.generatedBy === 'ai').length;

                expect(sum).toBe(expectedAi);
            }),
            { numRuns: 50 },
        );
    });

    it('pass rate is 0 when no records in group', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 5 }), (records) => {
                const result = compareAiVsManual(records);
                const hasAi = records.some((r) => r.generatedBy === 'ai');
                const hasManual = records.some((r) => r.generatedBy === 'manual');
                if (!hasAi) expect(result.aiPassRate).toBe(0);
                if (!hasManual) {
                    expect(result.manualPassRate).toBe(0);
                    expect(result.manualFlakinessAvg).toBe(0);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('acceptance rate matches AI accepted / AI total', () => {expect.hasAssertions();

        fc.assert(
            fc.property(recordsArb, (records) => {
                const result = compareAiVsManual(records);
                const aiRecords = records.filter((r) => r.generatedBy === 'ai');
                const aiAccepted = aiRecords.filter((r) => r.accepted).length;
                const expected = aiRecords.length > 0 ? aiAccepted / aiRecords.length : 0;

                expect(result.aiAcceptanceRate).toBe(expected);
                expect(result.manualAcceptanceRate).toBe(1);
            }),
            { numRuns: 50 },
        );
    });

    it('timestamp is valid ISO format', () => {expect.hasAssertions();

        fc.assert(
            fc.property(recordsArb, (records) => {
                const result = compareAiVsManual(records);

                expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            }),
            { numRuns: 50 },
        );
    });
});

describe('GenerateAiComparisonHtml — property-based', () => {
    it('structural HTML invariants for all valid inputs', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 10 }), fc.string(), (records, title) => {
                const result = compareAiVsManual(records);
                const html = generateAiComparisonHtml(result, title);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('<html');
                expect(html).toContain('</html>');
                expect(html).toContain('<head>');
                expect(html).toContain('</head>');
                expect(html).toContain('<body>');
                expect(html).toContain('</body>');
                expect(html).toContain('prefers-color-scheme');
                expect(html).toContain('--color-surface-page');
                expect(html).toContain('html.dark');
            }),
            { numRuns: 50 },
        );
    });

    it('contains metric-card and badge components for non-empty data', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 1, maxLength: 10 }), (records) => {
                const result = compareAiVsManual(records);
                const html = generateAiComparisonHtml(result);
                if (result.aiTotal > 0 || result.manualTotal > 0) {
                    expect(html).toContain('data-component="metric-card"');
                    expect(html).toContain('data-component="badge"');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('contains pass rate values', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 1, maxLength: 10 }), (records) => {
                const result = compareAiVsManual(records);
                const html = generateAiComparisonHtml(result);

                expect(html).toContain(`${result.aiPassRate}%`);
                expect(html).toContain(`${result.manualPassRate}%`);
            }),
            { numRuns: 50 },
        );
    });

    it('shows no-data message when both groups empty', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 0 }), (records) => {
                const result = compareAiVsManual(records);
                const html = generateAiComparisonHtml(result);

                expect(html).toContain('No comparison data available.');
                expect(html).not.toContain('data-component="metric-card"');
            }),
            { numRuns: 10 },
        );
    });
});
