/**
 * Property-based tests — Flakiness Dashboard HTML (FT-19)
 *
 * Invariants:
 * - generateFlakinessHtml always produces valid HTML
 * - All high-flakiness entry titles appear in output
 * - Summary count matches filterHighFlakiness().length
 * - Error severity when >5 high entries
 * - Empty input shows no-threshold message
 * - Never outputs NaN or Infinity strings
 * - HTML always contains structural elements (metric-card, heading)
 * - Summary cards always show threshold and all-candidates count
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFlakinessHtml, filterHighFlakiness } from '../flakiness-dashboard.js';
import type { FlakinessEntry } from '../types/data-hub.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeTitle = fc
    .string({ minLength: 1, maxLength: 20 })
    .map((s) => s.replace(/[^a-zA-Z0-9 _.-]/g, '_'))
    .filter((s) => !/nan|infinity/i.test(s));

const nanEntry: FlakinessEntry = {
    title: 'NaN-rate',
    project: 'test',
    passCount: 0,
    failCount: 0,
    skipCount: 0,
    totalRuns: 1,
    rate: NaN,
};
const infEntry: FlakinessEntry = {
    title: 'Inf-rate',
    project: 'test',
    passCount: 0,
    failCount: 10,
    skipCount: 0,
    totalRuns: 10,
    rate: Infinity,
};
const negInfEntry: FlakinessEntry = {
    title: 'NegInf-rate',
    project: 'test',
    passCount: 10,
    failCount: 0,
    skipCount: 0,
    totalRuns: 10,
    rate: -Infinity,
};

const extremeEntryArb: fc.Arbitrary<FlakinessEntry> = fc.oneof(
    fc.constant(nanEntry),
    fc.constant(infEntry),
    fc.constant(negInfEntry),
);

const flakyEntryArb: fc.Arbitrary<FlakinessEntry> = fc
    .record({
        title: safeTitle,
        passCount: fc.nat({ max: 100 }),
        failCount: fc.nat({ max: 100 }),
        skipCount: fc.nat({ max: 100 }),
    })
    .map(({ title, passCount, failCount, skipCount }) => {
        const totalRuns = passCount + failCount + skipCount || 1;
        return {
            title,
            project: 'test',
            passCount,
            failCount,
            skipCount,
            totalRuns,
            rate: failCount / totalRuns,
        };
    });

describe('GenerateFlakinessHtml — property-based', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('always produces valid HTML with structural elements', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
                expect(html).toContain('data-component="metric-card"');
                expect(html).toContain('Flakiness Dashboard');
            }),
            { numRuns: 50 },
        );
    });

    it('contains all high-flakiness entry titles', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const high = filterHighFlakiness(entries);
                for (const entry of high) {
                    expect(html).toContain(entry.title);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('summary count matches filterHighFlakiness length', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const count = filterHighFlakiness(entries).length;

                expect(html).toContain(count > 0 ? String(count) : '');
            }),
            { numRuns: 50 },
        );
    });

    it('shows error severity when >5 high-flakiness entries', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const count = filterHighFlakiness(entries).length;

                expect(html).toContain(count > 5 ? 'data-severity="error"' : '');
            }),
            { numRuns: 50 },
        );
    });

    it('shows no-threshold message when empty or all below threshold', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const high = filterHighFlakiness(entries);

                expect(html).toContain(high.length === 0 ? 'No tests exceed' : '');
            }),
            { numRuns: 50 },
        );
    });

    it('never outputs NaN or Infinity in HTML', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(fc.oneof(flakyEntryArb, extremeEntryArb), { minLength: 0, maxLength: 10 }),
                (entries) => {
                    const html = generateFlakinessHtml(entries);

                    expect(html).not.toContain('NaN');
                    expect(html).not.toContain('Infinity');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('always shows summary cards with threshold and all-candidates count', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);

                expect(html).toContain('Threshold');
                expect(html).toContain('All Candidates');
                expect(html).toContain(String(entries.length));
            }),
            { numRuns: 50 },
        );
    });
});
