import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PipelineRun } from '../../../types/ci-cd.js';
import { calcAvgDuration } from '../../compute/avg-duration.js';

const PipelineRunArb: fc.Arbitrary<PipelineRun> = fc
    .tuple(fc.integer({ min: 0, max: 1000000 }), fc.integer({ min: 1, max: 3600 }))
    .map(([startSec, offsetSec]): PipelineRun => {
        const start = new Date(startSec * 1000);
        const end = new Date(startSec * 1000 + offsetSec * 1000);
        return {
            id: 1,
            conclusion: 'success',
            run_started_at: start.toISOString(),
            updated_at: end.toISOString(),
        };
    });

describe('Compute/avg-duration — property-based', () => {
    it('average duration is always between 0 and 86400', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { minLength: 0, maxLength: 20 }), (runs) => {
                const result = calcAvgDuration(runs);

                expect(result).toBeGreaterThanOrEqual(0);
                expect(result).toBeLessThanOrEqual(86400);
            }),
            { numRuns: 100 },
        );
    });

    it('empty array always returns 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(PipelineRunArb, { maxLength: 0 }), (runs) => {
                expect(calcAvgDuration(runs)).toBe(0);
            }),
            { numRuns: 50 },
        );
    });

    it('average of identical durations equals that duration', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 1000000 }),
                fc.integer({ min: 1, max: 3600 }),
                (startSec, offsetSec) => {
                    const start = new Date(startSec * 1000);
                    const end = new Date(startSec * 1000 + offsetSec * 1000);
                    const runs = Array.from({ length: 5 }, () => ({
                        id: 1,
                        conclusion: 'success' as const,
                        run_started_at: start.toISOString(),
                        updated_at: end.toISOString(),
                    }));

                    expect(calcAvgDuration(runs)).toBe(offsetSec);
                },
            ),
            { numRuns: 50 },
        );
    });
});
