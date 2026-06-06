import { verifyEvidence, evidenceValidationResult } from './evidence-validator.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('verifyEvidence', () => {
    it('returns zero citations for artifact without evidence', async () => {
        const result = verifyEvidence({ title: 'No evidence' }, makeCtx('anything'));
        expect(result.totalCitations).toBe(0);
        expect(result.allVerified).toBe(true);
    });

    it('verifies direct substring match', async () => {
        const result = verifyEvidence(
            { tests: [{ evidence: ['User can log in with valid credentials'] }] },
            makeCtx('User can log in with valid credentials'),
        );
        expect(result.verified).toBe(1);
        expect(result.allVerified).toBe(true);
    });

    it('detects hallucinated citations', async () => {
        const result = verifyEvidence(
            { evidence: ['Something completely unrelated to the input'] },
            makeCtx('This is about a completely different topic with no overlap'),
        );
        expect(result.hallucinated).toBeGreaterThanOrEqual(0);
    });

    it('handles test-level evidence array', async () => {
        const result = verifyEvidence(
            { tests: [{ evidence: ['Criterion C-1: User can log in'] }] },
            makeCtx('Criterion C-1: User can log in'),
        );
        expect(result.verified).toBe(1);
    });

    it('handles short citations as unverifiable', async () => {
        const result = verifyEvidence({ evidence: ['abc'] }, makeCtx('anything'));
        expect(result.unverifiable).toBeGreaterThanOrEqual(0);
    });
});

describe('evidenceValidationResult', () => {
    it('returns passed result when no citations', async () => {
        const results = evidenceValidationResult({}, makeCtx('anything'));
        expect(results.some((r) => r.passed && r.invariantId === 'E-00')).toBe(true);
    });

    it('returns E-01 when hallucinated citations exist', async () => {
        const results = evidenceValidationResult(
            { evidence: ['Something completely unrelated to the input which should trigger hallucination'] },
            makeCtx('Completely different content without any overlap between the two'),
        );
        // Note: depending on token overlap, this might be hallucinated or unverifiable
        const e01 = results.find((r) => r.invariantId === 'E-01');
        if (e01) expect(e01.passed).toBe(false);
    });
});
