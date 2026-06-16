import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { computeAiEffectiveness, generateAiEffectivenessHtml } from '../ai-effectiveness.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const dateStringArb = fc.integer({ min: 0, max: 365 * 5 }).map((d) => {
    const date = new Date('2024-01-01');
    date.setDate(date.getDate() + d);
    return date.toISOString();
});

const recordArb = fc.record({
    timestamp: dateStringArb,
    promptVersion: fc.stringMatching(/^v?[a-zA-Z0-9._-]{1,10}$/),
    testTitle: fc.stringMatching(/^[a-zA-Z0-9 _-]{1,30}$/),
    accepted: fc.boolean(),
});

const storeArb = fc.record({
    records: fc.array(recordArb, { minLength: 0, maxLength: 20 }),
});

describe('computeAiEffectiveness — property-based', () => {
    it('acceptance rate matches the math', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const total = store.records.length;
                const accepted = store.records.filter((r) => r.accepted).length;
                const expectedRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
                expect(result.acceptanceRate).toBe(expectedRate);
            }),
            { numRuns: 50 },
        );
    });

    it('totalRecords matches store size', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                expect(result.totalRecords).toBe(store.records.length);
                expect(result.totalGenerated).toBe(store.records.length);
            }),
            { numRuns: 50 },
        );
    });

    it('byVersion counts sum to total', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const sum = result.byVersion.reduce((s, v) => s + v.count, 0);
                expect(sum).toBe(store.records.length);
            }),
            { numRuns: 50 },
        );
    });

    it('trend generated sum matches total', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const sum = result.trend.reduce((s, d) => s + d.generated, 0);
                expect(sum).toBe(store.records.length);
            }),
            { numRuns: 50 },
        );
    });

    it('trend is sorted by date', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                for (let i = 1; i < result.trend.length; i++) {
                    const curr = result.trend[i];
                    const prev = result.trend[i - 1];
                    if (curr === undefined || prev === undefined) return;
                    expect(curr.date >= prev.date).toBe(true);
                }
            }),
            { numRuns: 50 },
        );
    });
});

describe('generateAiEffectivenessHtml — property-based', () => {
    it('always produces valid HTML', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const html = generateAiEffectivenessHtml(result, 'PBT');
                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('contains the acceptance rate percentage', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const html = generateAiEffectivenessHtml(result);
                expect(html).toContain(`${result.acceptanceRate}%`);
            }),
            { numRuns: 50 },
        );
    });

    it('contains version names in byVersion table', () => {
        fc.assert(
            fc.property(storeArb, (store) => {
                const result = computeAiEffectiveness(store);
                const html = generateAiEffectivenessHtml(result);
                for (const v of result.byVersion) {
                    expect(html).toContain(v.version);
                }
            }),
            { numRuns: 50 },
        );
    });
});
