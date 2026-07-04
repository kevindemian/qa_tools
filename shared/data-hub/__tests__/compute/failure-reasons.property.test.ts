import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractFailureReasons, calcTopFailureReasons } from '../../compute/failure-reasons.js';

describe('Compute/failure-reasons — property-based', () => {
    it('extracted reasons always <= 5', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(fc.string({ minLength: 0, maxLength: 500 }), { maxLength: 20 }), (lines) => {
                const log = lines.join('\n');
                const result = extractFailureReasons(log);

                expect(result.length).toBeLessThanOrEqual(5);
            }),
            { numRuns: 100 },
        );
    });

    it('each extracted reason is <= 100 chars', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constant('Error: ' + 'x'.repeat(150)), (log) => {
                const result = extractFailureReasons(log);
                for (const reason of result) {
                    expect(reason.length).toBeLessThanOrEqual(100);
                }

                expect(result.length).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 10 },
        );
    });

    it('top failure reasons always <= 10', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), (n) => {
                const map = new Map<number, string[]>();
                for (let i = 0; i < n; i++) {
                    map.set(i, [`Error: reason-${i}`]);
                }
                const result = calcTopFailureReasons(map);

                expect(result.length).toBeLessThanOrEqual(10);
            }),
            { numRuns: 100 },
        );
    });

    it('each count in top reasons is >= 1', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 30 }), (n) => {
                const map = new Map<number, string[]>();
                for (let i = 0; i < n; i++) {
                    map.set(i, ['Error: pattern']);
                }
                const result = calcTopFailureReasons(map);
                for (const item of result) {
                    expect(item.count).toBeGreaterThanOrEqual(1);
                }
            }),
            { numRuns: 100 },
        );
    });
});
