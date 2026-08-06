import type { FlatTest, CtrfData } from '../../shared/result_parser.js';
import type { FlakinessEntry, MetricsRun } from '../../shared/types/data-hub.js';
import { calcRunPassRate } from '../../shared/data-hub/compute/run-pass-rate.js';
import { icon } from '../../shared/icons.js';
import { tokens } from '../../shared/ui/theme-tokens.js';

export { isGitHubCi, isGitLabCi } from '../../shared/ci/ci-detect.js';

function buildRunsBarChartHtml(runs: MetricsRun[]): string {
    let html = '<div class="runs-chart">';
    html += '<div class="runs-chart-label">Pass Rate — Last ' + runs.length + ' Runs</div>';
    html += '<div class="runs-chart-bars">';
    for (let i = 0; i < runs.length; i++) {
        const [run] = runs.slice(i, i + 1);
        if (!run) continue;
        const passRate = calcRunPassRate({ passed: run.passed, failed: run.failed });
        const h = Math.max(4, (passRate / 100) * 46);
        let color: string;
        if (passRate >= 90) {
            color = tokens.color.chart.pass;
        } else if (passRate >= 70) {
            color = tokens.color.chart.skip;
        } else {
            color = tokens.color.chart.fail;
        }
        const runLabel = `Run ${i + 1}`;
        html +=
            '<div class="runs-chart-col">' +
            '<div class="runs-chart-bar" style="--bar-h:' +
            h +
            'px;--bar-color:' +
            color +
            '" title="' +
            runLabel +
            ': ' +
            passRate.toFixed(1) +
            '% (' +
            run.passed +
            '/' +
            run.total +
            ')"' +
            '></div>' +
            '<span class="runs-chart-date">' +
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
            '<table class="case17-table">' +
            '<thead><tr>' +
            '<th class="case17-th">Test</th>' +
            '<th class="case17-th case17-th-right">Passes</th>' +
            '<th class="case17-th case17-th-right">Failures</th>' +
            '<th class="case17-th case17-th-right">Rate</th>' +
            '</tr></thead><tbody>';
        for (const entry of flakyEntries) {
            const ratePct = (entry.rate * 100).toFixed(1) + '%';
            table +=
                '<tr>' +
                '<td class="case17-td">' +
                entry.title.replace(/</g, '&lt;') +
                '</td>' +
                '<td class="case17-td case17-td-right">' +
                String(entry.passCount) +
                '</td>' +
                '<td class="case17-td case17-td-right">' +
                String(entry.failCount) +
                '</td>' +
                '<td class="case17-td case17-td-right">' +
                ratePct +
                '</td>' +
                '</tr>';
        }
        table += '</tbody></table>';
        html +=
            '<details class="case17-details">' +
            '<summary class="case17-summary case17-summary-flaky">' +
            icon('alert-triangle', 14) +
            ' Flaky Tests</summary>' +
            table +
            '</details>';
    }

    if (commits) {
        html +=
            '<details class="case17-details case17-details-commits">' +
            '<summary class="case17-summary case17-summary-commits">' +
            icon('file-text', 14) +
            ' Recent Commits</summary>' +
            '<pre class="case17-pre">' +
            commits.replace(/</g, '&lt;') +
            '</pre>' +
            '</details>';
    }
    return html;
}

/**
 * Builds the git pipeline context HTML section with run chart, flaky entries, and commits.
 * Flaky entries are consumed from the DataHub `computed` source (SSOT), not recomputed here.
 * @param commitLog - Formatted commit log string.
 * @param storeRuns - MetricsRun[] from MetricsStore (persisted test run history).
 * @param flakyEntries - FlakinessEntry[] from `computed.flakinessEntries`.
 * @returns HTML string for the git pipeline context section.
 */
export function buildGitTrendHtml(commitLog: string, storeRuns: MetricsRun[], flakyEntries: FlakinessEntry[]): string {
    if (storeRuns.length === 0 && !commitLog && flakyEntries.length === 0) return '';

    let html = '<div class="chart-box case17-box">';
    html += '<div class="label case17-label">' + icon('trending-up', 14) + ' Git Pipeline Context</div>';

    if (storeRuns.length > 0) {
        html += buildRunsBarChartHtml(storeRuns);
    }

    html += buildHtmlDetailsSection(flakyEntries, commitLog);
    html += '</div>';
    return html;
}

export function buildJiraContextHtml(jiraContext: string): string {
    if (!jiraContext) return '';
    let html = '<div class="chart-box case17-box-jira">';
    html += '<div class="label case17-label">' + icon('link', 14) + ' Related Jira Issues</div>';
    html += '<pre class="case17-pre-flat">' + jiraContext.replace(/</g, '&lt;') + '</pre>';
    html += '</div>';
    return html;
}

export function injectAnalysisSection(html: string, analysis: string): string {
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd === -1) return html;
    const section = `<div class="chart-box"><h2>Failure Analysis</h2><pre class="case17-pre-flat">${analysis.replace(/</g, '&lt;')}</pre></div>`;
    return html.slice(0, bodyEnd) + section + html.slice(bodyEnd);
}

export function buildDiffSummary(diff: { newFailures: FlatTest[]; newPasses: FlatTest[]; flaky: FlatTest[] }): string {
    if (diff.newFailures.length === 0 && diff.newPasses.length === 0) return '';
    let s = '<div class="chart-box case17-box">';
    s += '<div class="label case17-label">' + icon('bar-chart', 14) + ' Differential vs Last Run</div>';
    if (diff.newFailures.length > 0) {
        s +=
            '<p class="case17-diff-fail">' +
            icon('x-circle', 14) +
            ' <b>' +
            diff.newFailures.length +
            ' new failure(s):</b></p><ul class="case17-diff-list">';
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
        s +=
            '<p class="case17-diff-pass">' +
            icon('check-circle', 14) +
            ' <b>' +
            diff.newPasses.length +
            ' new pass(es):</b></p>';
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
    const [current] = args.slice(i);
    if (current !== '--publish' || i + 1 >= args.length) return i;
    const [val] = args.slice(i + 1);
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
    const [cur] = args.slice(i);
    if (cur !== '--run' || i + 1 >= args.length) return i;
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
