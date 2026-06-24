/**
 * Property-based tests — Coverage Verifier
 *
 * Invariants:
 * - realCoverage always 0-100
 * - totalCriteria >= coveredCriteria
 * - coveredCriteria + gaps.length = totalCriteria (when criteria exist)
 * - coverageDelta = realCoverage - declaredCoverage (when declared is not null)
 * - coverageDelta = 0 (when declared is null)
 * - realCoverage = 100 when coveredCriteria = totalCriteria > 0
 * - realCoverage = 0 when totalCriteria > 0 and coveredCriteria = 0
 * - NaN in coverageTable → declaredCoverage is null
 * - gaps[i].criterion.length <= 120
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { recalculateCoverage } from '../coverage-verifier.js';

function makeCtx(input: string) {
    return { inputRaw: input, outputRaw: {}, artifactType: 'test-suite' as const };
}

describe('Coverage invariants (PBT)', () => {
    it('realCoverage is always between 0 and 100', () => {expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.string(),
                fc.boolean(),
                fc.option(fc.integer({ min: 0, max: 100 })),
                (input, hasTests, declared) => {
                    const artifact = {
                        tests: hasTests ? [{ title: 'User can log in' }, { title: 'Payment works' }] : [],
                        coverageTable: declared !== null ? { coverage: declared } : undefined,
                    };
                    const result = recalculateCoverage(artifact, makeCtx(input));

                    expect(result.realCoverage).toBeGreaterThanOrEqual(0);
                    expect(result.realCoverage).toBeLessThanOrEqual(100);
                },
            ),
        );
    });

    it('totalCriteria >= coveredCriteria', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string(), (input) => {
                const artifact = {
                    tests: [{ title: 'login' }, { title: 'payment' }, { title: 'email' }],
                };
                const result = recalculateCoverage(artifact, makeCtx(input));

                expect(result.totalCriteria).toBeGreaterThanOrEqual(result.coveredCriteria);
            }),
        );
    });

    it('coveredCriteria + gaps.length === totalCriteria when criteria exist', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (input) => {
                const artifact = {
                    tests: [{ title: 'login' }, { title: 'payment' }],
                };
                const result = recalculateCoverage(artifact, makeCtx(input));
                if (result.totalCriteria === 0) return;

                expect(result.coveredCriteria + result.gaps.length).toBe(result.totalCriteria);
            }),
        );
    });

    it('coverageDelta is 0 when declaredCoverage is null', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string(), (input) => {
                const artifact = {
                    tests: [{ title: 'login' }],
                };
                const result = recalculateCoverage(artifact, makeCtx(input));
                if (result.declaredCoverage === null) {
                    expect(result.coverageDelta).toBe(0);
                }
            }),
        );
    });

    it('coverageDelta = realCoverage - declaredCoverage when declared is not null', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.integer({ min: 0, max: 100 }), (declared) => {
                const artifact = {
                    tests: [{ title: 'login' }, { title: 'payment' }],
                    coverageTable: { coverage: declared },
                };
                const result = recalculateCoverage(artifact, makeCtx('Given login\nWhen payment'));
                if (result.declaredCoverage !== null) {
                    expect(result.coverageDelta).toBe(result.realCoverage - result.declaredCoverage);
                }
            }),
        );
    });

    it('naN in coverageTable yields null declaredCoverage', () => {
        const artifact = {
            tests: [{ title: 'login' }],
            coverageTable: { coverage: NaN },
        };
        const result = recalculateCoverage(artifact, makeCtx('Given login'));

        expect(result.declaredCoverage).toBeNull();
        expect(Number.isNaN(result.coverageDelta)).toBeFalsy();
        expect(result.coverageDelta).toBe(0);
    });

    it('gaps entries have criterion truncated to 120 chars', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ minLength: 1 }), (input) => {
                const artifact = {
                    tests: [{ title: 'x' }],
                };
                const result = recalculateCoverage(artifact, makeCtx(input));
                for (const gap of result.gaps) {
                    expect(gap.criterion.length).toBeLessThanOrEqual(120);
                }
            }),
        );
    });
});
