import { PipelineClassificationSchema, PipelineCategorySchema } from './pipeline-schema.js';

describe('PipelineCategorySchema', () => {
    it('accepts valid categories', () => {
        expect(PipelineCategorySchema.parse('infrastructure')).toBe('infrastructure');
        expect(PipelineCategorySchema.parse('code')).toBe('code');
        expect(PipelineCategorySchema.parse('flaky')).toBe('flaky');
        expect(PipelineCategorySchema.parse('unknown')).toBe('unknown');
    });

    it('rejects invalid category', () => {
        expect(() => PipelineCategorySchema.parse('invalid')).toThrow(/error/i);
    });
});

describe('PipelineClassificationSchema', () => {
    const valid = {
        category: 'infrastructure' as const,
        confidence: 0.85,
        evidence: ['Runner offline error in job log'],
        recommendation: 'Restart the runner and check disk space',
    };

    it('accepts valid classification', () => {
        const result = PipelineClassificationSchema.parse(valid);

        expect(result.category).toBe('infrastructure');
        expect(result.confidence).toBe(0.85);
    });

    it('accepts classification without recommendation', () => {
        const noRec = (({ recommendation: _rec, ...rest }) => rest)(valid);
        const result = PipelineClassificationSchema.parse(noRec);

        expect(result.recommendation).toBeUndefined();
    });

    it('rejects confidence < 0', () => {
        expect(() => PipelineClassificationSchema.parse({ ...valid, confidence: -0.1 })).toThrow(/error/i);
    });

    it('rejects confidence > 1', () => {
        expect(() => PipelineClassificationSchema.parse({ ...valid, confidence: 1.5 })).toThrow(/error/i);
    });

    it('rejects empty evidence', () => {
        expect(() => PipelineClassificationSchema.parse({ ...valid, evidence: [] })).toThrow(/error/i);
    });
});
