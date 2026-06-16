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

describe('compareAiVsManual — property-based', () => {
    it('total counts match record filtering', () => {
        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 20 }), (records) => {
                const result = compareAiVsManual(records);
                const aiCount = records.filter((r) => r.generatedBy === 'ai').length;
                const manualCount = records.filter((r) => r.generatedBy === 'manual').length;
                expect(result.aiTotal).toBe(aiCount);
                expect(result.manualTotal).toBe(manualCount);
            }),
            { numRuns: 50 },
        );
    });

    it('aiAdvantage is consistent with computed values', () => {
        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 20 }), (records) => {
                const result = compareAiVsManual(records);
                const aiRecords = records.filter((r) => r.generatedBy === 'ai');
                const manualRecords = records.filter((r) => r.generatedBy === 'manual');
                if (aiRecords.length > 0 && manualRecords.length > 0) {
                    const aiPassed = aiRecords.filter((r) => r.passed).length;
                    const manualPassed = manualRecords.filter((r) => r.passed).length;
                    const aiPassRate = Math.round((aiPassed / aiRecords.length) * 100);
                    const manualPassRate = Math.round((manualPassed / manualRecords.length) * 100);
                    const aiFlakinessAvg = aiRecords.reduce((s, r) => s + r.flakiness, 0) / aiRecords.length;
                    const manualFlakinessAvg =
                        manualRecords.reduce((s, r) => s + r.flakiness, 0) / manualRecords.length;
                    if (aiPassRate > manualPassRate) {
                        expect(result.aiAdvantage).toBe('pass_rate');
                    } else if (aiFlakinessAvg < manualFlakinessAvg) {
                        expect(result.aiAdvantage).toBe('flakiness');
                    } else {
                        expect(result.aiAdvantage).toBe('none');
                    }
                } else {
                    expect(result.aiAdvantage).toBe('none');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('byVersion counts sum to aiTotal', () => {
        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 20 }), (records) => {
                const result = compareAiVsManual(records);
                const sum = result.byVersion.reduce((s, v) => s + v.count, 0);
                const expectedAi = records.filter((r) => r.generatedBy === 'ai').length;
                expect(sum).toBe(expectedAi);
            }),
            { numRuns: 50 },
        );
    });

    it('pass rate is 0 when no records in group', () => {
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
});

describe('generateAiComparisonHtml — property-based', () => {
    it('always produces valid HTML', () => {
        fc.assert(
            fc.property(fc.array(recordArb, { minLength: 0, maxLength: 10 }), (records) => {
                const result = compareAiVsManual(records);
                const html = generateAiComparisonHtml(result, 'PBT');
                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('contains pass rate values', () => {
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
});
