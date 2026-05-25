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

    it('escapes HTML in test titles', () => {
        const tests: FlatTest[] = [{ title: '<script>alert("xss")</script>', state: 'passed', duration: 0 }];

        const html = generateHtmlReport(tests);

        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<script>');
    });

    it('skips chart when tests array is empty', () => {
        const html = generateHtmlReport([]);

        expect(html).not.toContain('<svg');
    });
});
