import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseTestSummaryFromLogs } from '../log-parser.js';
import { assertNullOr } from '../test-utils/assertions.js';

describe('Log-parser — property-based', () => {
    it('output always has failures array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (log) => {
                const result = parseTestSummaryFromLogs(log);

                expect(Array.isArray(result.failures)).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('empty string returns empty failures', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constant(''), (log) => {
                const result = parseTestSummaryFromLogs(log);

                expect(result.failures).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('failures deduplication: same message appears at most once', () => {
        expect.hasAssertions();

        const msg = 'Error: ' + 'x'.repeat(20);
        fc.assert(
            fc.property(fc.array(fc.constant(msg), { maxLength: 50 }), (messages) => {
                const log = messages.join('\n');
                const result = parseTestSummaryFromLogs(log);
                const count = result.failures.filter((f) => f.includes(msg.substring(7))).length;

                expect(count).toBeLessThanOrEqual(1);
            }),
            { numRuns: 50 },
        );
    });

    it('short strings (< 10 chars) never appear as failures', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 5 }), (shortStr) => {
                const log = `Error: ${shortStr}`;
                const result = parseTestSummaryFromLogs(log);

                expect(result.failures.length).toBeGreaterThanOrEqual(0);

                for (const f of result.failures) {
                    expect(f.length).toBeGreaterThanOrEqual(10);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('testCounts when present has total >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (log) => {
                const result = parseTestSummaryFromLogs(log);
                assertNullOr(
                    result.testCounts,
                    (tc) => {
                        expect(tc.total).toBeGreaterThanOrEqual(0);
                        expect(tc.passed).toBeGreaterThanOrEqual(0);
                    },
                    () => {
                        expect(result.testCounts == null).toBeTruthy();
                    },
                );
            }),
            { numRuns: 100 },
        );
    });
});
