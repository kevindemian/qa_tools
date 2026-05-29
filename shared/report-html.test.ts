import { generateHtmlReport, generateCoverageHtml } from './report-html';
import type { FlatTest } from './result_parser';
import type { CoverageEpic } from './report-types';

describe('report-html generateHtmlReport', () => {
    it('generates a complete HTML document', () => {
        const tests: FlatTest[] = [
            { title: 'Test A', state: 'passed', duration: 100 },
            { title: 'Test B', state: 'failed', duration: 200 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Test A');
        expect(html).toContain('Test B');
    });

    it('handles empty test list gracefully', () => {
        const html = generateHtmlReport([]);
        expect(html).toContain('0');
        expect(html).toContain('Total');
    });

    it('uses custom title when provided', () => {
        const html = generateHtmlReport([], { title: 'Custom Title' });
        expect(html).toContain('Custom Title');
    });

    it('includes pass rate when tests pass', () => {
        const tests: FlatTest[] = [
            { title: 'A', state: 'passed', duration: 100 },
            { title: 'B', state: 'passed', duration: 100 },
        ];
        const html = generateHtmlReport(tests);
        expect(html).toContain('100.0%');
    });

    it('renders LLM analysis section', () => {
        const tests: FlatTest[] = [{ title: 'A', state: 'passed', duration: 100 }];
        const html = generateHtmlReport(tests, { llmAnalysis: 'All good.' });
        expect(html).toContain('AI Analysis');
        expect(html).toContain('All good.');
    });

    it('handles null tests with error page', () => {
        const html = generateHtmlReport(null as unknown as FlatTest[]);
        expect(html).toContain('Error generating report');
    });

    it('escapes HTML in test titles', () => {
        const tests: FlatTest[] = [{ title: '<script>alert("xss")</script>', state: 'passed', duration: 0 }];
        const html = generateHtmlReport(tests);
        expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        expect(html).not.toContain('<script>alert("xss")</script>');
    });
});

describe('report-html generateCoverageHtml', () => {
    it('generates coverage HTML with epics', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-1',
                summary: 'Auth',
                issues: [{ key: 'T-1', summary: 'Login', status: 'Done', type: 'Story' }],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('Coverage Report');
        expect(html).toContain('EPIC-1');
        expect(html).toContain('T-1');
        expect(html).toContain('Auth');
    });

    it('uses custom title', () => {
        const html = generateCoverageHtml([], 'Custom Coverage');
        expect(html).toContain('Custom Coverage');
    });

    it('renders coverage percentage', () => {
        const epics: CoverageEpic[] = [
            {
                key: 'EPIC-1',
                summary: 'Test',
                issues: [{ key: 'T-1', summary: 'Done', status: 'Done', type: 'Task' }],
            },
        ];
        const html = generateCoverageHtml(epics);
        expect(html).toContain('100.0%');
    });
});
