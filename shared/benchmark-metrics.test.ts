import { computeCoverageMetrics } from './benchmark-metrics.js';

const ageFixture = {
    name: 'numeric-age-validation',
    description: '',
    input: { story: '', criteria: [] },
    validate: { type: 'json-array' as const, minItems: 4, itemSchema: {} },
    coverage: {
        expectedCriteria: [
            'Registration succeeds for age 18',
            'Registration fails for age 17',
            'Registration fails for age 66',
        ],
        numericRanges: [{ field: 'age', min: 18, max: 65 }],
    },
};

// ---------------------------------------------------------------------------
// computeCoverageMetrics
// ---------------------------------------------------------------------------

describe('computeCoverageMetrics', () => {
    it('returns zero metrics for invalid JSON body', () => {
        const result = computeCoverageMetrics('not json', ageFixture);

        expect(result.criteriaCoverage).toBe(0);
        expect(result.totalTests).toBe(0);
    });

    it('computes full coverage when all criteria and boundaries are present', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 is accepted',
                steps: ['Enter age 18', 'Submit form'],
                expectedResult: 'User is accepted',
                coverage: [{ criterionId: 'C-1', criterionText: 'Registration succeeds for age 18' }],
            },
            {
                title: 'Age 17 is rejected',
                steps: ['Enter age 17', 'Submit form'],
                expectedResult: 'User is rejected',
                coverage: [{ criterionId: 'C-2', criterionText: 'Registration fails for age 17' }],
            },
            {
                title: 'Age 66 is rejected',
                steps: ['Enter age 66', 'Submit form'],
                expectedResult: 'User is rejected',
                coverage: [{ criterionId: 'C-3', criterionText: 'Registration fails for age 66' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);

        expect(metrics.criteriaCoverage).toBe(1);
        expect(metrics.totalCriteria).toBe(3);
        expect(metrics.coveredCriteriaCount).toBe(3);
    });

    it('computes partial coverage when some criteria are missing', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 is accepted',
                steps: ['Enter age 18', 'Submit form'],
                expectedResult: 'User is accepted',
                coverage: [{ criterionId: 'C-1', criterionText: 'Registration succeeds for age 18' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);

        expect(metrics.criteriaCoverage).toBeCloseTo(1 / 3);
        expect(metrics.coveredCriteriaCount).toBe(1);
        expect(metrics.totalCriteria).toBe(3);
    });

    it('computes boundary coverage from test steps containing boundary values', () => {
        const body = JSON.stringify([
            {
                title: 'Age 18 boundary',
                steps: ['Enter age 18', 'Submit'],
                expectedResult: 'Accepted',
            },
            {
                title: 'Age 17 boundary',
                steps: ['Enter age 17', 'Submit'],
                expectedResult: 'Rejected',
            },
            {
                title: 'Age 65 boundary',
                steps: ['Enter age 65', 'Submit'],
                expectedResult: 'Accepted',
            },
        ]);

        const metrics = computeCoverageMetrics(body, ageFixture);

        // 18, 17, 65 covered — missing 66 → 3/4
        expect(metrics.boundaryCoverage).toBe(0.75);
    });

    it('handles fixture with empty numeric ranges', () => {
        const noRangeFixture = {
            ...ageFixture,
            coverage: {
                expectedCriteria: ['Criterion 1'],
                numericRanges: [] satisfies Array<{ field: string; min: number; max: number }>,
            },
        };
        const body = JSON.stringify([
            {
                title: 'Test',
                steps: ['Do something'],
                expectedResult: 'Works',
                coverage: [{ criterionId: 'C-1', criterionText: 'Criterion 1' }],
            },
        ]);

        const metrics = computeCoverageMetrics(body, noRangeFixture);

        expect(metrics.criteriaCoverage).toBe(1);
        expect(metrics.partitionCoverage).toBe(0);
        expect(metrics.boundaryCoverage).toBe(0);
    });

    it('handles empty test array', () => {
        const metrics = computeCoverageMetrics('[]', ageFixture);

        expect(metrics.criteriaCoverage).toBe(0);
        expect(metrics.totalTests).toBe(0);
    });
});
