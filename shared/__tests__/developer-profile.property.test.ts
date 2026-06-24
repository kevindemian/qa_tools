/**
 * Property-Based Tests — Developer Profile (FT-27)
 *
 * Invariants:
 * - buildDeveloperProfile: totalAuthors matches unique authors, totalFailures sums correctly
 * - failureRate = (totalFailures / testsTouched) * 100
 * - topFailureCategory is the category with highest count
 * - null/undefined returns empty result
 * - generateDeveloperProfileHtml always produces valid HTML
 */
import * as fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { buildDeveloperProfile, generateDeveloperProfileHtml } from '../developer-profile.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

/* ── Helpers ─────────────────────────────────────────────────── */

const categoryArb = fc.constantFrom('api', 'ui', 'db', 'auth', 'integration', 'performance', 'security');
const authorArb = fc.constantFrom('alice', 'bob', 'charlie', 'dave', 'eve');

const failureArb = fc
    .record({
        testTitle: fc.string({ minLength: 1, maxLength: 10 }),
        category: categoryArb,
        timestamp: fc.constant(new Date().toISOString()),
        author: fc.option(authorArb, { nil: undefined }),
    })
    .map((r): { testTitle: string; category: string; timestamp: string; author?: string } => ({
        testTitle: r.testTitle,
        category: r.category,
        timestamp: r.timestamp,
        ...(r.author !== undefined ? { author: r.author } : {}),
    }));

/* ── Tests ───────────────────────────────────────────────────── */

describe('BuildDeveloperProfile — property-based', () => {
    it('totalAuthors equals number of unique authors (Unknown for missing)', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 30 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                const uniqueAuthors = new Set(failures.map((f) => f.author ?? 'Unknown'));

                expect(result.totalAuthors).toBe(uniqueAuthors.size);
            }),
            { numRuns: 50 },
        );
    });

    it('totalFailures equals input length', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 30 }), (failures) => {
                const result = buildDeveloperProfile(failures);

                expect(result.totalFailures).toBe(failures.length);
            }),
            { numRuns: 50 },
        );
    });

    it('sum of author totalFailures equals totalFailures', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 30 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                const sum = result.authors.reduce((s, a) => s + a.totalFailures, 0);

                expect(sum).toBe(result.totalFailures);
            }),
            { numRuns: 50 },
        );
    });

    it('failureRate is (totalFailures / testsTouched) * 100', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 30 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                for (const author of result.authors) {
                    const expected = author.testsTouched > 0 ? (author.totalFailures / author.testsTouched) * 100 : 0;

                    expect(author.failureRate).toBeCloseTo(expected, 5);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('topFailureCategory is the category with highest count', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 30 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                for (const author of result.authors) {
                    const entries = Object.entries(author.categories);
                    if (entries.length === 0) {
                        expect(author.topFailureCategory).toBe('');
                    } else {
                        const maxCount = Math.max(...entries.map(([, c]) => c));
                        const topCats = entries.filter(([, c]) => c === maxCount).map(([cat]) => cat);

                        expect(topCats).toContain(author.topFailureCategory);
                    }
                }
            }),
            { numRuns: 50 },
        );
    });

    it('returns empty result for null input', () => {
        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = buildDeveloperProfile(null);

                expect(result.authors).toEqual([]);
                expect(result.totalAuthors).toBe(0);
                expect(result.totalFailures).toBe(0);
            }),
            { numRuns: 10 },
        );
    });

    it('returns empty result for undefined input', () => {
        fc.assert(
            fc.property(fc.boolean(), () => {
                const result = buildDeveloperProfile(undefined);

                expect(result.authors).toEqual([]);
                expect(result.totalAuthors).toBe(0);
                expect(result.totalFailures).toBe(0);
            }),
            { numRuns: 10 },
        );
    });
});

describe('GenerateDeveloperProfileHtml — property-based', () => {
    it('always produces valid HTML with DOCTYPE', () => {
        fc.assert(
            fc.property(
                fc.array(failureArb, { maxLength: 10 }),
                fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
                (failures, customTitle) => {
                    const result = buildDeveloperProfile(failures);
                    const html = generateDeveloperProfileHtml(result, customTitle ?? undefined);

                    expect(html).toContain('<!DOCTYPE html>');
                    expect(html).toContain('</html>');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('contains summary cards with totalAuthors and totalFailures', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { maxLength: 10 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                const html = generateDeveloperProfileHtml(result);

                expect(html).toContain('Total Authors');
                expect(html).toContain('Total Failures');
                expect(html).toContain(String(result.totalAuthors));
                expect(html).toContain(String(result.totalFailures));
            }),
            { numRuns: 50 },
        );
    });

    it('renders author sections when authors exist', () => {
        fc.assert(
            fc.property(fc.array(failureArb, { minLength: 1, maxLength: 10 }), (failures) => {
                const result = buildDeveloperProfile(failures);
                const html = generateDeveloperProfileHtml(result);
                for (const author of result.authors) {
                    expect(html).toContain(author.author);
                }
            }),
            { numRuns: 50 },
        );
    });
});
