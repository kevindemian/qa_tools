import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyFailures } from '../../extractors/failure-classifier.js';

describe('Failure-classifier — property-based', () => {
    it('empty input returns empty array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constant({}), (input) => {
                const result = classifyFailures(input);

                expect(result).toStrictEqual([]);
            }),
            { numRuns: 10 },
        );
    });

    it('result is always an array', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.object({ maxDepth: 2 }), (input) => {
                const result = classifyFailures(input);

                expect(Array.isArray(result)).toBeTruthy();
            }),
            { numRuns: 100 },
        );
    });

    it('fromSteps only includes entries with conclusion failure', () => {
        expect.hasAssertions();

        const conclusions = fc.constantFrom('success', 'failure', 'cancelled', 'skipped');

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        name: fc.string({ maxLength: 50 }),
                        conclusion: conclusions,
                        number: fc.nat({ max: 100 }),
                    }),
                    { maxLength: 20 },
                ),
                (steps) => {
                    const result = classifyFailures({ githubSteps: steps });
                    for (const entry of result) {
                        expect(entry.reason).toBe('failure');
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('fromAnnotations only includes entries with annotation_level failure', () => {
        expect.hasAssertions();

        const levels = fc.constantFrom('failure', 'warning', 'notice');

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        path: fc.string({ maxLength: 50 }),
                        start_line: fc.nat({ max: 1000 }),
                        end_line: fc.nat({ max: 1000 }),
                        message: fc.string({ maxLength: 100 }),
                        annotation_level: levels,
                    }),
                    { maxLength: 20 },
                ),
                (annotations) => {
                    const result = classifyFailures({ checkRunAnnotations: annotations });
                    for (const entry of result) {
                        expect(entry.file).toBeDefined();
                    }
                },
            ),
            { numRuns: 50 },
        );
    });

    it('fromLog deduplicates: same message appears at most once', () => {
        expect.hasAssertions();

        const msg = 'Error: ' + 'x'.repeat(20);
        fc.assert(
            fc.property(fc.array(fc.constant(msg), { maxLength: 50 }), (messages) => {
                const log = messages.join('\n');
                const result = classifyFailures({ logText: log });
                const msgs = result.map((e) => e.message).filter((m): m is string => m != null);
                const unique = new Set(msgs);

                expect(msgs).toHaveLength(unique.size);
            }),
            { numRuns: 50 },
        );
    });
});
