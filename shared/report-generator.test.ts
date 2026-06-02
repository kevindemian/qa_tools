jest.mock('fs');

import { existsSync, readFileSync } from 'fs';
import type { PathLike, PathOrFileDescriptor } from 'fs';
import { nonNull, nullAs } from './test-utils';
import { generateHtmlReport, generateCoverageHtml, loadKnownIssues } from './report-generator';
import type { FlatTest } from './result_parser';
import type { CoverageEpic, KnownIssue, TestRunTab } from './report-generator';

describe('generateHtmlReport', () => {
    it('generates a complete HTML document with summary cards', () => {
        const tests: FlatTest[] = [
            { title: 'Login works', state: 'passed', duration: 1200 },
            { title: 'Logout works', state: 'passed', duration: 800 },
            { title: 'Error handling', state: 'failed', duration: 300 },
            { title: 'Pending feature', state: 'skipped', duration: 0 },
        ];

        const html = generateHtmlReport(tests);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Login works');
        expect(html).toContain('Logout works');
        expect(html).toContain('Error handling');
        expect(html).toContain('Pending feature');
        expect(html).toContain('status-passed');
        expect(html).toContain('status-failed');
        expect(html).toContain('status-skipped');
        expect(html).toContain('passed');
        expect(html).toContain('failed');
        expect(html).toContain('skipped');
        expect(html).toContain('Pass Rate');
        expect(html).toContain('Duration');
    });

    it('displays pass rate as 0% when all tests fail', () => {
        const tests: FlatTest[] = [
            { title: 'Fail A', state: 'failed', duration: 100 },
            { title: 'Fail B', state: 'failed', duration: 200 },
        ];

        const html = generateHtmlReport(tests);

        expect(html).toContain('0.0%');
    });

    it('displays 100% pass rate when all tests pass', () => {
        const tests: FlatTest[] = [
            { title: 'Pass A', state: 'passed', duration: 100 },
            { title: 'Pass B', state: 'passed', duration: 200 },
        ];

        const html = generateHtmlReport(tests);

        expect(html).toContain('100.0%');
    });

    it('handles empty test list gracefully', () => {
        const html = generateHtmlReport([]);

        expect(html).toContain('0');
        expect(html).toContain('Total');
    });

    it('includes SVG chart by default', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'failed', duration: 100 },
        ];

        const html = generateHtmlReport(tests);

        expect(html).toContain('<svg');
        expect(html).toContain('Distribution');
    });

    it('omits chart when includeChart is false', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];

        const html = generateHtmlReport(tests, { includeChart: false });

        expect(html).not.toContain('<svg');
    });

    it('uses custom title when provided', () => {
        const html = generateHtmlReport([], { title: 'My Custom Report' });

        expect(html).toContain('My Custom Report');
    });

    it('generates quality gate warning when pass rate below threshold', () => {
        const tests: FlatTest[] = [
            { title: 'Fail A', state: 'failed', duration: 100 },
            { title: 'Fail B', state: 'failed', duration: 100 },
        ];

        const html = generateHtmlReport(tests, { qualityGate: 90 });

        expect(html).toContain('Quality Gate Failed');
        expect(html).toContain('below the configured threshold');
    });

    it('omits quality gate when pass rate meets threshold', () => {
        const tests: FlatTest[] = [
            { title: 'Pass A', state: 'passed', duration: 100 },
            { title: 'Pass B', state: 'passed', duration: 100 },
        ];

        const html = generateHtmlReport(tests, { qualityGate: 90 });

        expect(html).not.toContain('Quality Gate Failed');
    });

    it('includes source and ci URL in footer when provided', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];

        const html = generateHtmlReport(tests, {
            source: 'pipeline-42',
            ciUrl: 'https://ci.example.com/job/42',
            branch: 'main',
        });

        expect(html).toContain('pipeline-42');
        expect(html).toContain('ci.example.com');
        expect(html).toContain('main');
    });

    it('includes branch without link when ciUrl is empty', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];

        const html = generateHtmlReport(tests, { branch: 'develop' });

        expect(html).toContain('develop');
    });

    it('handles generateHtmlReport error gracefully', () => {
        const html = generateHtmlReport(nullAs<FlatTest[]>());

        expect(html).toContain('Error generating report');
    });

    it('escapes HTML in test titles', () => {
        const tests: FlatTest[] = [{ title: '<script>alert("xss")</script>', state: 'passed', duration: 0 }];

        const html = generateHtmlReport(tests);

        expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert("xss")</script>');
    });

    it('skips chart when tests array is empty', () => {
        const html = generateHtmlReport([]);

        expect(html).not.toContain('<svg');
    });

    it('includes LLM analysis section when provided', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, { llmAnalysis: 'All tests passed.' });
        expect(html).toContain('AI Analysis');
        expect(html).toContain('All tests passed.');
    });

    it('shows fallback warning when llmFallback is true', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, { llmAnalysis: 'fallback', llmFallback: true });
        expect(html).toContain('unavailable');
    });

    it('displays confidence badge for each level', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const htmlLow = generateHtmlReport(tests, { llmAnalysis: 'ok', llmConfidence: 'low' });
        expect(htmlLow).toContain('low');
        const htmlMedium = generateHtmlReport(tests, { llmAnalysis: 'ok', llmConfidence: 'medium' });
        expect(htmlMedium).toContain('medium');
        const htmlHigh = generateHtmlReport(tests, { llmAnalysis: 'ok', llmConfidence: 'high' });
        expect(htmlHigh).toContain('high');
    });

    it('shows error message in table for failed tests', () => {
        const tests: FlatTest[] = [
            { title: 'Fail', state: 'failed', duration: 100, error: 'Expected true, got false' },
            { title: 'Pass', state: 'passed', duration: 100 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('Expected true, got false');
    });

    it('includes timestamp in footer', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('Generated by QA Tools ·');
    });

    it('toggle button has id="toggleBtn" not generic selector', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'failed', duration: 200 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('id="toggleBtn"');
        expect(html).toContain("getElementById('toggleBtn')");
        expect(html).not.toContain("querySelector('.control-bar button')");
    });

    it('hides toggle button when all tests fail', () => {
        const tests: FlatTest[] = [
            { title: 'Fail A', state: 'failed', duration: 100 },
            { title: 'Fail B', state: 'failed', duration: 200 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).not.toContain('Toggle Passed');
    });

    it('CSV export uses dynamic headers from thead', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'failed', duration: 100, error: 'err' },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain("Array.from(document.querySelectorAll('thead th'))");
        expect(html).not.toContain('cells.slice(0, 4)');
        expect(html).not.toContain('#,Test,Status,Duration,Error');
    });

    it('CSV export only exports visible rows (respects filter)', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain("r.style.display !== 'none'");
    });

    it('theme option "light" forces light mode (no dark class)', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, { theme: 'light' });
        expect(html).toContain("'light'");
    });

    it('theme option "dark" forces dark mode', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, { theme: 'dark' });
        expect(html).toContain("'dark'");
    });

    it('includes theme toggle button in filter bar', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('toggleTheme()');
        expect(html).toContain('🌓');
    });

    it('shows dash for skipped test duration', () => {
        const tests: FlatTest[] = [{ title: 'Skip', state: 'skipped', duration: 0 }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('—</td>');
    });

    it('includes dark theme CSS via html.dark selector', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('html.dark');
        expect(html).toContain('html.dark body');
    });

    it('includes theme toggle script in head', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('toggleTheme');
        expect(html).toContain('qa-report-theme');
    });

    it('includes zebra striping CSS', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('nth-child(even)');
    });

    it('includes SVG text labels on chart', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'passed', duration: 100 },
            { title: 'C', state: 'failed', duration: 100 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('<text');
    });

    it('shows fullTitle as tooltip when present', () => {
        const tests: FlatTest[] = [{ title: 'Login', state: 'passed', duration: 100, fullTitle: 'Auth Tests > Login' }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('title="Auth Tests &gt; Login"');
    });

    it('shows percentage in summary cards', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'failed', duration: 100 },
            { title: 'C', state: 'skipped', duration: 0 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('(33.3%)');
    });

    it('renders error as expandable when truncated', () => {
        const longMsg = 'x'.repeat(200);
        const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100, error: longMsg }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('error-truncated');
        expect(html).toContain('data-full="' + longMsg + '"');
    });

    it('uses responsive SVG viewBox', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('viewBox="0 0 300 30"');
        expect(html).toContain('width="100%"');
    });

    it('renders history column with mixed statuses', () => {
        const tests: FlatTest[] = [{ title: 'FlakyTest', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, {
            testHistory: {
                FlakyTest: [
                    { status: 'PASSED', testExecKey: 'TEST-1' },
                    { status: 'FAILED', testExecKey: 'TEST-2' },
                    { status: 'SKIPPED', testExecKey: 'TEST-3' },
                    { status: 'ABORTED', testExecKey: 'TEST-4' },
                ],
            },
        });
        expect(html).toContain('hist-cell');
        expect(html).toContain('hist-pass');
        expect(html).toContain('hist-fail');
        expect(html).toContain('hist-skip');
        expect(html).toContain('TEST-1');
        expect(html).toContain('TEST-3');
    });

    // ── R1: Trend Chart ──────────────────────────────────────────────

    it('renders trend chart when trends are provided', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, {
            trends: [
                { label: '2026-05-01', passRate: 80, total: 10, failed: 2 },
                { label: '2026-05-02', passRate: 90, total: 10, failed: 1 },
                { label: '2026-05-03', passRate: 95, total: 10, failed: 0 },
            ],
        });
        expect(html).toContain('Pass Rate Trend');
        expect(html).toContain('<svg');
        expect(html).toContain('6366f1');
    });

    it('omits trend chart when trends have fewer than 2 points', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const htmlSingle = generateHtmlReport(tests, {
            trends: [{ label: '2026-05-01', passRate: 80, total: 10, failed: 2 }],
        });
        expect(htmlSingle).not.toContain('Pass Rate Trend');
    });

    it('omits trend chart when trends is empty', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const htmlEmpty = generateHtmlReport(tests, { trends: [] });
        expect(htmlEmpty).not.toContain('Pass Rate Trend');
    });

    it('renders trend chart with 90% reference line', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, {
            trends: [
                { label: '2026-05-01', passRate: 70, total: 10, failed: 3 },
                { label: '2026-05-02', passRate: 85, total: 10, failed: 1 },
            ],
        });
        expect(html).toContain('90%');
        expect(html).toContain('stroke-dasharray');
    });

    // ── R2: Hierarchy Sidebar ────────────────────────────────────────

    it('renders hierarchy sidebar when tests have fullTitle with suites', () => {
        const tests: FlatTest[] = [
            { title: 'Login', state: 'passed', duration: 100, fullTitle: 'Auth > Login' },
            { title: 'Logout', state: 'passed', duration: 100, fullTitle: 'Auth > Logout' },
            { title: 'Search', state: 'failed', duration: 200, fullTitle: 'Core > Search' },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('class="sidebar"');
        expect(html).toContain('Auth');
        expect(html).toContain('Core');
        expect(html).toContain('tree-node');
    });

    it('omits sidebar when tests have no fullTitle', () => {
        const tests: FlatTest[] = [
            { title: 'Login', state: 'passed', duration: 100 },
            { title: 'Logout', state: 'passed', duration: 100 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).not.toContain('class="sidebar"');
    });

    it('adds data-hierarchy attribute to table rows', () => {
        const tests: FlatTest[] = [{ title: 'Login', state: 'passed', duration: 100, fullTitle: 'Auth > Login' }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('data-hierarchy="Auth › Login"');
    });

    it('includes hierarchy filtering JavaScript functions', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100, fullTitle: 'Suite > A' }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('filterByHierarchy');
        expect(html).toContain('clearHierarchy');
        expect(html).toContain('toggleTreeNode');
    });

    // ── R3: Timeline ─────────────────────────────────────────────────

    it('renders timeline section', () => {
        const tests: FlatTest[] = [
            { title: 'Fast', state: 'passed', duration: 100 },
            { title: 'Slow', state: 'failed', duration: 500 },
            { title: 'Skip', state: 'skipped', duration: 0 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('Timeline');
        expect(html).toContain('timeline-row');
        expect(html).toContain('scrollToTest');
    });

    it('renders timeline with correct status colors', () => {
        const tests: FlatTest[] = [
            { title: 'Pass', state: 'passed', duration: 100 },
            { title: 'Fail', state: 'failed', duration: 200 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('#22c55e');
        expect(html).toContain('#ef4444');
    });

    it('omits timeline when test list is empty', () => {
        const html = generateHtmlReport([]);
        expect(html).not.toContain('id="timelineBody"');
        expect(html).not.toContain('id="timelineToggle"');
    });

    it('includes timeline toggle function', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('toggleTimeline');
        expect(html).toContain('timelineBody');
    });

    // ── R5: Steps expansíveis ───────────────────────────────────────

    it('renders detail toggle for test with steps', () => {
        const tests: FlatTest[] = [
            {
                title: 'Login',
                state: 'passed',
                duration: 100,
                steps: [{ action: 'Open page', expected: 'Page loads' }],
            },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('detail-toggle');
        expect(html).toContain('detail-row');
        expect(html).toContain('Open page');
        expect(html).toContain('Page loads');
    });

    it('omits detail row when test has no steps/screenshots/logs', () => {
        const tests: FlatTest[] = [{ title: 'Plain', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests);
        expect(html).not.toContain('data-detail-for');
        expect(html).not.toContain('id="detail-row-');
    });

    it('renders multiple steps with numbered badges', () => {
        const tests: FlatTest[] = [
            {
                title: 'Multi',
                state: 'passed',
                duration: 100,
                steps: [
                    { action: 'Step 1', expected: 'Result 1' },
                    { action: 'Step 2' },
                    { action: 'Step 3', expected: 'Result 3' },
                ],
            },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('detail-step-num');
        expect(html).toContain('Step 1');
        expect(html).toContain('Step 2');
        expect(html).toContain('Result 3');
    });

    it('includes toggleDetail JavaScript function', () => {
        const tests: FlatTest[] = [{ title: 'T', state: 'passed', duration: 100, steps: [{ action: 'A' }] }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('toggleDetail');
    });

    // ── R6: Attachments ─────────────────────────────────────────────

    it('renders screenshot images in detail row', () => {
        const tests: FlatTest[] = [
            {
                title: 'Visual',
                state: 'passed',
                duration: 100,
                screenshots: [{ title: 'Screenshot 1', dataUri: 'data:image/png;base64,iVBORw0KGgo=' }],
            },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('detail-screenshots');
        expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
        expect(html).toContain('Screenshot 1');
    });

    it('renders collapsible logs in detail row', () => {
        const tests: FlatTest[] = [
            {
                title: 'Logger',
                state: 'failed',
                duration: 100,
                logs: ['Error: something broke', '  at Object.<anonymous> (test.ts:1:1)'],
            },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('detail-logs');
        expect(html).toContain('Error: something broke');
        expect(html).toContain('2 lines');
    });

    it('shows both steps and screenshots when both present', () => {
        const tests: FlatTest[] = [
            {
                title: 'Combined',
                state: 'passed',
                duration: 100,
                steps: [{ action: 'Verify', expected: 'OK' }],
                screenshots: [{ title: 'Result', dataUri: 'data:image/png;base64,abc=' }],
                logs: ['done'],
            },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('Steps');
        expect(html).toContain('Screenshots');
        expect(html).toContain('Logs');
    });

    // ── R7: Coverage HTML Report ────────────────────────────────────

    it('generates coverage HTML with epics and issues', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-1',
                summary: 'Authentication',
                issues: [
                    { key: 'AUTH-1', summary: 'Login page', status: 'Done', type: 'Story' },
                    { key: 'AUTH-2', summary: 'Logout', status: 'In Progress', type: 'Story' },
                ],
            },
            {
                key: 'EPIC-2',
                summary: 'Dashboard',
                issues: [{ key: 'DASH-1', summary: 'Widget', status: 'Open', type: 'Bug' }],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('Coverage Report');
        expect(html).toContain('EPIC-1');
        expect(html).toContain('AUTH-1');
        expect(html).toContain('AUTH-2');
        expect(html).toContain('EPIC-2');
        expect(html).toContain('DASH-1');
        expect(html).toContain('Authentication');
        expect(html).toContain('Dashboard');
    });

    it('coverage report shows correct issue counts', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-1',
                summary: 'Test',
                issues: [{ key: 'T-1', summary: 'Thing', status: 'Done', type: 'Task' }],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('>1</div></div>');
        expect(html).toContain('1 issues, 100.0% closed');
    });

    it('coverage report uses custom title', () => {
        const html = generateCoverageHtml([], 'My Coverage');
        expect(html).toContain('My Coverage');
    });

    it('coverage report renders status badges', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-1',
                summary: 'Test',
                issues: [
                    { key: 'T-1', summary: 'Done', status: 'Done', type: 'Story' },
                    { key: 'T-2', summary: 'Progress', status: 'In Progress', type: 'Story' },
                    { key: 'T-3', summary: 'Open', status: 'Open', type: 'Bug' },
                ],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('status-passed');
        expect(html).toContain('status-skipped');
        expect(html).toContain('status-failed');
    });

    // ── R9: Mini Trend Chart ────────────────────────────────────────

    it('renders mini trend chart when trends have 2+ points', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, {
            trends: [
                { label: '2026-05-01', passRate: 80, total: 10, failed: 2 },
                { label: '2026-05-02', passRate: 90, total: 10, failed: 1 },
            ],
        });
        expect(html).toContain('mini-trend');
        expect(html).toContain('viewBox="0 0 300 100"');
    });

    it('omits mini trend chart when trends have <2 points', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const htmlSingle = generateHtmlReport(tests, {
            trends: [{ label: '2026-05-01', passRate: 80, total: 10, failed: 2 }],
        });
        expect(htmlSingle).not.toContain('viewBox="0 0 300 100"');
    });

    // ── R10: Known Issues ───────────────────────────────────────────

    it('adds known issue badge to matching failed tests', () => {
        const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 100, error: 'err' }];
        const knownIssues: KnownIssue[] = [{ pattern: 'login', reason: 'Known SSL issue', ticket: 'BUG-123' }];
        const html = generateHtmlReport(tests, { knownIssues });
        expect(html).toContain('ki-badge');
        expect(html).toContain('Known Issue');
        expect(html).toContain('BUG-123');
    });

    it('adds suppressed class to known issue rows', () => {
        const tests: FlatTest[] = [{ title: 'Timeout', state: 'failed', duration: 100, error: 'timeout' }];
        const knownIssues: KnownIssue[] = [{ pattern: 'timeout', reason: 'Infra flaky' }];
        const html = generateHtmlReport(tests, { knownIssues });
        expect(html).toContain('ki-suppressed');
    });

    it('does not apply known issue badge to non-matching failures', () => {
        const tests: FlatTest[] = [{ title: 'Real bug', state: 'failed', duration: 100, error: 'assert' }];
        const knownIssues: KnownIssue[] = [{ pattern: 'timeout', reason: 'Infra' }];
        const html = generateHtmlReport(tests, { knownIssues });
        expect(html).not.toContain('>Known Issue<');
    });

    // ── R11: Multi-environment Tabs ─────────────────────────────────

    it('renders tabs when multiple runs provided', () => {
        const runs: TestRunTab[] = [
            { name: 'Chrome', tests: [{ title: 'Login', state: 'passed', duration: 100 }] },
            { name: 'Firefox', tests: [{ title: 'Login', state: 'failed', duration: 200 }] },
        ];
        const html = generateHtmlReport(nonNull(runs[0]).tests, { runs });
        expect(html).toContain('envTabs');
        expect(html).toContain('Chrome');
        expect(html).toContain('Firefox');
        expect(html).toContain('switchTab');
    });

    it('renders tab content with separate tables per run', () => {
        const runs: TestRunTab[] = [
            { name: 'Env A', tests: [{ title: 'Test A', state: 'passed', duration: 100 }] },
            { name: 'Env B', tests: [{ title: 'Test B', state: 'failed', duration: 200 }] },
        ];
        const html = generateHtmlReport(nonNull(runs[0]).tests, { runs });
        expect(html).toContain('tab-content');
        expect(html).toContain('tabContent-0');
        expect(html).toContain('tabContent-1');
    });

    it('shows only first tab as active by default', () => {
        const runs: TestRunTab[] = [
            { name: 'A', tests: [{ title: 'T1', state: 'passed', duration: 100 }] },
            { name: 'B', tests: [{ title: 'T2', state: 'failed', duration: 100 }] },
        ];
        const html = generateHtmlReport(nonNull(runs[0]).tests, { runs });
        expect(html).toContain('class="tab-btn active"');
        expect(html).toContain('class="tab-content active"');
    });

    it('omits tabs when only 1 run', () => {
        const runs: TestRunTab[] = [{ name: 'Single', tests: [{ title: 'T', state: 'passed', duration: 100 }] }];
        const html = generateHtmlReport(nonNull(runs[0]).tests, { runs });
        expect(html).not.toContain('envTabs');
    });

    // ── R12: PDF Export ─────────────────────────────────────────────

    it('includes PDF export button', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('window.print()');
        expect(html).toContain('PDF');
    });

    it('includes print CSS media query', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('@media print');
        expect(html).toContain('.control-bar, .detail-toggle');
    });

    // ── R10: loadKnownIssues ───────────────────────────────────────────

    it('loadKnownIssues returns empty array for missing file', () => {
        const issues = loadKnownIssues('/nonexistent/path.json');
        expect(issues).toEqual([]);
    });

    it('loadKnownIssues reads issues from a valid JSON file', () => {
        const knownIssues = [
            { pattern: 'timeout', reason: 'Infra flaky', ticket: 'BUG-1' },
            { pattern: 'login', reason: 'Known SSL issue' },
        ];
        const mockExists = jest.mocked(existsSync);
        const mockReadFile = jest.mocked(readFileSync);
        mockExists.mockReset();
        mockReadFile.mockReset();
        mockExists.mockImplementation((p: PathLike) => p === '/tmp/known-issues.json');
        mockReadFile.mockImplementation((p: PathOrFileDescriptor, _options?: unknown): string => {
            if (p === '/tmp/known-issues.json') return JSON.stringify({ issues: knownIssues });
            throw new Error('not found');
        });

        const issues = loadKnownIssues('/tmp/known-issues.json');
        expect(issues).toHaveLength(2);
        expect(nonNull(issues[0]).pattern).toBe('timeout');
        expect(nonNull(issues[0]).ticket).toBe('BUG-1');
        expect(nonNull(issues[1]).pattern).toBe('login');
    });

    it('loadKnownIssues handles issues as top-level array', () => {
        const mockExists = jest.mocked(existsSync);
        const mockReadFile = jest.mocked(readFileSync);
        mockExists.mockReset();
        mockReadFile.mockReset();
        mockExists.mockImplementation((p: PathLike) => p === '/tmp/ki.json');
        mockReadFile.mockImplementation((p: PathOrFileDescriptor, _options?: unknown): string => {
            if (p === '/tmp/ki.json') return JSON.stringify([{ pattern: 'flaky', reason: 'Intermittent' }]);
            throw new Error('not found');
        });

        const issues = loadKnownIssues('/tmp/ki.json');
        expect(issues).toHaveLength(1);
        expect(nonNull(issues[0]).pattern).toBe('flaky');
    });

    it('loadKnownIssues skips invalid JSON and returns empty array', () => {
        const mockExists = jest.mocked(existsSync);
        const mockReadFile = jest.mocked(readFileSync);
        mockExists.mockReset();
        mockReadFile.mockReset();
        mockExists.mockImplementation((_p: PathLike) => true);
        mockReadFile.mockImplementation(() => {
            throw new Error('bad json');
        });

        const issues = loadKnownIssues('/tmp/bad.json');
        expect(issues).toEqual([]);
    });
});
