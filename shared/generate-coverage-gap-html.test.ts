import { nullAs } from './test-utils';
import { generateCoverageGapHtml } from './generate-coverage-gap-html';
import type { CoverageGapResult } from './types';

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

describe('generateCoverageGapHtml', () => {
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
        expect(html).toContain('gate-fail');
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
        expect(html).toContain('gate-pass');
        expect(html).toContain('All epics pass');
    });

    it('renders epic cards with progress bars', () => {
        const html = generateCoverageGapHtml(makeFixture());
        expect(html).toContain('Authentication Module');
        expect(html).toContain('progress-bar');
        expect(html).toContain('progress-fill');
        expect(html).toContain('1/2 covered'); // fixture: 1 covered out of 2
    });

    it('renders hierarchy tree', () => {
        const html = generateCoverageGapHtml(makeFixture());
        expect(html).toContain('Hierarchy');
        expect(html).toContain('tree-node');
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

    it('uses custom title when provided', () => {
        const html = generateCoverageGapHtml(makeFixture(), 'My Report');
        expect(html).toContain('My Report');
        expect(html).not.toContain('Coverage Gap Analysis');
    });

    it('returns error HTML on invalid input', () => {
        const result = generateCoverageGapHtml(nullAs());
        expect(result).toContain('Error generating coverage gap report');
    });

    it('includes theme toggle script', () => {
        const html = generateCoverageGapHtml(makeFixture());
        expect(html).toContain('toggleTheme');
        expect(html).toContain('dark');
    });

    it('includes filter script for gaps table', () => {
        const html = generateCoverageGapHtml(makeFixture());
        expect(html).toContain('function filterGaps()');
        expect(html).toContain('searchInput');
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
});
