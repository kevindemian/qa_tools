import { generateHtmlReport } from './report-generator';
import type { FlatTest } from './result_parser';

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
        const html = generateHtmlReport(null as unknown as FlatTest[]);

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

    it('hides toggle button when all tests fail', () => {
        const tests: FlatTest[] = [
            { title: 'Fail A', state: 'failed', duration: 100 },
            { title: 'Fail B', state: 'failed', duration: 200 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).not.toContain('Toggle Passed');
    });

    it('shows dash for skipped test duration', () => {
        const tests: FlatTest[] = [{ title: 'Skip', state: 'skipped', duration: 0 }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('—</td>');
    });

    it('includes dark mode media query', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('prefers-color-scheme: dark');
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
});
