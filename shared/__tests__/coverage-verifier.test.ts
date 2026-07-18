import { recalculateCoverage } from '../validation/coverage-verifier.js';
import type { ValidationContext } from '../validation/artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('RecalculateCoverage', () => {
    it('returns 0 coverage when no criteria in input', () => {
        const result = recalculateCoverage({ tests: [{ title: 'Test A' }] }, makeCtx('Short text'));

        expect(result.totalCriteria).toBe(0);
    });

    it('returns full coverage when criteria matched by titles', () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test user can log in' }, { title: 'Test payment works' }],
                coverageTable: { coverage: 100 },
            },
            makeCtx('Given user can log in\nWhen payment works'),
        );

        expect(result.realCoverage).toBe(100);
        expect(result.coveredCriteria).toBe(2);
    });

    it('treats NaN declared coverage as null (invalid)', () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test user can log in' }, { title: 'Test payment works' }],
                coverageTable: { coverage: NaN },
            },
            makeCtx('Given user can log in\nWhen payment works'),
        );

        expect(result.declaredCoverage).toBeNull();
        expect(result.coverageDelta).toBe(0);
    });

    it('reports gaps for uncovered criteria', () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test user can log in' }],
                coverageTable: { coverage: 50 },
            },
            makeCtx('Acceptance Criteria: User can log in, Payment works, Email notification'),
        );

        expect(result.gaps.length).toBeGreaterThan(0);
        expect(result.realCoverage).toBeLessThan(100);
    });

    it('detects negative coverage delta (overselling)', () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test user can log in' }],
                coverageTable: { coverage: 100 },
            },
            makeCtx('Acceptance Criteria: User can log in, Payment works'),
        );

        expect(result.coverageDelta).toBeLessThan(0);
    });

    it('extracts criteria from Given/When/Then format', () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test scenario A' }],
            },
            makeCtx('Given user is logged in\nWhen user clicks button\nThen system responds'),
        );

        expect(result.totalCriteria).toBeGreaterThan(0);
    });

    it('handles artifact with no tests array', () => {
        const result = recalculateCoverage({}, makeCtx('Acceptance Criteria: Test'));

        expect(result.realCoverage).toBe(0);
    });

    it('declaredCoverage is null when missing', () => {
        const result = recalculateCoverage({ tests: [] }, makeCtx('Acceptance Criteria: Test'));

        expect(result.declaredCoverage).toBeNull();
    });

    it('reads declared coverage from artifact', () => {
        const result = recalculateCoverage(
            { tests: [], coverageTable: { coverage: 85 } },
            makeCtx('Acceptance Criteria: Test'),
        );

        expect(result.declaredCoverage).toBe(85);
    });
});
