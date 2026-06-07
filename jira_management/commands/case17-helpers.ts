import fs from 'fs';
import path from 'path';
import type { FlatTest, CtrfData, CtrfSummary } from '../../shared/result_parser.js';
import type { CiContext, RunStats } from '../../shared/ci-detect.js';

export const CTRF_LAST_FILE = 'last-results.ctrf.json';

export { isGitHubCi, isGitLabCi } from '../../shared/ci-detect.js';
export type { CiContext, RunStats } from '../../shared/ci-detect.js';

function buildRunsBarChartHtml(runs: RunStats[]): string {
    let html = '<div style="margin-bottom:8px">';
    html +=
        '<div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">Pass Rate — Last ' + runs.length + ' Runs</div>';
    html += '<div style="display:flex;gap:4px;align-items:flex-end;height:50px;padding:4px 0">';
    for (const run of runs) {
        const h = Math.max(4, (run.passRate / 100) * 46);
        const color = run.passRate >= 90 ? '#22c55e' : run.passRate >= 70 ? '#f59e0b' : '#ef4444';
        html +=
            '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">' +
            '<div style="width:100%;height:' +
            h +
            'px;background:' +
            color +
            ';border-radius:3px 3px 0 0;min-height:4px" title="' +
            'Run ' +
            run.runId +
            ': ' +
            run.passRate.toFixed(1) +
            '% (' +
            run.passed +
            '/' +
            run.total +
            ')"' +
            '></div>' +
            '<span style="font-size:0.6rem;color:#6b7280">' +
            (run.createdAt || '').slice(5, 10) +
            '</span>' +
            '</div>';
    }
    html += '</div></div>';
    return html;
}

function buildHtmlDetailsSection(flakyTests: string, commits: string): string {
    let html = '';
    if (flakyTests) {
        html +=
            '<details style="margin-bottom:6px;font-size:0.85rem">' +
            '<summary style="cursor:pointer;color:#8b5cf6;font-weight:600">⚠️ Flaky Tests</summary>' +
            '<pre style="margin:4px 0 0 8px;font-size:0.8rem;white-space:pre-wrap">' +
            flakyTests.replace(/</g, '&lt;') +
            '</pre>' +
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

export function buildGitTrendHtml(ci: CiContext): string {
    if (ci.runs.length === 0 && !ci.commits && !ci.flakyTests) return '';

    let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">📈 Git Pipeline Context</div>';

    if (ci.runs.length > 0) {
        html += buildRunsBarChartHtml(ci.runs);
    }

    html += buildHtmlDetailsSection(ci.flakyTests, ci.commits);
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
    if (!obj.results || typeof obj.results !== 'object') return false;
    return Array.isArray(obj.results?.tests);
}

export function parseCliExtra(): { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> } {
    const args = process.argv.slice(2);
    const result: { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> } = { extraRuns: [] };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        if (arg === '--publish' && i + 1 < args.length) {
            const val = args[i + 1];
            if (val) {
                result.publishTarget = val;
                i++;
            }
        } else if (arg === '--run' && i + 1 < args.length) {
            const val = args[i + 1];
            if (val) {
                i++;
                const eqIdx = val.indexOf('=');
                if (eqIdx > 0) {
                    const name = val.slice(0, eqIdx);
                    const file = val.slice(eqIdx + 1);
                    if (name && file) {
                        result.extraRuns.push({ name, file });
                    }
                }
            }
        }
    }
    return result;
}

export function saveMetricsJson(tests: FlatTest[], htmlDir: string): void {
    const passed = tests.filter((t) => t.state === 'passed').length;
    const failed = tests.filter((t) => t.state === 'failed').length;
    const skipped = tests.filter((t) => t.state === 'skipped').length;
    const duration = tests.reduce((sum, t) => sum + t.duration, 0);
    const summary: CtrfSummary = {
        tests: tests.length,
        passed,
        failed,
        skipped,
        pending: 0,
        other: 0,
        start: Date.now() - duration,
        stop: Date.now(),
    };

    const ctrfData: CtrfData = {
        results: {
            summary,
            tests: tests.map((t) => ({
                name: t.title,
                status: t.state,
                duration: t.duration,
                ...(t.error ? { message: t.error } : {}),
                ...(t.fullTitle ? { suite: t.fullTitle } : {}),
            })),
        },
    };

    const statsData = {
        generatedAt: new Date().toISOString(),
        total: tests.length,
        passed,
        failed,
        skipped,
        passRate: tests.length > 0 ? ((passed / tests.length) * 100).toFixed(1) : '0.0',
        duration,
    };

    fs.writeFileSync(path.join(htmlDir, 'report.ctrf.json'), JSON.stringify(ctrfData, null, 2), 'utf8');
    fs.writeFileSync(path.join(htmlDir, 'report.stats.json'), JSON.stringify(statsData, null, 2), 'utf8');
    fs.writeFileSync(path.join(htmlDir, CTRF_LAST_FILE), JSON.stringify(ctrfData, null, 2), 'utf8');
}
