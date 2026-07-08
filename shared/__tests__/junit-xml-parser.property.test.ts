import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseJUnitXml } from '../junit-xml-parser.js';

describe('JUnit-xml-parser — property-based', () => {
    it('parseJUnitXml returns null or total matches tests length', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);

                expect(result === null || result.stats.total === result.tests.length).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('passed + failed + skipped === total when result is non-null', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);
                const sum = result === null ? 0 : result.stats.passed + result.stats.failed + result.stats.skipped;

                expect(result === null || sum === result.stats.total).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('duration is always >= 0', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.string({ maxLength: 2000 }), (xml) => {
                const result = parseJUnitXml(xml);

                expect(result === null || result.stats.duration >= 0).toBeTruthy();
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
                const allValid = result !== null && result.tests.every((t) => validStatuses.has(t.status));

                expect(result === null || allValid).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });
});
