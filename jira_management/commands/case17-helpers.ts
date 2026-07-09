import type { FlatTest, CtrfData } from '../../shared/result_parser.js';
import type { FlakinessEntry, MetricsRun } from '../../shared/types/data-hub.js';
import { calcRunPassRate } from '../../shared/data-hub/compute/run-pass-rate.js';
import { calcFlakinessEntries } from '../../shared/data-hub/compute/flakiness-entries.js';

export { isGitHubCi, isGitLabCi } from '../../shared/ci-detect.js';

function buildRunsBarChartHtml(runs: MetricsRun[]): string {
    let html = '<div style="margin-bottom:8px">';
    html +=
        '<div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">Pass Rate — Last ' + runs.length + ' Runs</div>';
    html += '<div style="display:flex;gap:4px;align-items:flex-end;height:50px;padding:4px 0">';
    for (let i = 0; i < runs.length; i++) {
        const run = runs[i];
        if (!run) continue;
        const passRate = calcRunPassRate({ passed: run.passed, failed: run.failed });
        const h = Math.max(4, (passRate / 100) * 46);
        let color: string;
        if (passRate >= 90) {
            color = '#22c55e';
        } else if (passRate >= 70) {
            color = '#f59e0b';
        } else {
            color = '#ef4444';
        }
        const runLabel = `Run ${i + 1}`;
        html +=
            '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">' +
            '<div style="width:100%;height:' +
            h +
            'px;background:' +
            color +
            ';border-radius:3px 3px 0 0;min-height:4px" title="' +
            runLabel +
            ': ' +
            passRate.toFixed(1) +
            '% (' +
            run.passed +
            '/' +
            run.total +
            ')"' +
            '></div>' +
            '<span style="font-size:0.6rem;color:#6b7280">' +
            run.timestamp.slice(5, 10) +
            '</span>' +
            '</div>';
    }
    html += '</div></div>';
    return html;
}

/**
 * Builds HTML details sections for flaky entries and recent commits.
 * @param flakyEntries - Structured flakiness data with pass/fail counts and rate.
 * @param commits - Newline-delimited commit log string.
 * @returns HTML string with collapsible details sections.
 */
function buildHtmlDetailsSection(flakyEntries: FlakinessEntry[], commits: string): string {
    let html = '';
    if (flakyEntries.length > 0) {
        let table =
            '<table style="margin:4px 0 0 8px;font-size:0.8rem;border-collapse:collapse;width:100%">' +
            '<thead><tr>' +
            '<th style="text-align:left;padding:2px 8px;border-bottom:1px solid #e5e7eb">Test</th>' +
            '<th style="text-align:right;padding:2px 8px;border-bottom:1px solid #e5e7eb">Passes</th>' +
            '<th style="text-align:right;padding:2px 8px;border-bottom:1px solid #e5e7eb">Failures</th>' +
            '<th style="text-align:right;padding:2px 8px;border-bottom:1px solid #e5e7eb">Rate</th>' +
            '</tr></thead><tbody>';
        for (const entry of flakyEntries) {
            const ratePct = (entry.rate * 100).toFixed(1) + '%';
            table +=
                '<tr>' +
                '<td style="padding:2px 8px">' +
                entry.title.replace(/</g, '&lt;') +
                '</td>' +
                '<td style="text-align:right;padding:2px 8px">' +
                String(entry.passCount) +
                '</td>' +
                '<td style="text-align:right;padding:2px 8px">' +
                String(entry.failCount) +
                '</td>' +
                '<td style="text-align:right;padding:2px 8px">' +
                ratePct +
                '</td>' +
                '</tr>';
        }
        table += '</tbody></table>';
        html +=
            '<details style="margin-bottom:6px;font-size:0.85rem">' +
            '<summary style="cursor:pointer;color:#8b5cf6;font-weight:600">⚠️ Flaky Tests</summary>' +
            table +
            '</details>';
    }

    if (commits) {
        html +=
            '<details style="margin-bottom:4px;font-size:0.85rem">' +
            '<summary style="cursor:pointer;color:#6366f1;font-weight:600">📝 Recent Commits</summary>' +
            '<pre style="margin:4px 0 0 8px;font-size:0.8rem;white-space:pre-wrap">' +
            commits.replace(/</g, '&lt;') +
            '</pre>' +
            '</details>';
    }
    return html;
}

