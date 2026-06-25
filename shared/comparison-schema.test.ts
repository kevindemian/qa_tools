import { RunComparisonSchema, ChangeImpactSchema } from './comparison-schema.js';

describe('ChangeImpactSchema', () => {
    it('accepts valid impacts', () => {
        expect(ChangeImpactSchema.parse('positive')).toBe('positive');
        expect(ChangeImpactSchema.parse('negative')).toBe('negative');
        expect(ChangeImpactSchema.parse('neutral')).toBe('neutral');
    });

    it('rejects invalid impact', () => {
        expect(() => ChangeImpactSchema.parse('unknown')).toThrow(/./i);
    });
});

describe('RunComparisonSchema', () => {
    const valid = {
        summary: 'Pass rate dropped from 95% to 82% due to 13 new failures in checkout module',
        meaningfulChanges: [{ metric: 'Pass rate', before: '95%', after: '82%', impact: 'negative' as const }],
        confidence: 0.9,
        evidence: ['Pass rate: 95% vs 82%', '13 new failures in checkout'],
    };

    it('accepts valid comparison', () => {
        const result = RunComparisonSchema.parse(valid);

        expect(result.meaningfulChanges).toHaveLength(1);
    });

    it('rejects summary shorter than 20 chars', () => {
        expect(() => RunComparisonSchema.parse({ ...valid, summary: 'Short summary' })).toThrow(/./i);
    });

    it('rejects summary longer than 500 chars', () => {
        const longSummary = 'x'.repeat(501);

        expect(() => RunComparisonSchema.parse({ ...valid, summary: longSummary })).toThrow(/./i);
    });

    it('rejects empty meaningfulChanges', () => {
        expect(() => RunComparisonSchema.parse({ ...valid, meaningfulChanges: [] })).toThrow(/./i);
    });

    it('rejects empty evidence', () => {
        expect(() => RunComparisonSchema.parse({ ...valid, evidence: [] })).toThrow(/./i);
    });

    it('rejects confidence < 0', () => {
        expect(() => RunComparisonSchema.parse({ ...valid, confidence: -0.5 })).toThrow(/./i);
    });
});
