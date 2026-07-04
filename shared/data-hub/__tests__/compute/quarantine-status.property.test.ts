import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FlakyResult } from '../../../types/data-hub.js';
import { calcQuarantineStatus } from '../../compute/quarantine-status.js';

describe('Compute/quarantine-status — property-based', () => {
    it('flakyCount is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), (n) => {
                const flaky: FlakyResult[] = Array.from({ length: n }, (_, i) => ({
                    title: `test-${i}`,
                    rate: 50,
                    runs: 10,
                }));
                const result = calcQuarantineStatus(flaky, { minRuns: 1, quarantineThreshold: 30 });

                expect(result.flakyCount).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 100 },
        );
    });

    it('quarantinedCount is always <= flakyCount', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), fc.float({ min: 0, max: 100, noNaN: true }), (n, rate) => {
                const flaky: FlakyResult[] = Array.from({ length: n }, (_, i) => ({
                    title: `test-${i}`,
                    rate,
                    runs: 10,
                }));
                const result = calcQuarantineStatus(flaky, { minRuns: 1, quarantineThreshold: 30 });

                expect(result.quarantinedCount).toBeLessThanOrEqual(result.flakyCount);
            }),
            { numRuns: 100 },
        );
    });

    it('quarantinedCount is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.nat({ max: 50 }), (n) => {
                const flaky: FlakyResult[] = Array.from({ length: n }, (_, i) => ({
                    title: `test-${i}`,
                    rate: 50,
                    runs: 10,
                }));
                const result = calcQuarantineStatus(flaky, { minRuns: 1, quarantineThreshold: 30 });

                expect(result.quarantinedCount).toBeGreaterThanOrEqual(0);
            }),
            { numRuns: 100 },
        );
    });
});
