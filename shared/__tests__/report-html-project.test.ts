import { describe, it, expect, afterEach } from 'vitest';
import Config from '../config-accessor.js';
import { generateHtmlReport, generateCoverageHtml } from '../report/report-html.js';
import type { ComputedMetrics } from '../types/data-hub.js';

function emptyComputed(): ComputedMetrics {
    return {
        passRate: 0,
        avgDuration: 0,
        suiteSpeedP95: 0,
        flakyRate: [],
        coverage: 0,
        pipelineCost: { totalRuns: 0, totalCostUsd: 0, billableMinutes: 0 },
        defectTrends: [],
        branchBreakdown: {},
        topFailingJobs: [],
        topFailureReasons: [],
        releaseScore: { overall: 0, grade: 'unknown' as const, metrics: {} },
        quarantineStatus: { blocked: 0, quarantined: 0, passed: 0 },
        testPassRate: 0,
        testCounts: { passed: 0, failed: 0, skipped: 0, total: 0 },
        framework: '',
        metricsRuns: [
            {
                timestamp: '2026-05-31T00:00:00Z',
                project: 'qa-tools',
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0,
                tests: [],
            },
        ],
    } as unknown as ComputedMetrics;
}

describe('Report HTML qa-project meta tag', () => {
    afterEach(() => {
        Config.reset();
    });

    it('includes qa-project meta when a project is selected', () => {
        Config.set('qaCurrentProject', 'ibabs');
        const html = generateHtmlReport([], { title: 'T', computed: emptyComputed() });

        expect(html).toContain('<meta name="qa-project" content="ibabs">');
    });

    it('includes qa-project meta in coverage reports when a project is selected', () => {
        Config.set('qaCurrentProject', 'qa_tools');
        const html = generateCoverageHtml([], 'Coverage');

        expect(html).toContain('<meta name="qa-project" content="qa_tools">');
    });

    it('omits qa-project meta when no project is selected', () => {
        const html = generateHtmlReport([], { title: 'T', computed: emptyComputed() });

        expect(html).not.toContain('name="qa-project"');
    });

    it('escapes the project name in the meta content', () => {
        Config.set('qaCurrentProject', 'a"<b>');
        const html = generateHtmlReport([], { title: 'T', computed: emptyComputed() });

        expect(html).toContain('<meta name="qa-project"');
        expect(html).not.toContain('content="a"<b>"');
        expect(html).toContain('content="a&quot;&lt;b&gt;"');
    });
});
