/** HTML flakiness dashboard generator — renders a table with bar charts for tests exceeding the flakiness threshold. */
import type { FlakinessEntry } from './metrics';
import { rootLogger } from './logger';
import { sanitizeHtml } from './escape';
import { buildHtmlPage, buildErrorPage } from './html-factory';

const THRESHOLD_PCT = 30;

/** Filter flaky entries whose rate exceeds a percentage threshold. */
export function filterHighFlakiness(flaky: FlakinessEntry[], thresholdPct = THRESHOLD_PCT): FlakinessEntry[] {
    return flaky.filter((f) => f.rate * 100 >= thresholdPct);
}

function buildFlakinessCss(): string {
    return (
        "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f9fafb; color: #111827; }" +
        'h1 { font-size: 1.5rem; }' +
        '.summary { display: flex; gap: 12px; margin-bottom: 20px; }' +
        '.card { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); min-width: 100px; }' +
        '.card .label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }' +
        '.card .value { font-size: 1.5rem; font-weight: 700; }' +
        '.card .value.danger { color: #dc2626; }' +
        '.card .value.warn { color: #ca8a04; }' +
        'table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }' +
        'th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #6b7280; }' +
        'td { padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 0.875rem; }' +
        '.bar-bg { background: #e5e7eb; border-radius: 9999px; height: 8px; width: 100px; display: inline-block; vertical-align: middle; }' +
        '.bar-fill { height: 8px; border-radius: 9999px; display: block; }' +
        '.bar-danger { background: #ef4444; }' +
        '.bar-warn { background: #facc15; }' +
        '.status-high { color: #dc2626; font-weight: 600; }' +
        '.status-medium { color: #ca8a04; }' +
        '.footer { margin-top: 16px; font-size: 0.75rem; color: #9ca3af; text-align: center; }' +
        'html.dark body { background: #0d1117; color: #c9d1d9; }' +
        'html.dark .card { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }' +
        'html.dark .card .label { color: #8b949e; }' +
        'html.dark table { background: #161b22; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }' +
        'html.dark th { background: #1c2128; color: #8b949e; }' +
        'html.dark td { border-top-color: #30363d; }' +
        'html.dark .bar-bg { background: #30363d; }' +
        'html.dark .footer { color: #8b949e; }'
    );
}

function buildFlakinessSummary(high: FlakinessEntry[], flaky: FlakinessEntry[]): string {
    let html = '<div class="summary">';
    html +=
        '<div class="card"><div class="label">Total Flaky Tests</div><div class="value ' +
        (high.length > 5 ? 'danger' : 'warn') +
        '">' +
        high.length +
        '</div></div>';
    html +=
        '<div class="card"><div class="label">Threshold</div><div class="value">>' + THRESHOLD_PCT + '%</div></div>';
    html +=
        '<div class="card"><div class="label">All Candidates</div><div class="value">' + flaky.length + '</div></div>';
    html += '</div>';
    return html;
}

function buildFlakinessTable(high: FlakinessEntry[]): string {
    if (high.length === 0) return '<p>No tests exceed the ' + THRESHOLD_PCT + '% flakiness threshold.</p>';
    let html =
        '<table><thead><tr><th>Test</th><th>Pass</th><th>Fail</th><th>Skip</th><th>Rate</th><th>Bar</th></tr></thead><tbody>';
    for (const f of high) {
        const pct = Math.round(f.rate * 100);
        const cssClass = pct >= 50 ? 'status-high' : 'status-medium';
        html += '<tr>';
        html += '<td>' + sanitizeHtml(f.title.slice(0, 80)) + '</td>';
        html += '<td>' + f.passCount + '</td>';
        html += '<td>' + f.failCount + '</td>';
        html += '<td>' + f.skipCount + '</td>';
        html += '<td class="' + cssClass + '">' + pct + '%</td>';
        html +=
            '<td><span class="bar-bg"><span class="bar-fill ' +
            (pct >= 50 ? 'bar-danger' : 'bar-warn') +
            '" style="width:' +
            Math.min(pct, 100) +
            'px"></span></span></td>';
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

/** Generate a complete HTML page with flakiness summary cards and a test table. */
export function generateFlakinessHtml(flaky: FlakinessEntry[], title?: string): string {
    try {
        const high = filterHighFlakiness(flaky);
        const pageTitle = title || 'Flakiness Dashboard';
        const bodyContent =
            '<h1>' + sanitizeHtml(pageTitle) + '</h1>' + buildFlakinessSummary(high, flaky) + buildFlakinessTable(high);
        return buildHtmlPage({
            title: pageTitle,
            styles: buildFlakinessCss(),
            theme: 'system',
            bodyContent,
            footer: 'Generated by QA Tools — Flakiness Dashboard',
        });
    } catch (err) {
        rootLogger.error('Failed to generate flakiness dashboard: ' + (err as Error).message);
        return buildErrorPage('Error generating dashboard', 'Error generating dashboard');
    }
}
