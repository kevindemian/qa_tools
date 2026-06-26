/**
 * Tests for impact-alert — Impact-Aware Pipeline Alert.
 */

import * as reportStyles from './report-styles.js';
import { analyzePipelineImpact, generateImpactAlertHtml } from './impact-alert.js';
import type { ImpactAlertResult } from './impact-alert.js';
import { nullAs, undefinedAs, nonNull } from './test-utils.js';

describe('AnalyzePipelineImpact', () => {
    it('returns default result for null passRate', () => {
        const result = analyzePipelineImpact(nullAs<number>(), 0, [], 80, []);

        expect(result.alerts).toHaveLength(1);
        expect(nonNull(result.alerts[0]).title).toBe('Insufficient data');
        expect(result.criticalCount).toBe(0);
        expect(result.warningCount).toBe(0);
        expect(result.infoCount).toBe(1);
    });

    it('returns default result for undefined passRate', () => {
        const result = analyzePipelineImpact(undefinedAs<number>(), 0, [], 80, []);

        expect(result.alerts).toHaveLength(1);
        expect(nonNull(result.alerts[0]).title).toBe('Insufficient data');
        expect(result.criticalCount).toBe(0);
        expect(result.warningCount).toBe(0);
        expect(result.infoCount).toBe(1);
    });

    it('returns default result for null coveragePct', () => {
        const result = analyzePipelineImpact(90, 0, [], nullAs<number>(), []);

        expect(result.alerts).toHaveLength(1);
        expect(nonNull(result.alerts[0]).title).toBe('Insufficient data');
    });

    it('returns default result for undefined coveragePct', () => {
        const result = analyzePipelineImpact(90, 0, [], undefinedAs<number>(), []);

        expect(result.alerts).toHaveLength(1);
        expect(nonNull(result.alerts[0]).title).toBe('Insufficient data');
    });

    it('generates CRITICAL alert when passRate < 70 and coveragePct < 70', () => {
        const result = analyzePipelineImpact(50, 3, ['Login failure', 'DB timeout'], 45, ['Epic-1']);

        expect(result.criticalCount).toBe(1);
        expect(result.warningCount).toBeGreaterThanOrEqual(1);
        expect(result.alerts.some((a) => a.severity === 'critical')).toBeTruthy();

        const critical = result.alerts.find((a) => a.severity === 'critical');

        expect(critical?.title).toBe('Low pass rate in low-coverage area');
    });

    it('generates WARNING alert for elevated failure rate', () => {
        const result = analyzePipelineImpact(50, 3, ['Login failure'], 80, []);

        expect(result.warningCount).toBeGreaterThanOrEqual(1);
        expect(result.alerts.some((a) => a.title === 'Elevated failure rate')).toBeTruthy();
    });

    it('generates WARNING alert for coverage below threshold', () => {
        const result = analyzePipelineImpact(90, 0, [], 50, []);

        expect(result.warningCount).toBeGreaterThanOrEqual(1);
        expect(result.alerts.some((a) => a.title === 'Coverage below threshold')).toBeTruthy();
    });

    it('generates WARNING for failures in uncovered epics', () => {
        const result = analyzePipelineImpact(90, 2, ['Timeout'], 80, ['Epic-X', 'Epic-Y']);

        expect(result.warningCount).toBeGreaterThanOrEqual(1);
        expect(result.alerts.some((a) => a.title === 'Failures in uncovered epics')).toBeTruthy();
    });

    it('generates INFO all-clear alert when passRate >= 80 and coveragePct >= 80', () => {
        const result = analyzePipelineImpact(95, 0, [], 90, []);

        expect(result.infoCount).toBeGreaterThanOrEqual(1);
        expect(result.alerts.some((a) => a.title === 'All clear')).toBeTruthy();
        expect(result.criticalCount).toBe(0);
        expect(result.warningCount).toBe(0);
    });

    it('deduplicates alerts by title', () => {
        const result = analyzePipelineImpact(50, 3, ['Login failure'], 45, ['Epic-1']);
        const titles = result.alerts.map((a) => a.title);

        expect(new Set(titles).size).toBe(titles.length);
    });

    it('tracks severity counts correctly', () => {
        const result = analyzePipelineImpact(50, 3, ['Login failure'], 45, ['Epic-1']);
        const actualCritical = result.alerts.filter((a) => a.severity === 'critical').length;
        const actualWarning = result.alerts.filter((a) => a.severity === 'warning').length;
        const actualInfo = result.alerts.filter((a) => a.severity === 'info').length;

        expect(result.criticalCount).toBe(actualCritical);
        expect(result.warningCount).toBe(actualWarning);
        expect(result.infoCount).toBe(actualInfo);
    });

    it('produces valid timestamp', () => {
        const result = analyzePipelineImpact(95, 0, [], 90, []);
        const d = new Date(result.timestamp);

        expect(d.toString()).not.toBe('Invalid Date');
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('timestamp is a valid ISO date string', () => {
        const result = analyzePipelineImpact(95, 0, [], 90, []);
        const d = new Date(result.timestamp);

        expect(d.toString()).not.toBe('Invalid Date');
        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('does not generate critical alert when only one condition is low', () => {
        const lowPass = analyzePipelineImpact(50, 0, [], 80, []);

        expect(lowPass.criticalCount).toBe(0);
        expect(lowPass.alerts.some((a) => a.severity === 'critical')).toBeFalsy();

        const lowCoverage = analyzePipelineImpact(90, 0, [], 45, []);

        expect(lowCoverage.criticalCount).toBe(0);
        expect(lowCoverage.alerts.some((a) => a.severity === 'critical')).toBeFalsy();
    });

    it('handles zero failing jobs and no uncovered epics', () => {
        const result = analyzePipelineImpact(95, 0, [], 90, []);

        expect(result.alerts.length).toBeGreaterThanOrEqual(1);
        expect(result.warningCount).toBe(0);
        expect(result.criticalCount).toBe(0);
    });
});

describe('GenerateImpactAlertHtml', () => {
    function makeResult(overrides?: Partial<ImpactAlertResult>): ImpactAlertResult {
        return {
            alerts: [],
            criticalCount: 0,
            warningCount: 0,
            infoCount: 0,
            timestamp: '2026-06-03T12:00:00.000Z',
            ...overrides,
        };
    }

    it('generates valid HTML page with real alerts', () => {
        const result = makeResult({
            alerts: [
                {
                    severity: 'critical',
                    title: 'Low pass rate in low-coverage area',
                    message: 'Pipeline pass rate is below 70%.',
                    affectedArea: 'Login, DB',
                    recommendation: 'Increase coverage.',
                },
                {
                    severity: 'warning',
                    title: 'Elevated failure rate',
                    message: 'Pipeline health degraded.',
                    affectedArea: 'Pipeline',
                    recommendation: 'Stabilize pipeline.',
                },
                {
                    severity: 'info',
                    title: 'All clear',
                    message: 'No issues.',
                    affectedArea: 'General',
                    recommendation: 'Keep monitoring.',
                },
            ],
            criticalCount: 1,
            warningCount: 1,
            infoCount: 1,
        });
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('</html>');
        expect(html).toContain('Low pass rate in low-coverage area');
        expect(html).toContain('Elevated failure rate');
        expect(html).toContain('All clear');
    });

    it('shows summary cards with alert counts', () => {
        const result = makeResult({
            alerts: [
                {
                    severity: 'critical',
                    title: 'Critical issue',
                    message: 'Test',
                    affectedArea: 'Area',
                    recommendation: 'Fix it',
                },
            ],
            criticalCount: 1,
            warningCount: 2,
            infoCount: 3,
        });
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('Total Alerts');
        expect(html).toContain('Critical');
        expect(html).toContain('Warning');
        expect(html).toContain('Info');
        expect(html).toContain('data-component="metric-grid"');
        expect(html).toContain('data-component="metric-card"');
    });

    it('returns error page for null result', () => {
        const html = generateImpactAlertHtml(nullAs<ImpactAlertResult>());

        expect(html).toContain('Impact Alert Report Error');
    });

    it('returns error page for undefined result', () => {
        const html = generateImpactAlertHtml(undefinedAs<ImpactAlertResult>());

        expect(html).toContain('Impact Alert Report Error');
    });

    it('shows no-alerts message when alerts list is empty', () => {
        const result = makeResult();
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('No alerts to display');
    });

    it('uses custom title', () => {
        const result = makeResult();
        const html = generateImpactAlertHtml(result, 'My Alert Report');

        expect(html).toContain('<title>My Alert Report</title>');
        expect(html).toContain('<h1>My Alert Report</h1>');
    });

    it('defaults title to Impact-Aware Pipeline Alert', () => {
        const result = makeResult();
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('<title>Impact-Aware Pipeline Alert</title>');
        expect(html).toContain('<h1>Impact-Aware Pipeline Alert</h1>');
    });

    it('includes theme and dark mode support', () => {
        const result = makeResult();
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('qa-report-theme');
        expect(html).toContain('prefers-color-scheme');
        expect(html).toContain('html.dark');
    });

    it('includes footer', () => {
        const result = makeResult();
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('Impact-Aware Pipeline Alert');
    });

    it('renders alert cards with severity colors', () => {
        const result = makeResult({
            alerts: [
                {
                    severity: 'critical',
                    title: 'Critical issue',
                    message: 'Critical message',
                    affectedArea: 'Core',
                    recommendation: 'Fix now',
                },
                {
                    severity: 'warning',
                    title: 'Warning issue',
                    message: 'Warning message',
                    affectedArea: 'Module A',
                    recommendation: 'Review',
                },
                {
                    severity: 'info',
                    title: 'Info issue',
                    message: 'Info message',
                    affectedArea: 'All',
                    recommendation: 'Monitor',
                },
            ],
            criticalCount: 1,
            warningCount: 1,
            infoCount: 1,
        });
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('data-component="card"');
        expect(html).toContain('Critical issue');
        expect(html).toContain('Warning issue');
        expect(html).toContain('Info issue');
        expect(html).toContain('Critical message');
        expect(html).toContain('Warning message');
        expect(html).toContain('Info message');
        expect(html).toContain('Core');
    });

    it('renders all alert fields', () => {
        const result = makeResult({
            alerts: [
                {
                    severity: 'critical',
                    title: 'Critical issue',
                    message: 'Critical message',
                    affectedArea: 'Core',
                    recommendation: 'Fix now',
                },
                {
                    severity: 'warning',
                    title: 'Warning issue',
                    message: 'Warning message',
                    affectedArea: 'Module A',
                    recommendation: 'Review',
                },
                {
                    severity: 'info',
                    title: 'Info issue',
                    message: 'Info message',
                    affectedArea: 'All',
                    recommendation: 'Monitor',
                },
            ],
            criticalCount: 1,
            warningCount: 1,
            infoCount: 1,
        });
        const html = generateImpactAlertHtml(result);

        expect(html).toContain('Module A');
        expect(html).toContain('Fix now');
        expect(html).toContain('Review');
        expect(html).toContain('Monitor');
    });

    it('sanitizes alert content in HTML', () => {
        const result = makeResult({
            alerts: [
                {
                    severity: 'warning',
                    title: '<script>alert("xss")</script>',
                    message: 'Message with <b>html</b>',
                    affectedArea: '<img src=x onerror=alert(1)>',
                    recommendation: 'Sanitize <input>',
                },
            ],
            warningCount: 1,
        });
        const html = generateImpactAlertHtml(result);

        expect(html).not.toContain('<script>alert("xss")</script>');
        expect(html).not.toContain('<img src=x onerror=alert(1)>');
        expect(html).not.toContain('<input>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&lt;img');
        expect(html).toContain('&lt;input&gt;');
    });

    it('returns error page when buildCss throws', () => {
        const spy = vi.spyOn(reportStyles, 'buildCss').mockImplementation(() => {
            throw new Error('CSS build failure');
        });
        try {
            const result = makeResult();
            const html = generateImpactAlertHtml(result);

            expect(html).toContain('Impact Alert Report Error');
        } finally {
            spy.mockRestore();
        }
    });
});
