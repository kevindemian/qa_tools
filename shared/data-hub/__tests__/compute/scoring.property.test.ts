import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { computeGrade } from '../../compute/scoring.js';

describe('Compute/scoring — property-based', () => {
    it('grade is always valid', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.float({ min: 0, max: 100, noNaN: true }), (score) => {
                const grade = computeGrade(score);

                expect(['excellent', 'good', 'needs_attention', 'poor', 'critical']).toContain(grade);
            }),
            { numRuns: 100 },
        );
    });
});
