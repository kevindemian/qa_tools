/**
 * Tests for generate-coverage-gap-html — coverage gap report using primitives.
 */

import { describe, expect, it } from 'vitest';
import { generateCoverageGapHtml } from '../report/generate-coverage-gap-html.js';
import type { CoverageGapResult } from '../types.js';

function makeFixture(): CoverageGapResult {
    return {
        items: [
            {
                issueKey: 'PROJ-1',
                summary: 'Implement login page',
                type: 'Story',
                status: 'In Progress',
                epicKey: 'EPIC-1',
                epicSummary: 'Authentication Module',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'High',
                coverageWeight: 3,
            },
            {
                issueKey: 'PROJ-2',
                summary: 'Login API endpoint',
                type: 'Story',
                status: 'Done',
                epicKey: 'EPIC-1',
                epicSummary: 'Authentication Module',
                hasTest: true,
                linkedTestKeys: ['TEST-1', 'TEST-2'],
                priority: 'High',
                coverageWeight: 3,
                lastRunPassed: true,
                lastRunDate: '2026-05-01',
            },
        ],
        totals: {
            totalIssues: 2,
            covered: 1,
            gap: 1,
            weightedCoveragePct: 33,
            rawCoveragePct: 50,
        },
        byEpic: {
            'EPIC-1': {
                epicSummary: 'Authentication Module',
                total: 2,
                covered: 1,
                weightedPct: 33,
                rawPct: 50,
                gatePass: false,
                issues: [],
            },
        },
        gateConfig: {
            minCoveragePct: 50,
            failingEpics: ['EPIC-1'],
        },
        hierarchy: [
            {
                key: 'EPIC-1',
                summary: 'Authentication Module',
                type: 'Epic',
                totalIssues: 2,
                coveredIssues: 1,
                coveragePct: 50,
                children: [],
            },
        ],
        trends: [],
    };
}

describe('GenerateCoverageGapHtml', () => {
    it('produces valid HTML with summary cards', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Coverage Gap Analysis');
        expect(html).toContain('PROJ-1');
        expect(html).toContain('Total Issues');
    });

    it('includes total, covered, and gap counts in summary', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('>2<');
        expect(html).toContain('>1<');
        expect(html).toContain('33%');
        expect(html).toContain('50%');
    });

    it('shows quality gate section with failing epics', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('Quality Gate');
        expect(html).toContain('epic(s) below');
    });

    it('shows quality gate pass when all epics pass threshold', () => {
        const fixture = makeFixture();
        fixture.gateConfig.failingEpics = [];
        (fixture.byEpic['EPIC-1'] as { gatePass: boolean; weightedPct: number }).gatePass = true;
        (fixture.byEpic['EPIC-1'] as { gatePass: boolean; weightedPct: number }).weightedPct = 80;
        fixture.totals.weightedCoveragePct = 80;
        fixture.totals.rawCoveragePct = 80;
        fixture.gateConfig.minCoveragePct = 50;
        const html = generateCoverageGapHtml(fixture);

        expect(html).toContain('All epics pass');
    });

    it('renders epic cards with progress bars', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('Authentication Module');
        expect(html).toContain('data-component="progress-bar"');
        expect(html).toContain('1/2 covered');
    });

    it('renders hierarchy tree', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('Hierarchy');
        expect(html).toContain('tree-node');
    });

    it('uses chevron-right svg toggle instead of unicode arrows', () => {
        const fixture = makeFixture();
        fixture.hierarchy = [
            {
                key: 'EPIC-1',
                summary: 'Authentication Module',
                type: 'Epic',
                totalIssues: 2,
                coveredIssues: 1,
                coveragePct: 50,
                children: [
                    {
                        key: 'STORY-1',
                        summary: 'Login',
                        type: 'Story',
                        totalIssues: 1,
                        coveredIssues: 0,
                        coveragePct: 0,
                        children: [],
                    },
                ],
            },
        ];
        const html = generateCoverageGapHtml(fixture);

        expect(html).toContain('data-icon="chevron-right"');
        expect(html).toContain('tree-toggle-open');
        expect(html).not.toContain('▶');
        expect(html).not.toContain('▼');
    });

    it('renders gaps table for uncovered items', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('GAP');
        expect(html).toContain('PROJ-1');
    });

    it('shows no-gaps message when all items have tests', () => {
        const fixture = makeFixture();
        fixture.items.forEach((i) => (i.hasTest = true));
        fixture.totals.gap = 0;
        fixture.totals.covered = 2;
        fixture.totals.rawCoveragePct = 100;
        fixture.totals.weightedCoveragePct = 100;
        const html = generateCoverageGapHtml(fixture);

        expect(html).toContain('No coverage gaps found');
        expect(html).not.toContain('GAP</span>');
    });

    it('produces valid HTML for an empty result (no items, no epics, no hierarchy)', () => {
        const empty: CoverageGapResult = {
            items: [],
            totals: { totalIssues: 0, covered: 0, gap: 0, weightedCoveragePct: 0, rawCoveragePct: 0 },
            byEpic: {},
            gateConfig: { minCoveragePct: 50, failingEpics: [] },
            hierarchy: [],
            trends: [],
        };
        const html = generateCoverageGapHtml(empty, 'Empty Coverage');

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Empty Coverage');
        expect(html).toContain('No coverage gaps found');
        expect(html).toContain('All epics pass');
        expect(html).not.toContain('Error generating coverage gap report');
    });

    it('uses custom title when provided', () => {
        const html = generateCoverageGapHtml(makeFixture(), 'My Report');

        expect(html).toContain('My Report');
        expect(html).not.toContain('Coverage Gap Analysis');
    });

    it('includes theme toggle script', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('_toggleTheme');
        expect(html).toContain('dark');
    });

    it('includes filter script for gaps table', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('function filterGaps()');
        expect(html).toContain('gapSearchInput');
    });

    it('wires theme toggle button to the global _toggleTheme function', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('data-icon="moon"');
        expect(html).toContain('onclick="_toggleTheme()"');
        expect(html).not.toContain('onclick="toggleTheme()"');
    });

    it('includes collapsible tree toggle', () => {
        const html = generateCoverageGapHtml(makeFixture());

        expect(html).toContain('function toggleTree');
    });

    it('escapes HTML in issue summaries', () => {
        const fixture = makeFixture();
        (fixture.items[0] as { summary: string }).summary = '<script>alert("xss")</script>';
        const html = generateCoverageGapHtml(fixture);

        expect(html).toContain('&lt;script&gt;alert');
        expect(html).not.toContain('<script>alert');
    });

    it('uses the provided generatedAt seed verbatim in the timestamp', () => {
        const seed = '2026-08-04T00:00:00.000Z';
        const html = generateCoverageGapHtml(makeFixture(), undefined, undefined, undefined, seed);

        expect(html).toContain(`data-part="timestamp">${seed}`);
        expect(html).toContain('2026-08-04');
    });

    it('emits the same output for the same generatedAt seed (deterministic)', () => {
        const seed = '2026-08-04T00:00:00.000Z';
        const a = generateCoverageGapHtml(makeFixture(), undefined, undefined, undefined, seed);
        const b = generateCoverageGapHtml(makeFixture(), undefined, undefined, undefined, seed);

        expect(a).toBe(b);
    });
});
