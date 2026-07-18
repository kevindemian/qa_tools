import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from '../validation/shared-invariants.js';
import type { ValidationContext } from '../validation/artifact-validator.js';

function makeCtx(input = ''): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('InvariantNoPlaceholder (I-01)', () => {
    it('passes clean content', () => {
        const results = invariantNoPlaceholder({ text: 'Clean content' }, makeCtx());

        expect(results.some((r) => r.passed && r.invariantId === 'I-01')).toBeTruthy();
    });

    it('fails on TODO', () => {
        const results = invariantNoPlaceholder({ text: 'TODO: fix this' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBeTruthy();
    });

    it('fails on FIXME', () => {
        const results = invariantNoPlaceholder({ text: 'FIXME: not implemented' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBeTruthy();
    });

    it('fails on asdf', () => {
        const results = invariantNoPlaceholder({ value: 'asdf test' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBeTruthy();
    });

    it('scans nested objects', () => {
        const nested = { tests: [{ title: 'TODO: implement login' }] };
        const results = invariantNoPlaceholder(nested, makeCtx());

        expect(results.some((r) => !r.passed)).toBeTruthy();
    });

    it('scans arrays', () => {
        const arr = ['Clean string', 'Another TODO: fix'];
        const results = invariantNoPlaceholder(arr, makeCtx());

        expect(results.some((r) => !r.passed)).toBeTruthy();
    });
});

describe('InvariantNoMarkdown (I-02)', () => {
    it('passes clean content', () => {
        const results = invariantNoMarkdown({ text: 'Clean text without marks' }, makeCtx());

        expect(results.some((r) => r.passed && r.invariantId === 'I-02')).toBeTruthy();
    });

    it('warns on asterisk', () => {
        const results = invariantNoMarkdown({ text: 'Some *italic* text' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-02')).toBeTruthy();
    });

    it('warns on backticks', () => {
        const results = invariantNoMarkdown({ code: 'use `variable` here' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-02')).toBeTruthy();
    });
});

describe('InvariantEvidenceExists (I-03)', () => {
    it('passes when evidence matches input', () => {
        const results = invariantEvidenceExists(
            { evidence: ['Valid reason for failure'] },
            makeCtx('Valid reason for failure appears here'),
        );

        expect(results.some((r) => r.passed && r.invariantId === 'I-03')).toBeTruthy();
    });

    it('warns when evidence not found in input', () => {
        const results = invariantEvidenceExists(
            { evidence: ['Something not in input'] },
            makeCtx('Completely different content'),
        );

        expect(results.some((r) => !r.passed && r.invariantId === 'I-03')).toBeTruthy();
    });
});

describe('InvariantNoEmptyStrings (I-04)', () => {
    it('passes with no empty strings', () => {
        const results = invariantNoEmptyStrings({ text: 'content' }, makeCtx());

        expect(results.some((r) => r.passed && r.invariantId === 'I-04')).toBeTruthy();
    });

    it('fails on empty string', () => {
        const results = invariantNoEmptyStrings({ text: '' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-04')).toBeTruthy();
    });

    it('fails on whitespace-only string', () => {
        const results = invariantNoEmptyStrings({ text: '   ' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-04')).toBeTruthy();
    });
});

describe('InvariantConclusionHasEvidence (I-05)', () => {
    it('passes when evidence array exists', () => {
        const results = invariantConclusionHasEvidence({ summary: 'Some conclusion', evidence: ['source'] }, makeCtx());

        expect(results.some((r) => r.passed && r.invariantId === 'I-05')).toBeTruthy();
    });

    it('warns when conclusion present but no evidence', () => {
        const results = invariantConclusionHasEvidence({ summary: 'Some conclusion' }, makeCtx());

        expect(results.some((r) => !r.passed && r.invariantId === 'I-05')).toBeTruthy();
    });

    it('passes when no conclusion fields', () => {
        const results = invariantConclusionHasEvidence({ unrelated: 'data' }, makeCtx());

        expect(results.some((r) => r.passed && r.invariantId === 'I-05')).toBeTruthy();
    });
});
