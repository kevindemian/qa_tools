import { recalculateCoverage } from './coverage-verifier.js';
import type { ValidationContext } from './artifact-validator.js';

function makeCtx(input: string): ValidationContext {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' };
}

describe('recalculateCoverage', () => {
    it('returns 0 coverage when no criteria in input', async () => {
        const result = recalculateCoverage({ tests: [{ title: 'Test A' }] }, makeCtx('Short text'));
        expect(result.totalCriteria).toBe(0);
    });

    it('returns full coverage when criteria matched by titles', async () => {
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

    it('returns full coverage when criteria matched by titles', async () => {
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

    it('reports gaps for uncovered criteria', async () => {
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

    it('detects negative coverage delta (overselling)', async () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test user can log in' }],
                coverageTable: { coverage: 100 },
            },
            makeCtx('Acceptance Criteria: User can log in, Payment works'),
        );
        expect(result.coverageDelta).toBeLessThan(0);
    });

    it('extracts criteria from Given/When/Then format', async () => {
        const result = recalculateCoverage(
            {
                tests: [{ title: 'Test scenario A' }],
            },
            makeCtx('Given user is logged in\nWhen user clicks button\nThen system responds'),
        );
        expect(result.totalCriteria).toBeGreaterThan(0);
    });

    it('handles artifact with no tests array', async () => {
        const result = recalculateCoverage({}, makeCtx('Acceptance Criteria: Test'));
        expect(result.realCoverage).toBe(0);
    });

    it('declaredCoverage is null when missing', async () => {
        const result = recalculateCoverage({ tests: [] }, makeCtx('Acceptance Criteria: Test'));
        expect(result.declaredCoverage).toBeNull();
    });

    it('reads declared coverage from artifact', async () => {
        const result = recalculateCoverage(
            { tests: [], coverageTable: { coverage: 85 } },
            makeCtx('Acceptance Criteria: Test'),
        );
        expect(result.declaredCoverage).toBe(85);
    });
});
