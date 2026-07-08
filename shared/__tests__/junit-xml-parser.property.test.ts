import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseJUnitXml } from '../junit-xml-parser.js';
import { assertNullOr } from '../test-utils/assertions.js';

describe('JUnit-xml-parser — property-based', () => {
    it('parseJUnitXml returns null or total matches tests length', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                assertNullOr(
                    result,
                    (r) => {
                        expect(r.stats.total).toBe(r.tests.length);
                    },
                    () => {
                        expect(result).toBeNull();
                    },
                );
            }),
            { numRuns: 100 },
        );
    });

    it('passed + failed + skipped === total when result is non-null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                assertNullOr(
                    result,
                    (r) => {
                        const sum = r.stats.passed + r.stats.failed + r.stats.skipped;

                        expect(sum).toBe(r.stats.total);
                    },
                    () => {
                        expect(result).toBeNull();
                    },
                );
            }),
            { numRuns: 100 },
        );
    });

    it('duration is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                assertNullOr(
                    result,
                    (r) => {
                        expect(r.stats.duration).toBeGreaterThanOrEqual(0);
                    },
                    () => {
                        expect(result).toBeNull();
                    },
                );
            }),
            { numRuns: 100 },
        );
    });

    it('each test status is one of passed, failed, skipped, error', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                const validStatuses = new Set(['passed', 'failed', 'skipped', 'error']);
                assertNullOr(
                    result,
                    (r) => {
                        for (const test of r.tests) {
                            expect(validStatuses.has(test.status)).toBeTruthy();
                        }
                    },
                    () => {
                        expect(result).toBeNull();
                    },
                );
            }),
            { numRuns: 100 },
        );
    });
});
