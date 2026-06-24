/**
 * Integration tests — Incident Investigation Report (FT-31)
 *
 * Validates end-to-end flow:
 * - buildIncidentReport → generateIncidentReportHtml
 * - HTML output structure, error handling, custom title
 *
 * Pure function — no filesystem dependencies.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../../logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('Integration: Incident Investigation Report', () => {
    describe('FT-31a: basic HTML generation with events', () => {
        it('generates valid HTML from real event data', async () => {
            const { buildIncidentReport, generateIncidentReportHtml } = await import('../../incident-report.js');
            const report = buildIncidentReport(45, 3, 'December Peak', ['EPIC-1'], 50);
            const html = generateIncidentReportHtml(report);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Incident Investigation Report');
            expect(html).toContain('data-component="metric-card"');
            expect(html).toContain('data-component="card"');
            expect(html).toContain('Overall Severity');
            expect(html).toContain('HIGH');
            expect(html).toContain('4 incident(s) detected');
        });

        it('includes all event types in sorted order', async () => {
            const { buildIncidentReport, generateIncidentReportHtml } = await import('../../incident-report.js');
            const report = buildIncidentReport(45, 5, 'January Spike', ['EPIC-X', 'EPIC-Y'], 50);
            const html = generateIncidentReportHtml(report);

            expect(html).toContain('High failure rate detected');
            expect(html).toContain('Multiple regressions detected');
            expect(html).toContain('Coverage gap detected');
            expect(html).toContain('Seasonality peak detected');
        });
    });

    describe('FT-31b: empty input — no incidents', () => {
        it('generates HTML with no-incidents message when no events exist', async () => {
            const { buildIncidentReport, generateIncidentReportHtml } = await import('../../incident-report.js');
            const report = buildIncidentReport(10, 0, 'N/A', [], 95);
            const html = generateIncidentReportHtml(report);

            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('No incidents to display');
            expect(html).toContain('Overall Severity: NONE');
        });
    });

    describe('FT-31c: null/undefined input returns error page', () => {
        it('returns error page for null report', async () => {
            const { generateIncidentReportHtml } = await import('../../incident-report.js');
            const html = generateIncidentReportHtml(null);

            expect(html).toContain('Error generating incident investigation report');
        });

        it('returns error page for undefined report', async () => {
            const { generateIncidentReportHtml } = await import('../../incident-report.js');
            const html = generateIncidentReportHtml(undefined);

            expect(html).toContain('Error generating incident investigation report');
        });
    });

    describe('FT-31d: custom title', () => {
        it('uses custom title in HTML and page title', async () => {
            const { buildIncidentReport, generateIncidentReportHtml } = await import('../../incident-report.js');
            const report = buildIncidentReport(10, 0, 'N/A', [], 95);
            const html = generateIncidentReportHtml(report, 'Sprint 42 Incident Report');

            expect(html).toContain('<title>Sprint 42 Incident Report</title>');
            expect(html).toContain('<h1>Sprint 42 Incident Report</h1>');
        });

        it('defaults to Incident Investigation Report when no title given', async () => {
            const { buildIncidentReport, generateIncidentReportHtml } = await import('../../incident-report.js');
            const report = buildIncidentReport(10, 0, 'N/A', [], 95);
            const html = generateIncidentReportHtml(report);

            expect(html).toContain('<title>Incident Investigation Report</title>');
            expect(html).toContain('<h1>Incident Investigation Report</h1>');
        });
    });
});
