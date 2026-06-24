import {
    createPipelineValidator,
    invariantMinConfidence,
    invariantEvidenceNonEmpty,
    invariantCategoryHasRecommendation,
} from './pipeline-validator.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'pipeline' };
}

describe('PipelineValidator — createPipelineValidator', () => {
    it('creates validator with all invariants', () => {
        const v = createPipelineValidator();
        const invariants = v.listInvariants();

        expect(invariants).toContain('P-01');
        expect(invariants).toContain('P-02');
        expect(invariants).toContain('P-03');
        expect(invariants).toContain('I-01');
        expect(invariants).toContain('I-02');
        expect(invariants).toContain('I-03');
        expect(invariants).toContain('I-04');
    });

    it('passes valid pipeline classification', () => {
        const v = createPipelineValidator();
        const data = {
            category: 'infrastructure' as const,
            confidence: 0.85,
            evidence: ['Runner offline in job log'],
            recommendation: 'Restart the runner and check disk space',
        };
        const result = v.validate(data, makeCtx('Runner offline in job log'));

        expect(result.failed).toBe(0);
    });
});

describe('InvariantMinConfidence (P-01)', () => {
    it('passes when confidence >= 0.6', () => {
        const results = invariantMinConfidence({ confidence: 0.75 }, makeCtx(''));

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('fails when confidence < 0.6', () => {
        const results = invariantMinConfidence({ confidence: 0.5 }, makeCtx(''));

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'P-01'),
        ).toBeTruthy();
    });

    it('fails when confidence missing', () => {
        const results = invariantMinConfidence({}, makeCtx(''));

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'P-01'),
        ).toBeTruthy();
    });
});

describe('InvariantEvidenceNonEmpty (P-02)', () => {
    it('passes with evidence', () => {
        const results = invariantEvidenceNonEmpty({ evidence: ['Line 42: error'] }, makeCtx(''));

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('fails with empty evidence', () => {
        const results = invariantEvidenceNonEmpty({ evidence: [] }, makeCtx(''));

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'P-02'),
        ).toBeTruthy();
    });
});

describe('InvariantCategoryHasRecommendation (P-03)', () => {
    it('passes when code has recommendation', () => {
        const results = invariantCategoryHasRecommendation(
            { category: 'code', recommendation: 'Fix compilation error in main.ts' },
            makeCtx(''),
        );

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });

    it('fails when code missing recommendation', () => {
        const results = invariantCategoryHasRecommendation({ category: 'code' }, makeCtx(''));

        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'P-03'),
        ).toBeTruthy();
    });

    it('passes when unknown (no recommendation needed)', () => {
        const results = invariantCategoryHasRecommendation({ category: 'unknown' }, makeCtx(''));

        expect(results.some((r: { passed: boolean }) => r.passed)).toBeTruthy();
    });
});
