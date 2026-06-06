import {
    createComparisonValidator,
    invariantChangesNonEmpty,
    invariantSummaryLength,
    invariantNumbersMatchInput,
} from './comparison-validator.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'comparison' };
}

describe('ComparisonValidator — createComparisonValidator', () => {
    it('creates validator with all invariants', async () => {
        const v = createComparisonValidator();
        const invariants = v.listInvariants();
        expect(invariants).toContain('C-01');
        expect(invariants).toContain('C-02');
        expect(invariants).toContain('C-03');
    });

    it('passes valid comparison', async () => {
        const v = createComparisonValidator();
        const comparison = {
            summary: 'Pass rate dropped from 95% to 82% due to 13 new failures in checkout module',
            meaningfulChanges: [{ metric: 'Pass rate', before: '95%', after: '82%', impact: 'negative' as const }],
            confidence: 0.9,
            evidence: ['Pass rate: 82%'],
        };
        const result = v.validate(comparison, makeCtx('95% to 82%'));
        expect(result.failed).toBe(0);
    });
});

describe('invariantChangesNonEmpty (C-01)', () => {
    it('passes with changes', async () => {
        const results = invariantChangesNonEmpty(
            { meaningfulChanges: [{ metric: 'Rate', before: 95, after: 82, impact: 'negative' }] },
            makeCtx(''),
        );
        expect(results.some((r: { passed: boolean }) => r.passed)).toBe(true);
    });

    it('fails empty changes', async () => {
        const results = invariantChangesNonEmpty({ meaningfulChanges: [] }, makeCtx(''));
        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'C-01'),
        ).toBe(true);
    });
});

describe('invariantSummaryLength (C-03)', () => {
    it('passes short summary', async () => {
        const results = invariantSummaryLength({ summary: 'Simple change.' }, makeCtx(''));
        expect(results.some((r: { passed: boolean }) => r.passed)).toBe(true);
    });

    it('warns on long summary', async () => {
        const results = invariantSummaryLength(
            {
                summary:
                    'First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence. Sixth sentence.',
            },
            makeCtx(''),
        );
        expect(
            results.some((r: { passed: boolean; invariantId: string }) => !r.passed && r.invariantId === 'C-03'),
        ).toBe(true);
    });
});

describe('invariantNumbersMatchInput (C-02)', () => {
    it('passes when numbers match input', async () => {
        const results = invariantNumbersMatchInput(
            { meaningfulChanges: [{ metric: 'Pass rate', before: '95%', after: '82%', impact: 'negative' }] },
            makeCtx('95% pass rate dropped to 82%'),
        );
        expect(results.some((r: { passed: boolean }) => r.passed)).toBe(true);
    });
});
