/** Tests for report-html — HTML report generation. */
import { generateHtmlReport, generateCoverageHtml, generateReportWithFallback } from './report-html';
import type { FlatTest } from './result_parser';
import type { CoverageEpic, TestRunTab } from './report-types';

jest.mock('./logger', () => ({
    rootLogger: { error: jest.fn(), info: jest.fn(), child: jest.fn().mockReturnThis() },
}));

jest.mock('./config', () => ({
    default: { get: jest.fn(() => '') },
    get: jest.fn((key: string) => {
        if (key === 'CI_COMMIT_BRANCH') return 'main';
        if (key === 'CI_JOB_URL') return 'https://ci.example.com/job/42';
        return '';
    }),
}));

const MOCK_TESTS: FlatTest[] = [
    { title: 'Login Test', state: 'passed', duration: 1.2, fullTitle: 'Auth > Login Test' },
    { title: 'Logout Test', state: 'failed', duration: 0.5, fullTitle: 'Auth > Logout Test' },
];

const MOCK_EPICS: CoverageEpic[] = [
    {
        key: 'EPIC-1',
        summary: 'First Epic',
        issues: [
            { key: 'ISSUE-1', summary: 'Task 1', status: 'Done', type: 'Task' },
            { key: 'ISSUE-2', summary: 'Task 2', status: 'In Progress', type: 'Task' },
        ],
    },
    {
        key: 'EPIC-2',
        summary: 'Second Epic',
        issues: [{ key: 'ISSUE-3', summary: 'Bug 1', status: 'Open', type: 'Bug' }],
    },
];

const HEALTH_SCORE: import('./types').HealthScoreResult = {
    overall: 85,
    grade: 'good' as const,
    qualityGate: 'pass',
    runCount: 10,
    timestamp: '2026-05-31T00:00:00Z',
    dimensions: {
        passRate: { score: 90, status: 'pass' },
        flakyRate: { score: 85, status: 'pass' },
        coverage: { score: 80, status: 'pass' },
        suiteSpeed: { score: 75, status: 'fail' },
    },
};

describe('generateHtmlReport', () => {
    it('returns valid HTML for basic test list', () => {
        const html = generateHtmlReport(MOCK_TESTS);
        expect(html).toContain('Login Test');
        expect(html).toContain('Logout Test');
    });

    it('includes quality gate when provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Report', qualityGate: 80 });
        expect(html).toContain('Quality Gate');
    });

    it('handles empty test list', () => {
        const html = generateHtmlReport([], { title: 'Empty' });
        expect(html).toContain('Empty');
    });

    it('includes health score section when provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Health', healthScore: HEALTH_SCORE });
        expect(html).toContain('Test Suite Health');
        expect(html).toContain('Quality Gate: Pass');
    });

    it('includes flakiness dashboard link when url and map provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            title: 'Flaky',
            flakinessDashboardUrl: 'https://dash.example.com',
            flakinessMap: { 'Test 1': 3 },
        });
        expect(html).toContain('Flakiness Dashboard');
    });

    it('includes CI branch link when ciUrl and branch provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            title: 'CI',
            branch: 'feature/test',
            ciUrl: 'https://ci.example.com/123',
        });
        expect(html).toContain('feature/test');
        expect(html).toContain('href');
    });

    it('includes branch text without link when no ciUrl', () => {
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Branch', branch: 'feature/x' });
        expect(html).toContain('feature/x');
    });

    it('renders multi-run tabs when runs provided', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: MOCK_TESTS },
            { name: 'Firefox', tests: [MOCK_TESTS[0]!] },
        ];
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Multi', runs });
        expect(html).toContain('Chrome');
        expect(html).toContain('Firefox');
        expect(html).toContain('switchTab');
    });

    it('includes sidebar hierarchy when tests have fullTitle with >', () => {
        const testsWithHierarchy: FlatTest[] = [
            { title: 'T1', state: 'passed', duration: 10, fullTitle: 'Suite > T1' },
            { title: 'T2', state: 'failed', duration: 20, fullTitle: 'Other > T2' },
        ];
        const html = generateHtmlReport(testsWithHierarchy, { title: 'Hierarchy' });
        expect(html).toContain('Suite');
        expect(html).toContain('Other');
    });

    it('includes trend section when trends provided', () => {
        const html = generateHtmlReport(MOCK_TESTS, {
            title: 'Trends',
            trends: [
                { label: 'Mon', passRate: 90, total: 10, failed: 1 },
                { label: 'Tue', passRate: 85, total: 10, failed: 2 },
            ],
        });
        expect(html).toContain('Pass Rate Trend');
    });

    it('includes diff comparison when provided', () => {
        const diffComparison = {
            newFailures: [{ title: 'F1', state: 'failed' as const, duration: 100 }],
            newPasses: [{ title: 'P1', state: 'passed' as const, duration: 50 }],
            flaky: [] as FlatTest[],
        };
        const html = generateHtmlReport(MOCK_TESTS, { title: 'Diff', diffComparison });
        expect(html).toContain('Diff');
    });
});

describe('generateReportWithFallback', () => {
    it('returns error page when generation fails', () => {
        const badTests = null as unknown as FlatTest[];
        const html = generateReportWithFallback(badTests, { title: 'Fail' });
        expect(html).toContain('Error generating report');
    });
});

describe('generateCoverageHtml', () => {
    it('returns valid HTML for epics', () => {
        const html = generateCoverageHtml(MOCK_EPICS, 'Coverage Report');
        expect(html).toContain('Coverage Report');
        expect(html).toContain('EPIC-1');
        expect(html).toContain('ISSUE-2');
        expect(html).toContain('ISSUE-3');
    });

    it('shows correct close percentage', () => {
        const html = generateCoverageHtml(MOCK_EPICS);
        expect(html).toContain('33.3');
    });

    it('shows 0.0 when no epics', () => {
        const html = generateCoverageHtml([], 'Empty Report');
        expect(html).toContain('0.0');
    });

    it('handles epic with Done and Closed statuses correctly', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-3',
                summary: 'Status Test',
                issues: [
                    { key: 'T-1', summary: 'Done task', status: 'Done', type: 'Task' },
                    { key: 'T-2', summary: 'Closed task', status: 'Closed', type: 'Task' },
                    { key: 'T-3', summary: 'Open task', status: 'Open', type: 'Task' },
                ],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('66.7');
    });

    it('handles In Progress coverage status', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-4',
                summary: 'Progress',
                issues: [{ key: 'T-1', summary: 'WIP', status: 'In Progress', type: 'Task' }],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('In Progress');
        expect(html).toContain('status-skipped');
    });

    it('returns error page on failure', () => {
        const badEpics = null as unknown as CoverageEpic[];
        const html = generateCoverageHtml(badEpics);
        expect(html).toContain('Error generating coverage report');
    });
});
