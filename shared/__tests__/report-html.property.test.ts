/**
 * Property-based tests — HTML Report (FT-17)
 *
 * Invariants:
 * - generateCoverageHtml: coverage pct matches global calc, per-epic badge matches local calc
 * - generateHtmlReport: always produces valid HTML, contains all test titles
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { generateCoverageHtml, generateHtmlReport } from '../report-html.js';
import type { FlatTest } from '../result_parser.js';

vi.mock('../logger', () => ({
    rootLogger: { error: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

vi.mock('../config', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));

const safeString = (min: number, max: number) =>
    fc
        .stringMatching(/^[a-zA-Z0-9 _.-]+$/)
        .map((s) => s.slice(0, max))
        .filter((s) => s.length >= min);

const statusArb = fc.constantFrom('Done', 'Closed', 'In Progress', 'Open', 'To Do');
const issueArb = fc.record({
    key: safeString(1, 10),
    summary: safeString(1, 30),
    status: statusArb,
    type: fc.constantFrom('Task', 'Bug', 'Story'),
});

const epicArb = fc.record({
    key: safeString(1, 10),
    summary: safeString(1, 30),
    issues: fc.array(issueArb, { minLength: 0, maxLength: 10 }),
});

const flatTestArb: fc.Arbitrary<FlatTest> = fc.record({
    title: safeString(1, 20),
    state: fc.constantFrom('passed', 'failed', 'skipped'),
    duration: fc.integer({ min: 0, max: 60000 }),
});

describe('GenerateCoverageHtml — property-based', () => {
    it('coverage MetricCard matches global calculation', () => {
        fc.assert(
            fc.property(fc.array(epicArb, { minLength: 0, maxLength: 5 }), (epics) => {
                const html = generateCoverageHtml(epics);
                const total = epics.reduce((s, e) => s + e.issues.length, 0);
                const closed = epics.reduce(
                    (s, e) => s + e.issues.filter((i) => i.status === 'Done' || i.status === 'Closed').length,
                    0,
                );
                const expectedPct = total > 0 ? ((closed / total) * 100).toFixed(1) + '%' : '0.0%';

                expect(html).toContain(expectedPct);
            }),
            { numRuns: 50 },
        );
    });

    it('each epic badge shows its own close percentage', () => {
        fc.assert(
            fc.property(fc.array(epicArb, { minLength: 1, maxLength: 5 }), (epics) => {
                const html = generateCoverageHtml(epics);
                for (const e of epics) {
                    const closed = e.issues.filter((i) => i.status === 'Done' || i.status === 'Closed').length;
                    const expectedPct = e.issues.length > 0 ? ((closed / e.issues.length) * 100).toFixed(1) : '0.0';

                    expect(html).toContain(expectedPct);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('every epic key appears in output', () => {
        fc.assert(
            fc.property(fc.array(epicArb, { minLength: 0, maxLength: 5 }), (epics) => {
                const html = generateCoverageHtml(epics);
                for (const e of epics) {
                    expect(html).toContain(e.key);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('every issue key appears in output', () => {
        fc.assert(
            fc.property(fc.array(epicArb, { minLength: 0, maxLength: 5 }), (epics) => {
                const html = generateCoverageHtml(epics);
                for (const e of epics) {
                    for (const issue of e.issues) {
                        expect(html).toContain(issue.key);
                    }
                }
            }),
            { numRuns: 50 },
        );
    });

    it('coverage is 0.0 when no epics', () => {
        const html = generateCoverageHtml([]);

        expect(html).toContain('0.0');
    });
});

describe('GenerateHtmlReport — property-based', () => {
    it('contains all test titles', () => {
        fc.assert(
            fc.property(fc.array(flatTestArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const html = generateHtmlReport(tests);
                for (const t of tests) {
                    expect(html).toContain(t.title);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('always produces valid HTML structure', () => {
        fc.assert(
            fc.property(fc.array(flatTestArb, { minLength: 0, maxLength: 10 }), (tests) => {
                const html = generateHtmlReport(tests);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('<html');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });
});

describe('GenerateCoverageHtml — invariants (property-based)', () => {
    it('always produces valid HTML structure', () => {
        fc.assert(
            fc.property(fc.array(epicArb, { minLength: 0, maxLength: 5 }), (epics) => {
                const html = generateCoverageHtml(epics);

                expect(html).toContain('<!DOCTYPE html>');
                expect(html).toContain('<html');
                expect(html).toContain('</html>');
            }),
            { numRuns: 50 },
        );
    });
});
