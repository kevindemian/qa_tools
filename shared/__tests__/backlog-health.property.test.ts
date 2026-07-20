/**
 * Property-Based Tests — Backlog Health (FT-28)
 *
 * Invariants:
 * - analyzeBacklogHealth: unassigned/stale/bugs counts match deterministic filters
 * - score is always in [0, 100]
 * - densityByEpic bugCount sums correctly
 * - generateBacklogHealthHtml always contains key markers
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
    analyzeBacklogHealth,
    analyzeUnassignedIssues,
    analyzeBugsWithoutTests,
    generateBacklogHealthHtml,
} from '../report/backlog-health.js';
import type { BacklogHealthIssue } from '../report/backlog-health.js';

/* ── Helpers ─────────────────────────────────────────────────── */

const now = new Date();
function daysAgo(d: number): string {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    return date.toISOString();
}

const issueArb: fc.Arbitrary<BacklogHealthIssue> = fc.record({
    key: fc.string({ minLength: 3, maxLength: 10 }).map((s) => 'A-' + s),
    summary: fc.string({ minLength: 1, maxLength: 20 }),
    assignee: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
    updated: fc.integer({ min: 1, max: 365 }).map((d) => daysAgo(d)),
    type: fc.constantFrom('Bug', 'Task', 'Story', 'Epic'),
    priority: fc.constantFrom('low', 'medium', 'high', 'critical'),
    linkedTestCount: fc.nat({ max: 10 }),
});

function countUnassigned(issues: BacklogHealthIssue[]): number {
    return issues.filter((i) => i.assignee === null || i.assignee === '').length;
}

function countBugsWithoutTests(issues: BacklogHealthIssue[]): number {
    return issues.filter((i) => i.type === 'Bug' && i.linkedTestCount === 0).length;
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('AnalyzeBacklogHealth — property-based', () => {
    it('unassigned count matches direct filter', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);

                expect(result.unassignedIssues).toHaveLength(countUnassigned(result.unassignedIssues));
            }),
            { numRuns: 50 },
        );
    });

    it('unassigned count matches direct filter on input, not result', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);

                expect(result.unassignedIssues).toHaveLength(countUnassigned(issues));
            }),
            { numRuns: 50 },
        );
    });

    it('analyzeUnassignedIssues matches filter for all issues', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeUnassignedIssues(issues);
                for (const issue of result) {
                    expect(issue.assignee === null || issue.assignee === '').toBeTruthy();
                }
            }),
            { numRuns: 50 },
        );
    });

    it('analyzeBugsWithoutTests filters Bug type with zero linked tests', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBugsWithoutTests(issues);
                for (const issue of result) {
                    expect(issue.type).toBe('Bug');
                    expect(issue.linkedTestCount).toBe(0);
                }

                expect(result.length).toBeLessThanOrEqual(issues.length);
            }),
            { numRuns: 50 },
        );
    });

    it('bugsWithoutTests count matches direct filter', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const expected = countBugsWithoutTests(issues);

                expect(result.bugsWithoutTests).toHaveLength(expected);
            }),
            { numRuns: 50 },
        );
    });

    it('score is always in [0, 100]', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);

                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(100);
            }),
            { numRuns: 50 },
        );
    });

    it('densityByEpic bugCount sums to total bugs in issues', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { minLength: 1, maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const totalBugsFromDensity = result.densityByEpic.reduce((s, e) => s + e.bugCount, 0);
                const totalBugsFromIssues = issues.filter((i) => i.type === 'Bug').length;

                expect(totalBugsFromDensity).toBe(totalBugsFromIssues);
            }),
            { numRuns: 50 },
        );
    });

    it('stale issues filtered by staleDays threshold', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), fc.integer({ min: 1, max: 90 }), (issues, staleDays) => {
                const result = analyzeBacklogHealth(issues, { staleDays });
                for (const issue of result.staleIssues) {
                    const days = Math.floor(
                        (now.getTime() - new Date(issue.updated).getTime()) / (1000 * 60 * 60 * 24),
                    );

                    expect(days).toBeGreaterThan(staleDays);
                }
            }),
            { numRuns: 50 },
        );
    });
});

describe('GenerateBacklogHealthHtml — property-based', () => {
    it('always contains backlog-health id', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 30 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const html = generateBacklogHealthHtml(result);

                expect(html).toContain('backlog-health');
            }),
            { numRuns: 50 },
        );
    });

    it('always contains Backlog Score', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 30 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const html = generateBacklogHealthHtml(result);

                expect(html).toContain('Backlog Score');

                const expected = result.noData ? 'N/A' : String(result.score) + '%';

                expect(html).toContain(expected);
            }),
            { numRuns: 50 },
        );
    });
});
