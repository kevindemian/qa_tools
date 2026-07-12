import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseTestSummaryFromLogs, parseFailureRecordsFromLogs, stripAnsi } from '../log-parser.js';
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

    it('parseFailureRecordsFromLogs always returns an array (never null/undefined)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 4000 }), (log) => {
                const recs = parseFailureRecordsFromLogs(log);

                expect(Array.isArray(recs)).toBeTruthy();
            }),
            { numRuns: 200 },
        );
    });

    it('every FailureRecord has finite confidence in [0,1], source log, valid status', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 4000 }), (log) => {
                const recs = parseFailureRecordsFromLogs(log);

                expect(Array.isArray(recs)).toBeTruthy();

                for (const r of recs) {
                    expect(Number.isFinite(r.confidence)).toBeTruthy();

                    expect(r.confidence).toBeGreaterThanOrEqual(0);

                    expect(r.confidence).toBeLessThanOrEqual(1);

                    expect(r.source).toBe('log');

                    expect(['failed', 'broken', 'skipped']).toContain(r.status);

                    expect(typeof r.name).toBe('string');

                    expect(r.name.length).toBeGreaterThan(0);
                }
            }),
            { numRuns: 200 },
        );
    });

    it('stripAnsi never emits the ESC control character', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (s) => {
                const out = stripAnsi(s);

                expect(out.includes(String.fromCharCode(27))).toBeFalsy();
            }),
            { numRuns: 200 },
        );
    });

    it('stripAnsi is idempotent: stripAnsi(stripAnsi(x)) === stripAnsi(x)', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (s) => {
                expect(stripAnsi(stripAnsi(s))).toBe(stripAnsi(s));
            }),
            { numRuns: 200 },
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
