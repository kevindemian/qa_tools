import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { detectSilentRegression, generateSilentRegressionHtml } from '../silent-regression.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const nonNegativeArb = fc.float({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true });
const durationArb = fc.array(nonNegativeArb, { minLength: 3, maxLength: 10 });

const historyArb: fc.Arbitrary<Record<string, number[]>> = fc
    .array(fc.tuple(fc.string({ minLength: 1, maxLength: 10 }), durationArb), { minLength: 0, maxLength: 5 })
    .map((entries) => {
        const obj: Record<string, number[]> = {};
        for (const [name, durations] of entries) {
            obj[name.replace(/[^a-zA-Z0-9_]/g, '_')] = durations;
        }
        return obj;
    });

describe('DetectSilentRegression — property-based invariants', () => {
    it('totalTests equals number of histories with >= 2 durations', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                const expected = Object.values(histories).filter((d) => d.length >= 2).length;

                expect(result.totalTests).toBe(expected);
            }),
            { numRuns: 50 },
        );
    });

    it('regression entries are subset of tests with >= 2 durations', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                const eligibleTitles = Object.entries(histories)
                    .filter(([, d]) => d.length >= 2)
                    .map(([t]) => t);
                for (const reg of result.regressions) {
                    expect(eligibleTitles).toContain(reg.title);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('z-score is a finite number', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                for (const reg of result.regressions) {
                    expect(Number.isFinite(reg.zScore)).toBeTruthy();
                }
            }),
            { numRuns: 50 },
        );
    });

    it('severity matches z-score range', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                for (const reg of result.regressions) {
                    if (reg.zScore > 5) expect(reg.severity).toBe('critical');
                    else if (reg.zScore > 3) expect(reg.severity).toBe('high');
                    else if (reg.zScore > 2) expect(reg.severity).toBe('medium');
                    else if (reg.zScore > 1) expect(reg.severity).toBe('low');
                    else expect(reg.severity).toBe('none');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('threshold is always 2 by default', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);

                expect(result.threshold).toBe(2);
            }),
            { numRuns: 50 },
        );
    });

    it('generateSilentRegressionHtml produces valid HTML structure', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                const html = generateSilentRegressionHtml(result);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('hist entries have previousDurations matching input sans last', () => {
        fc.assert(
            fc.property(historyArb, (histories) => {
                const result = detectSilentRegression(histories);
                for (const reg of result.regressions) {
                    const inputDurations = histories[reg.title];
                    if (inputDurations === undefined) continue;

                    expect(reg.previousDurations).toEqual(inputDurations.slice(0, -1));
                }
            }),
            { numRuns: 50 },
        );
    });
});
