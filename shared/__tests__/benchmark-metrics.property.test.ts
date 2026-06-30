/**
 * Property-Based Tests — Benchmark Metrics (FT-15)
 *
 * Dimensão 5 — Métricas:
 * - computeCoverageMetrics: coverage sempre [0, 1]
 * - totalTests = array length
 * - coveredCriteriaCount ≤ totalCriteria
 * - Invalid body → zeros
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeCoverageMetrics } from '../benchmark-metrics.js';
import type { UserStoryFixture } from '../prompts/__fixtures__/index.js';

function randomCriterion(): fc.Arbitrary<string> {
    return fc.constantFrom(
        'Registration succeeds for age 18',
        'Registration fails for age 17',
        'Registration fails for age 66',
        'Dashboard loads within 2 seconds',
        'Error shown for invalid email',
    );
}

function makeFixture(criteria: string[], ranges: Array<{ field: string; min: number; max: number }>): UserStoryFixture {
    return {
        name: 'pbt-fixture',
        description: '',
        input: { story: '', criteria },
        validate: { type: 'json-array', minItems: 0, itemSchema: {} },
        coverage: {
            expectedCriteria: criteria,
            numericRanges: ranges,
        },
    };
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('ComputeCoverageMetrics — property-based', () => {
    it('criteriaCoverage, partitionCoverage, boundaryCoverage sempre em [0, 1]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }),
                fc.array(randomCriterion(), { minLength: 0, maxLength: 5 }),
                (bodyText, criteria) => {
                    const body = JSON.stringify([{ title: bodyText, steps: ['test'] }]);
                    const fixture = makeFixture(criteria, [{ field: 'age', min: 0, max: 100 }]);
                    const result = computeCoverageMetrics(body, fixture);

                    expect(result.criteriaCoverage).toBeGreaterThanOrEqual(0);
                    expect(result.criteriaCoverage).toBeLessThanOrEqual(1);
                    expect(result.partitionCoverage).toBeGreaterThanOrEqual(0);
                    expect(result.partitionCoverage).toBeLessThanOrEqual(1);
                    expect(result.boundaryCoverage).toBeGreaterThanOrEqual(0);
                    expect(result.boundaryCoverage).toBeLessThanOrEqual(1);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('totalTests = 0 para body inválido', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 50 }), (badBody) => {
                const result = computeCoverageMetrics(badBody, makeFixture(['test'], []));

                expect(result.totalTests).toBe(0);
                expect(result.criteriaCoverage).toBe(0);
                expect(result.partitionCoverage).toBe(0);
                expect(result.boundaryCoverage).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('totalTests = 0 para JSON não-array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constantFrom('{}', '{"key": "value"}', '"string"', 'null', 'true', 'false'), (body) => {
                const result = computeCoverageMetrics(body, makeFixture(['test'], []));

                expect(result.totalTests).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('totalTests = length do array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.record({ title: fc.string() }), { minLength: 0, maxLength: 20 }), (tests) => {
                const body = JSON.stringify(tests);
                const result = computeCoverageMetrics(body, makeFixture(['test'], []));

                expect(result.totalTests).toBe(tests.length);
            }),
            { numRuns: 100 },
        );
    });

    it('coveredCriteriaCount ≤ totalCriteria', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(randomCriterion(), { minLength: 1, maxLength: 5 }),
                fc.array(fc.record({ title: fc.string() }), { minLength: 0, maxLength: 10 }),
                (criteria, tests) => {
                    const body = JSON.stringify(tests);
                    const fixture = makeFixture(criteria, []);
                    const result = computeCoverageMetrics(body, fixture);

                    expect(result.coveredCriteriaCount).toBeLessThanOrEqual(result.totalCriteria);
                    expect(result.totalCriteria).toBe(criteria.length);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('criteriaCoverage = 0 quando nenhum critério corresponde', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !s.toLowerCase().includes('criteria')),
                fc.array(fc.record({ title: fc.string() }), { minLength: 1, maxLength: 5 }),
                (randomTitle, tests) => {
                    const body = JSON.stringify(tests.map((t) => ({ ...t, title: randomTitle })));
                    const fixture = makeFixture(['unlikely criterion xyz123'], []);
                    const result = computeCoverageMetrics(body, fixture);

                    expect(result.criteriaCoverage).toBe(0);
                    expect(result.coveredCriteriaCount).toBe(0);
                },
            ),
            { numRuns: 100 },
        );
    });
});
