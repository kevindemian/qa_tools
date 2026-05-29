/** HTML flakiness dashboard generator — renders a table with bar charts for tests exceeding the flakiness threshold. */
import type { FlakinessEntry } from './metrics';
import { rootLogger } from './logger';

const THRESHOLD_PCT = 30;

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Filter flaky entries whose rate exceeds a percentage threshold. */
export function filterHighFlakiness(flaky: FlakinessEntry[], thresholdPct = THRESHOLD_PCT): FlakinessEntry[] {
    return flaky.filter((f) => f.rate * 100 >= thresholdPct);
}

function buildFlakinessCss(pageTitle: string): string {
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<title>' +
        escapeHtml(pageTitle) +
        '</title><style>' +
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
        'html.dark .footer { color: #8b949e; }' +
        '</style></head><body>' +
        '<script>' +
        "(function(){var s=localStorage.getItem('qa-report-theme');if(s==='dark'||(!s&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');})();" +
        '</script>'
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
        html += '<td>' + escapeHtml(f.title.slice(0, 80)) + '</td>';
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
        let html = buildFlakinessCss(pageTitle);
        html += '<h1>' + escapeHtml(pageTitle) + '</h1>';
        html += buildFlakinessSummary(high, flaky);
        html += buildFlakinessTable(high);
        html += '<div class="footer">Generated by QA Tools — Flakiness Dashboard</div>';
        html += '</body></html>';
        return html;
    } catch (err) {
        rootLogger.error('Failed to generate flakiness dashboard: ' + (err as Error).message);
        return '<!DOCTYPE html><html><body><h1>Error generating dashboard</h1></body></html>';
    }
}
