/**
 * Tests for incident-report — Incident Investigation Report.
 */

import { buildIncidentReport, generateIncidentReportHtml } from './incident-report.js';

vi.mock('./logger', async () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), child: vi.fn().mockReturnThis() },
}));

describe('buildIncidentReport', () => {
    it('returns default result for null inputs', async () => {
        const result = buildIncidentReport(null, 0, 'N/A', [], null);
        expect(result.eventCount).toBe(0);
        expect(result.overallSeverity).toBe('none');
        expect(result.summary).toContain('Insufficient data');
    });

    it('returns default result for undefined inputs', async () => {
        const result = buildIncidentReport(undefined, 0, 'N/A', [], undefined);
        expect(result.eventCount).toBe(0);
        expect(result.overallSeverity).toBe('none');
        expect(result.summary).toContain('Insufficient data');
    });

    it('detects high severity failure event when failRate > 30', async () => {
        const result = buildIncidentReport(45, 0, 'N/A', [], 50);
        expect(result.eventCount).toBe(1);
        expect(result.highCount).toBe(1);
        expect(result.overallSeverity).toBe('high');
        expect(result.events[0]?.type).toBe('failure');
        expect(result.events[0]?.severity).toBe('high');
    });

    it('detects high severity regression event when regressionCount > 2', async () => {
        const result = buildIncidentReport(10, 5, 'N/A', [], 90);
        expect(result.eventCount).toBe(1);
        expect(result.highCount).toBe(1);
        expect(result.overallSeverity).toBe('high');
        expect(result.events[0]?.type).toBe('regression');
    });

    it('detects medium severity coverage gap events', async () => {
        const result = buildIncidentReport(10, 0, 'N/A', ['EPIC-1', 'EPIC-2'], 90);
        expect(result.eventCount).toBe(2);
        expect(result.mediumCount).toBe(2);
        expect(result.overallSeverity).toBe('medium');
        expect(result.events[0]?.type).toBe('coverage_gap');
        expect(result.events[1]?.type).toBe('coverage_gap');
    });

    it('detects low severity seasonality event', async () => {
        const result = buildIncidentReport(10, 0, 'December Peak', [], 90);
        expect(result.eventCount).toBe(1);
        expect(result.lowCount).toBe(1);
        expect(result.overallSeverity).toBe('low');
        expect(result.events[0]?.type).toBe('seasonality');
    });

    it('returns none severity for normal data', async () => {
        const result = buildIncidentReport(10, 0, 'N/A', [], 95);
        expect(result.eventCount).toBe(0);
        expect(result.overallSeverity).toBe('none');
        expect(result.summary).toContain('No incidents detected');
    });

    it('sorts events by severity then type', async () => {
        const result = buildIncidentReport(45, 5, 'December Peak', ['EPIC-1'], 50);
        expect(result.eventCount).toBe(4);
        expect(result.events[0]?.type).toBe('failure');
        expect(result.events[1]?.type).toBe('regression');
        expect(result.events[2]?.type).toBe('coverage_gap');
        expect(result.events[3]?.type).toBe('seasonality');
    });

    it('generates unique ISO timestamp', async () => {
        const result = buildIncidentReport(10, 0, 'N/A', [], 90);
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe('generateIncidentReportHtml', () => {
    it('returns valid HTML for real events', async () => {
        const report = buildIncidentReport(45, 3, 'December Peak', ['EPIC-1'], 50);
        const html = generateIncidentReportHtml(report);
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('Incident Investigation Report');
        expect(html).toContain('data-component="metric-card"');
        expect(html).toContain('data-component="card"');
        expect(html).toContain('Overall Severity');
    });

    it('returns error page for null result', async () => {
        const html = generateIncidentReportHtml(null);
        expect(html).toContain('Error generating incident investigation report');
    });

    it('returns error page for undefined result', async () => {
        const html = generateIncidentReportHtml(undefined);
        expect(html).toContain('Error generating incident investigation report');
    });

    it('returns valid HTML for empty events', async () => {
        const report = buildIncidentReport(10, 0, 'N/A', [], 95);
        const html = generateIncidentReportHtml(report, 'Empty Test');
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('No incidents to display');
    });

    it('supports custom title', async () => {
        const report = buildIncidentReport(10, 0, 'N/A', [], 95);
        const html = generateIncidentReportHtml(report, 'Custom Incident Report');
        expect(html).toContain('Custom Incident Report');
    });
});
