/**
 * Tests for shared/data-hub/compute/coverage-gap.ts
 *
 * Strategy: zero mocks — all primitives run real code.
 * Tests exercise the full pipeline: raw data → format → compute → hierarchy.
 */

import { describe, expect, it } from 'vitest';
import { computeCoverageGap } from '../data-hub/compute/coverage-gap.js';
import type { RawJiraIssue } from '../types/data-hub.js';

function makeIssue(overrides: Partial<RawJiraIssue> & { key: string }): RawJiraIssue {
    return {
        summary: `Summary for ${overrides.key}`,
        status: 'To Do',
        type: 'Story',
        labels: [],
        fixVersions: [],
        components: [],
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('ComputeCoverageGap', () => {
    describe('Empty inputs', () => {
        it('returns zero totals for empty issues', () => {
            const result = computeCoverageGap([], new Map());

            expect(result.items).toStrictEqual([]);
            expect(result.totals.totalIssues).toBe(0);
            expect(result.totals.covered).toBe(0);
            expect(result.totals.gap).toBe(0);
            expect(result.byEpic).toStrictEqual({});
            expect(result.hierarchy).toStrictEqual([]);
            expect(result.trends).toStrictEqual([]);
        });
    });

    describe('RawToJiraFormat conversion', () => {
        it('maps RawJiraIssue fields to Jira format correctly', () => {
            const issues = [
                makeIssue({
                    key: 'PROJ-1',
                    summary: 'Login feature',
                    status: 'Done',
                    type: 'Bug',
                    labels: ['auth'],
                    fixVersions: ['v1.0'],
                    priority: 'High',
                }),
            ];
            const result = computeCoverageGap(issues, new Map());

            expect(result.items).toHaveLength(1);
            expect(result.items[0]?.issueKey).toBe('PROJ-1');
            expect(result.items[0]?.summary).toBe('Login feature');
        });

        it('handles missing priority gracefully', () => {
            const issues = [makeIssue({ key: 'PROJ-1', priority: undefined })];
            const result = computeCoverageGap(issues, new Map());

            expect(result.items).toHaveLength(1);
            expect(result.items[0]?.issueKey).toBe('PROJ-1');
        });

        it('maps fixVersions to name objects', () => {
            const issues = [makeIssue({ key: 'PROJ-1', fixVersions: ['v1', 'v2'] })];
            const result = computeCoverageGap(issues, new Map());

            expect(result.items).toHaveLength(1);
        });
    });

    describe('Coverage items from test links', () => {
        it('marks issues with linked tests as covered', () => {
            const issues = [makeIssue({ key: 'PROJ-1' })];
            const testLinkMap = new Map([['PROJ-1', ['TEST-1', 'TEST-2']]]);
            const result = computeCoverageGap(issues, testLinkMap);

            expect(result.items[0]?.hasTest).toBeTruthy();
            expect(result.totals.covered).toBe(1);
            expect(result.totals.gap).toBe(0);
        });

        it('marks issues without linked tests as uncovered', () => {
            const issues = [makeIssue({ key: 'PROJ-1' })];
            const result = computeCoverageGap(issues, new Map());

            expect(result.items[0]?.hasTest).toBeFalsy();
            expect(result.totals.covered).toBe(0);
            expect(result.totals.gap).toBe(1);
        });

        it('computes mixed coverage correctly', () => {
            const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' }), makeIssue({ key: 'PROJ-3' })];
            const testLinkMap = new Map([
                ['PROJ-1', ['TEST-1']],
                ['PROJ-3', ['TEST-3']],
            ]);
            const result = computeCoverageGap(issues, testLinkMap);

            expect(result.totals.totalIssues).toBe(3);
            expect(result.totals.covered).toBe(2);
            expect(result.totals.gap).toBe(1);
        });
    });

    describe('Test links from raw (N6 SSOT)', () => {
        it('marks issue as covered when linkedTestKeys is present on the raw issue (no external map)', () => {
            const issues = [makeIssue({ key: 'PROJ-1', linkedTestKeys: ['TEST-1', 'TEST-2'] })];
            const result = computeCoverageGap(issues);

            expect(result.items[0]?.hasTest).toBeTruthy();
            expect(result.items[0]?.linkedTestKeys).toStrictEqual(['TEST-1', 'TEST-2']);
            expect(result.totals.covered).toBe(1);
            expect(result.totals.gap).toBe(0);
        });

        it('merges linkedTestKeys from raw with an externally supplied map', () => {
            const issues = [makeIssue({ key: 'PROJ-1', linkedTestKeys: ['TEST-1'] })];
            const testLinkMap = new Map([['PROJ-1', ['TEST-9']]]);
            const result = computeCoverageGap(issues, testLinkMap);

            expect(result.items[0]?.linkedTestKeys).toStrictEqual(['TEST-1', 'TEST-9']);
        });

        it('filters out non-coverage issue types (mirrors live issuetype in (Story, Task, Bug, Epic))', () => {
            const issues = [
                makeIssue({ key: 'PROJ-1', type: 'Story', linkedTestKeys: ['TEST-1'] }),
                makeIssue({ key: 'PROJ-2', type: 'Subtask' }),
                makeIssue({ key: 'PROJ-3', type: 'Test' }),
            ];
            const result = computeCoverageGap(issues);

            expect(result.totals.totalIssues).toBe(1);
            expect(result.items[0]?.issueKey).toBe('PROJ-1');
            expect(result.items[0]?.hasTest).toBeTruthy();
        });

        it('keeps linkedTestCount consistent with linkedTestKeys via rawToJiraFormat', () => {
            const issues = [
                makeIssue({ key: 'PROJ-1', linkedTestKeys: ['TEST-1'], type: 'Bug' }),
                makeIssue({ key: 'PROJ-2' }),
            ];
            const result = computeCoverageGap(issues);

            expect(result.totals.totalIssues).toBe(2);
            expect(result.totals.covered).toBe(1);
        });
    });

    describe('Epic rollup', () => {
        it('groups issues by epic', () => {
            const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' })];
            const testLinkMap = new Map([['PROJ-1', ['TEST-1']]]);
            const result = computeCoverageGap(issues, testLinkMap);

            expect(Object.keys(result.byEpic).length).toBeGreaterThan(0);
        });
    });

    describe('Quality gate', () => {
        it('returns gate config with default threshold', () => {
            const issues = [makeIssue({ key: 'PROJ-1' })];
            const result = computeCoverageGap(issues, new Map());

            expect(result.gateConfig).toBeDefined();
            expect(result.gateConfig.minCoveragePct).toBeGreaterThanOrEqual(0);
            expect(result.gateConfig.minCoveragePct).toBeLessThanOrEqual(100);
        });

        it('respects custom minCoveragePct option', () => {
            const issues = [makeIssue({ key: 'PROJ-1' })];
            const result = computeCoverageGap(issues, new Map(), { minCoveragePct: 80 });

            expect(result.gateConfig.minCoveragePct).toBe(80);
        });
    });

    describe('Hierarchy', () => {
        it('builds hierarchy with epic nodes', () => {
            const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' })];
            const testLinkMap = new Map([['PROJ-1', ['TEST-1']]]);
            const result = computeCoverageGap(issues, testLinkMap);

            expect(result.hierarchy.length).toBeGreaterThan(0);
            expect(result.hierarchy[0]?.type).toBe('Epic');
            expect(result.hierarchy[0]?.children.length).toBeGreaterThan(0);
        });

        it('computes hierarchy coverage percentage', () => {
            const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' })];
            const testLinkMap = new Map([['PROJ-1', ['TEST-1']]]);
            const result = computeCoverageGap(issues, testLinkMap);

            const epic = result.hierarchy[0];

            expect(epic?.coveragePct).toBeGreaterThanOrEqual(0);
            expect(epic?.coveragePct).toBeLessThanOrEqual(100);
        });

        it('truncates long summaries to 60 chars in hierarchy keys', () => {
            const longSummary = 'A'.repeat(100);
            const issues = [makeIssue({ key: 'PROJ-1', summary: longSummary })];
            const result = computeCoverageGap(issues, new Map());

            const child = result.hierarchy[0]?.children[0];

            expect(child).toBeDefined();
            expect(child?.key.length).toBeLessThanOrEqual(60);
        });

        it('groups issues without epic under "No Epic" node', () => {
            const issues = [makeIssue({ key: 'PROJ-1' }), makeIssue({ key: 'PROJ-2' })];
            const result = computeCoverageGap(issues, new Map());

            const noEpicNode = result.hierarchy.find((n) => n.summary === 'No Epic');

            expect(noEpicNode).toBeDefined();
            expect(noEpicNode?.type).toBe('Epic');
            expect(noEpicNode?.children.length).toBe(2);
        });
    });

    describe('Error handling', () => {
        it('returns empty result when input causes error', () => {
            const result = computeCoverageGap(null as unknown as RawJiraIssue[], new Map());

            expect(result.items).toStrictEqual([]);
            expect(result.totals.totalIssues).toBe(0);
            expect(result.hierarchy).toStrictEqual([]);
        });
    });

    describe('Trends', () => {
        it('always returns empty trends array', () => {
            const result = computeCoverageGap([], new Map());

            expect(result.trends).toStrictEqual([]);
        });
    });
});
