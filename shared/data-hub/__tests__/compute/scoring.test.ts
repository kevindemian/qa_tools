import { describe, it, expect } from 'vitest';
import { computeGrade } from '../../compute/scoring.js';

describe('Compute/scoring', () => {
    describe('ComputeGrade', () => {
        it('returns excellent for score >= 90', () => {
            expect.hasAssertions();
            expect(computeGrade(95)).toBe('excellent');
        });

        it('returns good for score >= 80', () => {
            expect.hasAssertions();
            expect(computeGrade(85)).toBe('good');
        });

        it('returns needs_attention for score >= 70', () => {
            expect.hasAssertions();
            expect(computeGrade(75)).toBe('needs_attention');
        });

        it('returns poor for score >= 60', () => {
            expect.hasAssertions();
            expect(computeGrade(65)).toBe('poor');
        });

        it('returns critical for score < 60', () => {
            expect.hasAssertions();
            expect(computeGrade(50)).toBe('critical');
        });
    });
});
