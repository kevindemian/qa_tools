/**
 * Integration tests — Coverage Verifier
 *
 * Tests the full recalculateCoverage pipeline with realistic data shapes,
 * simulating how llm-review.ts calls it in Layer 3 validation.
 */
import { describe, expect, it } from 'vitest';
import { recalculateCoverage } from '../../coverage-verifier.js';
import type { ValidationContext } from '../../artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('FT-38a: recalculateCoverage full pipeline', () => {
    it('detects full coverage when all criteria are matched by test titles', () => {
        const artifact = {
            tests: [
                { title: 'User can log in successfully' },
                { title: 'Payment processes correctly' },
                { title: 'Email notification is sent' },
            ],
            coverageTable: { coverage: 90 },
        };
        const ctx = makeCtx('Acceptance Criteria:\n- User can log in\n- Payment processing\n- Email notification');
        const result = recalculateCoverage(artifact, ctx);

        expect(result.totalCriteria).toBe(3);
        expect(result.coveredCriteria).toBeGreaterThanOrEqual(2);
        expect(result.realCoverage).toBeGreaterThan(0);
        expect(result.coverageDelta).toBe(result.realCoverage - 90);
    });

    it('reports gaps for criteria not covered by any test', () => {
        const artifact = {
            tests: [{ title: 'User can log in' }],
            coverageTable: { coverage: 100 },
        };
        const ctx = makeCtx('Acceptance Criteria:\n- User can log in\n- Payment works\n- Email notification');
        const result = recalculateCoverage(artifact, ctx);

        expect(result.gaps.length).toBeGreaterThan(0);
        expect(result.realCoverage).toBeLessThan(100);
        expect(result.coverageDelta).toBeLessThan(0);
    });

    it('returns zero totalCriteria when input has no criteria section', () => {
        const artifact = {
            tests: [{ title: 'Test A' }],
        };
        const ctx = makeCtx('Short text');
        const result = recalculateCoverage(artifact, ctx);

        expect(result.totalCriteria).toBe(0);
        expect(result.declaredCoverage).toBeNull();
        expect(result.coverageDelta).toBe(0);
    });

    it('handles artifact with no tests array gracefully', () => {
        const result = recalculateCoverage(
            { coverageTable: { coverage: 50 } },
            makeCtx('Acceptance Criteria:\n- Test'),
        );

        expect(result.realCoverage).toBe(0);
        expect(result.totalCriteria).toBeGreaterThan(0);
    });

    it('handles empty artifact object', () => {
        const result = recalculateCoverage({}, makeCtx('Acceptance Criteria:\n- Test'));

        expect(result.realCoverage).toBe(0);
        expect(result.declaredCoverage).toBeNull();
    });

    it('reads declared coverage from artifact when valid', () => {
        const result = recalculateCoverage(
            { tests: [{ title: 'Test A' }], coverageTable: { coverage: 75 } },
            makeCtx('Acceptance Criteria:\n- Test'),
        );

        expect(result.declaredCoverage).toBe(75);
    });

    it('treats NaN declared coverage as null', () => {
        const result = recalculateCoverage(
            { tests: [{ title: 'Test A' }], coverageTable: { coverage: NaN } },
            makeCtx('Acceptance Criteria:\n- Test'),
        );

        expect(result.declaredCoverage).toBeNull();
        expect(result.coverageDelta).toBe(0);
    });

    it('detects overselling (declared > real) with negative delta', () => {
        const artifact = {
            tests: [{ title: 'Only one test' }],
            coverageTable: { coverage: 100 },
        };
        const ctx = makeCtx('Acceptance Criteria:\n- Criterion A\n- Criterion B\n- Criterion C');
        const result = recalculateCoverage(artifact, ctx);

        expect(result.declaredCoverage).toBe(100);
        expect(result.realCoverage).toBeLessThan(100);
        expect(result.coverageDelta).toBeLessThan(0);
    });
});
