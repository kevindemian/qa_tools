import { describe, it, expect, afterEach } from 'vitest';
import Config from '../config-accessor.js';
import { generateHtmlReport, generateCoverageHtml } from '../report/report-html.js';

describe('Report HTML qa-project meta tag', () => {
    afterEach(() => {
        Config.reset();
    });

    it('includes qa-project meta when a project is selected', () => {
        Config.set('qaCurrentProject', 'ibabs');
        const html = generateHtmlReport([], { title: 'T' });

        expect(html).toContain('<meta name="qa-project" content="ibabs">');
    });

    it('includes qa-project meta in coverage reports when a project is selected', () => {
        Config.set('qaCurrentProject', 'qa_tools');
        const html = generateCoverageHtml([], 'Coverage');

        expect(html).toContain('<meta name="qa-project" content="qa_tools">');
    });

    it('omits qa-project meta when no project is selected', () => {
        const html = generateHtmlReport([], { title: 'T' });

        expect(html).not.toContain('name="qa-project"');
    });

    it('escapes the project name in the meta content', () => {
        Config.set('qaCurrentProject', 'a"<b>');
        const html = generateHtmlReport([], { title: 'T' });

        expect(html).toContain('<meta name="qa-project"');
        expect(html).not.toContain('content="a"<b>"');
        expect(html).toContain('content="a&quot;&lt;b&gt;"');
    });
});
