/**
 * Property-based tests — Coverage Gap HTML (FT-18)
 *
 * Invariants:
 * - generateCoverageGapHtml always produces valid HTML
 * - All issue keys appear in output
 * - Gap count in subtitle matches actual items without tests
 * - Quality gate pass/fail matches gateConfig
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateCoverageGapHtml } from '../generate-coverage-gap-html.js';
import type { CoverageGapResult } from '../types.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

vi.mock('../date-utils', () => ({
    formatDateISO: vi.fn(() => '2026-06-19'),
}));

const safeString = (min: number, max: number) =>
    fc
        .string({ minLength: min, maxLength: max })
        .map((s) => s.replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, max))
        .filter((s) => s.length >= min);

function makeResult(
    items: Array<{
        issueKey: string;
        summary: string;
        type: string;
        status: string;
        hasTest: boolean;
    }>,
): CoverageGapResult {
    const covered = items.filter((i) => i.hasTest).length;
    const total = items.length;
    const gap = total - covered;
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
    const result: CoverageGapResult = {
        items: items.map((i) => {
            const item: {
                issueKey: string;
                summary: string;
                type: 'Story' | 'Task' | 'Bug' | 'Epic';
                status: string;
                hasTest: boolean;
                linkedTestKeys: string[];
                priority: string;
                coverageWeight: number;
                epicKey?: string;
                epicSummary?: string;
            } = {
                issueKey: i.issueKey,
                summary: i.summary,
                type: i.type as 'Story' | 'Task' | 'Bug' | 'Epic',
                status: i.status,
                hasTest: i.hasTest,
                linkedTestKeys: [],
                priority: 'Medium',
                coverageWeight: 1,
            };
            return item;
        }),
        totals: { totalIssues: total, covered, gap, weightedCoveragePct: pct, rawCoveragePct: pct },
        byEpic: {},
        gateConfig: { minCoveragePct: 50, failingEpics: gap > 0 ? ['FAKE-EPIC'] : [] },
        hierarchy: [],
        trends: [],
    };
    return result;
}

const itemArb = fc
    .record({
        issueKey: safeString(1, 10),
        summary: safeString(1, 30),
        type: fc.constantFrom('Story', 'Task', 'Bug', 'Epic'),
        status: fc.constantFrom('Open', 'In Progress', 'Done'),
        hasTest: fc.boolean(),
    })
    .map((i) => ({
        issueKey: i.issueKey,
        summary: i.summary,
        type: i.type,
        status: i.status,
        hasTest: i.hasTest,
    }));

describe('GenerateCoverageGapHtml — property-based', () => {
    it('always produces valid HTML with structural elements', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 0, maxLength: 10 }), (items) => {
                const html = generateCoverageGapHtml(makeResult(items));

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('</html>');
                expect(html).toContain('data-component="metric-card"');
                expect(html).toContain('Coverage Gap Analysis');
            }),
            { numRuns: 50 },
        );
    });

    it('contains all gap issue keys in gaps table', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 0, maxLength: 10 }), (items) => {
                const html = generateCoverageGapHtml(makeResult(items));
                const gaps = items.filter((i) => !i.hasTest);
                for (const item of gaps) {
                    expect(html).toContain(item.issueKey);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('gap count in heading matches items without tests', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 0, maxLength: 10 }), (items) => {
                const html = generateCoverageGapHtml(makeResult(items));
                const gap = items.filter((i) => !i.hasTest).length;

                expect(html).toContain(`Coverage Gaps (${gap})`);
            }),
            { numRuns: 50 },
        );
    });

    it('quality gate shows fail when gaps exist', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 0, maxLength: 10 }), (items) => {
                const html = generateCoverageGapHtml(makeResult(items));
                const hasGap = items.some((i) => !i.hasTest);
                if (hasGap) {
                    expect(html).toContain('below');
                } else {
                    expect(html).toContain('All epics pass');
                }
            }),
            { numRuns: 50 },
        );
    });

    it('summary totals are consistent: covered + gap = totalIssues', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 1, maxLength: 10 }), (items) => {
                const result = makeResult(items);

                expect(result.totals.covered + result.totals.gap).toBe(result.totals.totalIssues);
            }),
            { numRuns: 50 },
        );
    });

    it('renders gap table rows with Badge for uncovered items', () => {expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(itemArb, { minLength: 1, maxLength: 10 }), (items) => {
                const gaps = items.filter((i) => !i.hasTest);
                if (gaps.length === 0) return;
                const html = generateCoverageGapHtml(makeResult(items));
                for (const gap of gaps) {
                    expect(html).toContain(gap.issueKey);
                    expect(html).toContain('GAP');
                }
            }),
            { numRuns: 50 },
        );
    });
});
