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
} from '../backlog-health.js';
import type { BacklogHealthIssue } from '../backlog-health.js';

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

describe('analyzeBacklogHealth — property-based', () => {
    it('unassigned count matches direct filter', () => {
        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                expect(result.unassignedIssues.length).toBe(countUnassigned(result.unassignedIssues));
            }),
            { numRuns: 50 },
        );
    });

    it('analyzeUnassignedIssues matches filter for all issues', () => {
        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeUnassignedIssues(issues);
                for (const issue of result) {
                    expect(issue.assignee === null || issue.assignee === '').toBe(true);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('analyzeBugsWithoutTests filters Bug type with zero linked tests', () => {
        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBugsWithoutTests(issues);
                for (const issue of result) {
                    expect(issue.type).toBe('Bug');
                    expect(issue.linkedTestCount).toBe(0);
                }
            }),
            { numRuns: 50 },
        );
    });

    it('bugsWithoutTests count matches direct filter', () => {
        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 50 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const expected = countBugsWithoutTests(issues);
                expect(result.bugsWithoutTests.length).toBe(expected);
            }),
            { numRuns: 50 },
        );
    });

    it('score is always in [0, 100]', () => {
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

describe('generateBacklogHealthHtml — property-based', () => {
    it('always contains backlog-health id', () => {
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
        fc.assert(
            fc.property(fc.array(issueArb, { maxLength: 30 }), (issues) => {
                const result = analyzeBacklogHealth(issues);
                const html = generateBacklogHealthHtml(result);
                expect(html).toContain('Backlog Score');
                expect(html).toContain(String(result.score) + '%');
            }),
            { numRuns: 50 },
        );
    });
});
