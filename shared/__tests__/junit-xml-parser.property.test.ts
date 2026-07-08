import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseJUnitXml } from '../junit-xml-parser.js';

describe('JUnit-xml-parser — property-based', () => {
    it('parseJUnitXml returns null or total matches tests length', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                if (result !== null) {
                    expect(result.stats.total).toBe(result.tests.length);
                } else {
                    expect(result).toBeNull();
                }
            }),
            { numRuns: 100 },
        );
    });

    it('passed + failed + skipped === total when result is non-null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                if (result !== null) {
                    const sum = result.stats.passed + result.stats.failed + result.stats.skipped;
                    expect(sum).toBe(result.stats.total);
                } else {
                    expect(result).toBeNull();
                }
            }),
            { numRuns: 100 },
        );
    });

    it('duration is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                if (result !== null) {
                    expect(result.stats.duration).toBeGreaterThanOrEqual(0);
                } else {
                    expect(result).toBeNull();
                }
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
                if (result !== null) {
                    expect(result.tests.length).toBeGreaterThanOrEqual(0);
                    for (const test of result.tests) {
                        expect(validStatuses.has(test.status)).toBe(true);
                    }
                } else {
                    expect(result).toBeNull();
                }
            }),
            { numRuns: 100 },
        );
    });
});