/**
 * Builds the git pipeline context HTML section with run chart, flaky entries, and commits.
 * Flaky entries are computed from store runs (not received as parameter).
 * @param commitLog - Formatted commit log string.
 * @param storeRuns - MetricsRun[] from MetricsStore (persisted test run history).
 * @returns HTML string for the git pipeline context section.
 */
export function buildGitTrendHtml(commitLog: string, storeRuns: MetricsRun[]): string {
    const flakyEntries = storeRuns.length >= 2 ? calcFlakinessEntries(storeRuns) : [];
    if (storeRuns.length === 0 && !commitLog && flakyEntries.length === 0) return '';

    let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">📈 Git Pipeline Context</div>';

    if (storeRuns.length > 0) {
        html += buildRunsBarChartHtml(storeRuns);
    }

    html += buildHtmlDetailsSection(flakyEntries, commitLog);
    html += '</div>';
    return html;
}

export function buildJiraContextHtml(jiraContext: string): string {
    if (!jiraContext) return '';
    let html = '<div class="chart-box" style="border-left:4px solid #0052cc;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">🔗 Related Jira Issues</div>';
    html +=
        '<pre style="margin:0;font-size:0.85rem;white-space:pre-wrap">' + jiraContext.replace(/</g, '&lt;') + '</pre>';
    html += '</div>';
    return html;
}

export function injectAnalysisSection(html: string, analysis: string): string {
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd === -1) return html;
    const section = `<div class="chart-box"><h2>Failure Analysis</h2><pre style="white-space:pre-wrap;font-size:0.85rem">${analysis.replace(/</g, '&lt;')}</pre></div>`;
    return html.slice(0, bodyEnd) + section + html.slice(bodyEnd);
}

export function buildDiffSummary(diff: { newFailures: FlatTest[]; newPasses: FlatTest[]; flaky: FlatTest[] }): string {
    if (diff.newFailures.length === 0 && diff.newPasses.length === 0) return '';
    let s = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
    s += '<div class="label" style="margin-bottom:6px">📊 Differential vs Last Run</div>';
    if (diff.newFailures.length > 0) {
        s +=
            '<p style="margin:2px 0;color:#ef4444">🔴 <b>' +
            diff.newFailures.length +
            ' new failure(s):</b></p><ul style="margin:2px 0 6px 16px;font-size:0.85rem">';
        for (const f of diff.newFailures.slice(0, 5)) {
            s +=
                '<li>' +
                f.title.replace(/</g, '&lt;') +
                (f.error ? ': ' + f.error.slice(0, 80).replace(/</g, '&lt;') : '') +
                '</li>';
        }
        if (diff.newFailures.length > 5) s += '<li>... e mais ' + (diff.newFailures.length - 5) + '</li>';
        s += '</ul>';
    }
    if (diff.newPasses.length > 0) {
        s += '<p style="margin:2px 0;color:#22c55e">✅ <b>' + diff.newPasses.length + ' new pass(es):</b></p>';
    }
    s += '</div>';
    return s;
}

export function isValidCtrfData(data: unknown): data is CtrfData {
    if (!data || typeof data !== 'object') return false;
    const obj = data as CtrfData;
    if (typeof obj.results !== 'object' || obj.results === null) return false;
    return Array.isArray(obj.results.tests);
}

function parsePublishArg(
    args: string[],
    i: number,
    result: { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> },
): number {
    if (args[i] !== '--publish' || i + 1 >= args.length) return i;
    const val = Reflect.get(args, i + 1);
    if (val) {
        result.publishTarget = val;
        return i + 1;
    }
    return i;
}

function parseRunArg(
    args: string[],
    i: number,
    result: { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> },
): number {
    if (args[i] !== '--run' || i + 1 >= args.length) return i;
    const val = args[i + 1];
    if (!val) return i;
    const eqIdx = val.indexOf('=');
    if (eqIdx > 0) {
        const name = val.slice(0, eqIdx);
        const file = val.slice(eqIdx + 1);
        if (name && file) {
            result.extraRuns.push({ name, file });
        }
    }
    return i + 1;
}

export function parseCliExtra(): { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> } {
    const args = process.argv.slice(2);
    const result: { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> } = { extraRuns: [] };
    let idx = 0;
    while (idx < args.length) {
        const arg = Reflect.get(args, idx);
        if (!arg) {
            idx++;
            continue;
        }
        idx = parsePublishArg(args, idx, result);
        idx = parseRunArg(args, idx, result);
        idx++;
    }
    return result;
}
