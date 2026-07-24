/**
 * Flakiness Dashboard — HTML rendering layer.
 *
 * Receives flakiness data and produces a complete HTML page.
 * This module has NO business logic — only presentation.
 *
 * @module flakiness-renderer
 */

import type { FlakinessEntry, DataHub } from '../types/data-hub.js';
import { rootLogger } from '../logger.js';
import { sanitizeHtml } from '../escape.js';
import { buildHtmlPage, buildErrorPage } from './html-factory.js';
import { buildCss } from './report-styles.js';
import { MetricCard, MetricGrid, Badge, Sparkline } from '../primitives/index.js';
import type { FlakinessThresholds, FlakinessOptions } from './flakiness-dashboard.js';
import { filterHighFlakiness, validateThresholds } from './flakiness-dashboard.js';

function buildFlakinessSummary(
    high: FlakinessEntry[],
    flaky: FlakinessEntry[],
    thresholds: FlakinessThresholds,
): string {
    return MetricGrid({
        children:
            MetricCard({
                label: 'Total Flaky Tests',
                value: String(high.length),
                severity: high.length > thresholds.errorSeverityThreshold ? 'error' : 'warn',
            }) +
            MetricCard({ label: 'Threshold', value: '>' + thresholds.thresholdPct + '%' }) +
            MetricCard({ label: 'All Candidates', value: String(flaky.length) }),
    });
}

function buildFlakinessTable(high: FlakinessEntry[], thresholds: FlakinessThresholds): string {
    if (high.length === 0) return '<p>No tests exceed the ' + thresholds.thresholdPct + '% flakiness threshold.</p>';
    let html =
        '<div style="overflow-x:auto;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)"><table style="width:100%;border-collapse:collapse;background:var(--color-surface-card);font-size:0.875rem;color:var(--color-text-primary)">' +
        '<thead style="background:var(--color-surface-elevated)"><tr>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Test</th>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Pass</th>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Fail</th>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Skip</th>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Rate</th>' +
        '<th style="padding:10px 12px;font-size:0.75rem;text-transform:uppercase;color:var(--color-text-secondary);text-align:left">Bar</th>' +
        '</tr></thead><tbody>';
    for (const f of high) {
        const pct = Math.round(f.rate * 100);
        const severity = pct >= thresholds.highFlakinessPct ? 'high' : 'medium';
        const rowStyle =
            'border-bottom:1px solid var(--color-border-subtle);transition:background 0.15s" onmouseover="this.style.background=\'var(--color-surface-elevated)\'" onmouseout="this.style.background=\'\'">';
        html += '<tr style="' + rowStyle;
        html += '<td style="padding:8px 12px">' + sanitizeHtml(f.title.slice(0, 80)) + '</td>';
        html += '<td style="padding:8px 12px">' + f.passCount + '</td>';
        html += '<td style="padding:8px 12px">' + f.failCount + '</td>';
        html += '<td style="padding:8px 12px">' + f.skipCount + '</td>';
        html +=
            '<td style="padding:8px 12px">' +
            Badge({
                variant: severity === 'high' ? 'fail' : 'warn',
                children: pct + '%',
            }) +
            '</td>';
        html +=
            '<td style="padding:8px 12px">' +
            Sparkline({
                value: pct,
                maxValue: 100,
                width: 100,
                height: 8,
            }) +
            '</td>';
        html += '</tr>';
    }
    html += '</tbody></table></div>';
    return html;
}

const FLAKINESS_CSS = `
.src-banner{margin:12px 0;padding:8px 12px;background:var(--color-surface-card);border-radius:8px;font-size:0.82rem;color:var(--color-text-secondary);display:flex;gap:12px;flex-wrap:wrap}
.src-conf{color:var(--color-text-secondary)}
.src-warn{color:var(--color-badge-fail-text);font-weight:600}
`;

function buildSourceQualityBanner(dataHub?: DataHub): string {
    if (!dataHub) return '';
    const parts: string[] = [];
    const provenance = dataHub.getProvenance()?.get('failureRecords');
    if (provenance && Number.isFinite(provenance.confidence)) {
        parts.push(
            `<span class="src-conf">failure-records source confidence: ${Math.round(provenance.confidence * 100)}%</span>`,
        );
    }
    const report = dataHub.getQuality('failureRecords');
    if (report && !report.valid) {
        parts.push(
            `<span class="src-warn">failure-records quality issues: ${sanitizeHtml(report.issues.join('; '))}</span>`,
        );
    }
    if (!parts.length) return '';
    return `<div class="src-banner">${parts.join(' ')}</div>`;
}

export function generateFlakinessHtml(flaky: FlakinessEntry[], title?: string, options?: FlakinessOptions): string {
    try {
        const thresholds = validateThresholds(options?.thresholds);
        const high = filterHighFlakiness(flaky, thresholds);
        const pageTitle = title || 'Flakiness Dashboard';
        const sourceBanner = buildSourceQualityBanner(options?.dataHub);
        const bodyContent =
            '<h1>' +
            sanitizeHtml(pageTitle) +
            '</h1>' +
            sourceBanner +
            buildFlakinessSummary(high, flaky, thresholds) +
            buildFlakinessTable(high, thresholds);
        return buildHtmlPage({
            title: pageTitle,
            styles: buildCss() + FLAKINESS_CSS,
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Flakiness Dashboard',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to generate flakiness dashboard. Verify that flakiness data is valid and complete, then retry. Details: ' +
                msg,
        );
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
