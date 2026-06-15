/**
 * Property-based tests — Flakiness Dashboard HTML (FT-19)
 *
 * Invariants:
 * - generateFlakinessHtml always produces valid HTML
 * - All high-flakiness entry titles appear in output
 * - Summary count matches filterHighFlakiness().length
 * - Error severity when >5 high entries
 * - Empty input shows no-threshold message
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFlakinessHtml, filterHighFlakiness } from '../flakiness-dashboard.js';
import type { FlakinessEntry } from '../metrics.js';

vi.mock('../logger.js', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeTitle = fc.string({ minLength: 1, maxLength: 20 }).map((s) => s.replace(/[^a-zA-Z0-9 _.-]/g, '_'));

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
            passCount,
            failCount,
            skipCount,
            totalRuns,
            rate: failCount / totalRuns,
        };
    });

describe('generateFlakinessHtml — property-based', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('always produces valid HTML', () => {
        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });

    it('contains all high-flakiness entry titles', () => {
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
        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const count = filterHighFlakiness(entries).length;
                if (count > 0) {
                    expect(html).toContain(String(count));
                }
            }),
            { numRuns: 50 },
        );
    });

    it('shows error severity when >5 high-flakiness entries', () => {
        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const count = filterHighFlakiness(entries).length;
                if (count > 5) {
                    expect(html).toContain('data-severity="error"');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('shows no-threshold message when empty or all below threshold', () => {
        fc.assert(
            fc.property(fc.array(flakyEntryArb, { minLength: 0, maxLength: 10 }), (entries) => {
                const html = generateFlakinessHtml(entries);
                const high = filterHighFlakiness(entries);
                if (high.length === 0) {
                    expect(html).toContain('No tests exceed');
                }
            }),
            { numRuns: 50 },
        );
    });
});
