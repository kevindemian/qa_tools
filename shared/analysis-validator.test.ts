import {
    createAnalysisValidator,
    invariantTestTitleExists,
    invariantUnknownHasReason,
    invariantHighSeverityRecommendation,
    invariantSeverityConsistent,
    invariantRecommendationReferencesError,
} from './analysis-validator.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'analysis' };
}

describe('AnalysisValidator — createAnalysisValidator', () => {
    it('creates validator with all invariants registered', () => {
        const v = createAnalysisValidator();
        const invariants = v.listInvariants();
        expect(invariants).toContain('A-01');
        expect(invariants).toContain('A-02');
        expect(invariants).toContain('A-03');
        expect(invariants).toContain('A-04');
        expect(invariants).toContain('A-05');
        expect(invariants).toContain('I-01');
        expect(invariants).toContain('I-02');
        expect(invariants).toContain('I-03');
        expect(invariants).toContain('I-04');
        expect(invariants).toContain('I-05');
    });

    it('passes a well-formed analysis', () => {
        const v = createAnalysisValidator();
        const analysis = {
            tests: [
                {
                    title: 'Login fails with invalid credentials',
                    classification: 'ASSERTION' as const,
                    severity: 'high' as const,
                    recommendation: 'Fix assertion on line 42 — expected 200 but got 401',
                },
            ],
        };
        const ctx = makeCtx('1. [failed] Login fails with invalid credentials (42ms)\nerror: expected 200 got 401');
        const result = v.validate(analysis, ctx);
        expect(result.failed).toBe(0);
    });
});

describe('invariantTestTitleExists (A-01)', () => {
    it('passes when titles match input', () => {
        const results = invariantTestTitleExists(
            { tests: [{ title: 'Login fails' }] },
            makeCtx('1. [failed] Login fails (100ms)'),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails when title not in input', () => {
        const results = invariantTestTitleExists(
            { tests: [{ title: 'Missing test' }] },
            makeCtx('1. [failed] Login fails (100ms)'),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'A-01')).toBe(true);
    });
});

describe('invariantUnknownHasReason (A-04)', () => {
    it('passes UNKNOWN with reason', () => {
        const results = invariantUnknownHasReason(
            {
                tests: [
                    {
                        classification: 'UNKNOWN',
                        recommendation:
                            'Insufficient data to classify — error message is generic timeout without stack trace',
                    },
                ],
            },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails UNKNOWN with short recommendation', () => {
        const results = invariantUnknownHasReason(
            { tests: [{ classification: 'UNKNOWN', recommendation: 'Not sure' }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'A-04')).toBe(true);
    });
});

describe('invariantHighSeverityRecommendation (A-05)', () => {
    it('passes when high severity has long recommendation', () => {
        const results = invariantHighSeverityRecommendation(
            {
                tests: [
                    {
                        severity: 'high',
                        recommendation: 'Fix assertion logic with proper error handling and validation',
                    },
                ],
            },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('fails when high severity has short recommendation', () => {
        const results = invariantHighSeverityRecommendation(
            { tests: [{ severity: 'high', recommendation: 'Fix it' }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'A-05')).toBe(true);
    });
});

describe('invariantSeverityConsistent (A-03)', () => {
    it('passes consistent severity', () => {
        const results = invariantSeverityConsistent(
            { tests: [{ classification: 'ASSERTION', severity: 'high' }] },
            makeCtx(''),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });

    it('warns on ASSERTION low severity', () => {
        const results = invariantSeverityConsistent(
            { tests: [{ classification: 'ASSERTION', severity: 'low' }] },
            makeCtx(''),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'A-03')).toBe(true);
    });
});

describe('invariantRecommendationReferencesError (A-02)', () => {
    it('passes when recommendation references error', () => {
        const results = invariantRecommendationReferencesError(
            { tests: [{ title: 'Test', recommendation: 'Fix assertion error in login module' }] },
            makeCtx('error: assertion failed in login module\nexception: timeout'),
        );
        expect(results.some((r) => r.passed)).toBe(true);
    });
});
