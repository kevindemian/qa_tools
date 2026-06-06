import { RunComparisonSchema, ChangeImpactSchema } from './comparison-schema.js';

describe('ChangeImpactSchema', () => {
    it('accepts valid impacts', async () => {
        expect(ChangeImpactSchema.parse('positive')).toBe('positive');
        expect(ChangeImpactSchema.parse('negative')).toBe('negative');
        expect(ChangeImpactSchema.parse('neutral')).toBe('neutral');
    });

    it('rejects invalid impact', async () => {
        expect(() => ChangeImpactSchema.parse('unknown')).toThrow();
    });
});

describe('RunComparisonSchema', () => {
    const valid = {
        summary: 'Pass rate dropped from 95% to 82% due to 13 new failures in checkout module',
        meaningfulChanges: [{ metric: 'Pass rate', before: '95%', after: '82%', impact: 'negative' as const }],
        confidence: 0.9,
        evidence: ['Pass rate: 95% vs 82%', '13 new failures in checkout'],
    };

    it('accepts valid comparison', async () => {
        const result = RunComparisonSchema.parse(valid);
        expect(result.meaningfulChanges).toHaveLength(1);
    });

    it('rejects summary shorter than 20 chars', async () => {
        expect(() => RunComparisonSchema.parse({ ...valid, summary: 'Short summary' })).toThrow();
    });

    it('rejects summary longer than 500 chars', async () => {
        const longSummary = 'x'.repeat(501);
        expect(() => RunComparisonSchema.parse({ ...valid, summary: longSummary })).toThrow();
    });

    it('rejects empty meaningfulChanges', async () => {
        expect(() => RunComparisonSchema.parse({ ...valid, meaningfulChanges: [] })).toThrow();
    });

    it('rejects empty evidence', async () => {
        expect(() => RunComparisonSchema.parse({ ...valid, evidence: [] })).toThrow();
    });

    it('rejects confidence < 0', async () => {
        expect(() => RunComparisonSchema.parse({ ...valid, confidence: -0.5 })).toThrow();
    });
});
