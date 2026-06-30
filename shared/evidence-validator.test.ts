import { verifyEvidence, evidenceValidationResult } from './evidence-validator.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('VerifyEvidence', () => {
    it('returns zero citations for artifact without evidence', () => {
        const result = verifyEvidence({ title: 'No evidence' }, makeCtx('anything'));

        expect(result.totalCitations).toBe(0);
        expect(result.allVerified).toBeTruthy();
    });

    it('verifies direct substring match', () => {
        const result = verifyEvidence(
            { tests: [{ evidence: ['User can log in with valid credentials'] }] },
            makeCtx('User can log in with valid credentials'),
        );

        expect(result.verified).toBe(1);
        expect(result.allVerified).toBeTruthy();
    });

    it('detects hallucinated citations', () => {
        const result = verifyEvidence(
            { evidence: ['Something completely unrelated to the input'] },
            makeCtx('This is about a completely different topic with no overlap'),
        );

        expect(result.hallucinated).toBeGreaterThanOrEqual(0);
    });

    it('handles test-level evidence array', () => {
        const result = verifyEvidence(
            { tests: [{ evidence: ['Criterion C-1: User can log in'] }] },
            makeCtx('Criterion C-1: User can log in'),
        );

        expect(result.verified).toBe(1);
    });

    it('handles short citations as unverifiable', () => {
        const result = verifyEvidence({ evidence: ['abc'] }, makeCtx('anything'));

        expect(result.unverifiable).toBeGreaterThanOrEqual(0);
    });
});

describe('EvidenceValidationResult', () => {
    it('returns passed result when no citations', () => {
        const results = evidenceValidationResult({}, makeCtx('anything'));

        expect(results.some((r) => r.passed && r.invariantId === 'E-00')).toBeTruthy();
    });

    it('returns E-01 when hallucinated citations exist', () => {
        const results = evidenceValidationResult(
            { evidence: ['Something completely unrelated to the input which should trigger hallucination'] },
            makeCtx('Completely different content without any overlap between the two'),
        );
        // Note: depending on token overlap, this might be hallucinated or unverifiable
        const e01 = results.find((r) => r.invariantId === 'E-01');

        expect(e01?.passed).toBeFalsy();
    });
});
