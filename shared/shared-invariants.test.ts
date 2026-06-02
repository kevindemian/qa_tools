import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from './shared-invariants';
import type { ValidationContext } from './artifact-validator';

function makeCtx(input = ''): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('invariantNoPlaceholder (I-01)', () => {
    it('passes clean content', () => {
        const results = invariantNoPlaceholder({ text: 'Clean content' }, makeCtx());
        expect(results.some((r) => r.passed && r.invariantId === 'I-01')).toBe(true);
    });

    it('fails on TODO', () => {
        const results = invariantNoPlaceholder({ text: 'TODO: fix this' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBe(true);
    });

    it('fails on FIXME', () => {
        const results = invariantNoPlaceholder({ text: 'FIXME: not implemented' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBe(true);
    });

    it('fails on asdf', () => {
        const results = invariantNoPlaceholder({ value: 'asdf test' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-01')).toBe(true);
    });

    it('scans nested objects', () => {
        const nested = { tests: [{ title: 'TODO: implement login' }] };
        const results = invariantNoPlaceholder(nested, makeCtx());
        expect(results.some((r) => !r.passed)).toBe(true);
    });

    it('scans arrays', () => {
        const arr = ['Clean string', 'Another TODO: fix'];
        const results = invariantNoPlaceholder(arr, makeCtx());
        expect(results.some((r) => !r.passed)).toBe(true);
    });
});

describe('invariantNoMarkdown (I-02)', () => {
    it('passes clean content', () => {
        const results = invariantNoMarkdown({ text: 'Clean text without marks' }, makeCtx());
        expect(results.some((r) => r.passed && r.invariantId === 'I-02')).toBe(true);
    });

    it('warns on asterisk', () => {
        const results = invariantNoMarkdown({ text: 'Some *italic* text' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-02')).toBe(true);
    });

    it('warns on backticks', () => {
        const results = invariantNoMarkdown({ code: 'use `variable` here' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-02')).toBe(true);
    });
});

describe('invariantEvidenceExists (I-03)', () => {
    it('passes when evidence matches input', () => {
        const results = invariantEvidenceExists(
            { evidence: ['Valid reason for failure'] },
            makeCtx('Valid reason for failure appears here'),
        );
        expect(results.some((r) => r.passed && r.invariantId === 'I-03')).toBe(true);
    });

    it('warns when evidence not found in input', () => {
        const results = invariantEvidenceExists(
            { evidence: ['Something not in input'] },
            makeCtx('Completely different content'),
        );
        expect(results.some((r) => !r.passed && r.invariantId === 'I-03')).toBe(true);
    });
});

describe('invariantNoEmptyStrings (I-04)', () => {
    it('passes with no empty strings', () => {
        const results = invariantNoEmptyStrings({ text: 'content' }, makeCtx());
        expect(results.some((r) => r.passed && r.invariantId === 'I-04')).toBe(true);
    });

    it('fails on empty string', () => {
        const results = invariantNoEmptyStrings({ text: '' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-04')).toBe(true);
    });

    it('fails on whitespace-only string', () => {
        const results = invariantNoEmptyStrings({ text: '   ' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-04')).toBe(true);
    });
});

describe('invariantConclusionHasEvidence (I-05)', () => {
    it('passes when evidence array exists', () => {
        const results = invariantConclusionHasEvidence({ summary: 'Some conclusion', evidence: ['source'] }, makeCtx());
        expect(results.some((r) => r.passed && r.invariantId === 'I-05')).toBe(true);
    });

    it('warns when conclusion present but no evidence', () => {
        const results = invariantConclusionHasEvidence({ summary: 'Some conclusion' }, makeCtx());
        expect(results.some((r) => !r.passed && r.invariantId === 'I-05')).toBe(true);
    });

    it('passes when no conclusion fields', () => {
        const results = invariantConclusionHasEvidence({ unrelated: 'data' }, makeCtx());
        expect(results.some((r) => r.passed && r.invariantId === 'I-05')).toBe(true);
    });
});
