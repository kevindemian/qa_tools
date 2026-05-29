/** Generate an HTML report from CTRF JSON results. */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { createHttpClient } from '../../shared/http-client';
import { ask, askConfirm, info, printError, title, withSpinner } from '../../shared/prompt';
import type { ParseResult, FlatTest, CtrfData, CtrfSummary } from '../../shared/result_parser';
import { writeReport } from '../../shared/temp-dir';
import { parseTestResultsFile } from '../../shared/result_parser';
import {
    generateHtmlReport,
    categorizeFailure,
    loadKnownIssues,
    type TestHistoryRun,
    type TestRunTab,
} from '../../shared/report-generator';
import { analyzeFailuresWithReport, type LlmContext } from '../../shared/failure-analysis';
import { collectAutomated, interactiveBugReportFlow } from '../../shared/bug-report';
import { openWithOsOrFallback } from '../../shared/open';
import { publishReport } from '../../shared/publish';
import { createHistoryProvider, TestHistoryCache } from '../xray-history';
import type { CommandContext } from './context';

const CTRF_LAST_FILE = 'last-results.ctrf.json';
const GIT_HISTORY_RUNS = 5;

interface RunStats {
    runId: number | string;
    createdAt: string;
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    passRate: number;
}

interface CiContext {
    commits: string;
    runs: RunStats[];
    flakyTests: string;
}

function _isGitHubCi(): boolean {
    return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY);
}

function _isGitLabCi(): boolean {
    return !!(process.env.CI_JOB_TOKEN && process.env.CI_PROJECT_ID);
}

async function _fetchGitHistory(): Promise<CiContext> {
    if (_isGitHubCi()) return _fetchGitHubHistory();
    if (_isGitLabCi()) return _fetchGitLabHistory();
    return { commits: '', runs: [], flakyTests: '' };
}

async function _fetchGitHubHistory(): Promise<CiContext> {
    const token = process.env.GITHUB_TOKEN as string;
    const repo = process.env.GITHUB_REPOSITORY as string;
    const client = createHttpClient({
        baseUrl: 'https://api.github.com',
        authHeader: { Authorization: 'Bearer ' + token },
    });

    try {
        const runsResp = await client.get(
            `/repos/${repo}/actions/runs?per_page=${GIT_HISTORY_RUNS}&status=success&status=failure`,
        );
        const runs: unknown[] = ((runsResp.data as Record<string, unknown>).workflow_runs as unknown[]) || [];

        const runStats: RunStats[] = [];
        const allTestsByTitle: Record<string, { states: string[] }> = {};

        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run as Record<string, unknown>;
            try {
                const artResp = await client.get(`/repos/${repo}/actions/runs/${String(r.id)}/artifacts`);
                const artifacts: unknown[] = ((artResp.data as Record<string, unknown>).artifacts as unknown[]) || [];
                const ctrf = artifacts.find((a) => {
                    const name = (((a as Record<string, unknown>).name as string) || '').toLowerCase();
                    return name.includes('ctrf') || name.includes('test-results');
                });
                if (!ctrf) continue;

                const zipResp = await client.get(
                    `/repos/${repo}/actions/artifacts/${String((ctrf as Record<string, unknown>).id)}/zip`,
                    { responseType: 'arraybuffer' as const },
                );
                const zip = new AdmZip(Buffer.from(zipResp.data as ArrayBuffer));
                for (const entry of zip.getEntries()) {
                    if (!entry.name.endsWith('.json')) continue;
                    const parsed = JSON.parse(entry.getData().toString('utf8'));
                    const summary = parsed.results?.summary;
                    const tests = parsed.results?.tests || [];
                    if (summary) {
                        runStats.push({
                            runId: r.id as number,
                            createdAt: (r.created_at as string) || '',
                            passed: summary.passed || 0,
                            failed: summary.failed || 0,
                            skipped: summary.skipped || 0,
                            total: summary.tests || 0,
                            passRate: summary.tests > 0 ? (summary.passed / summary.tests) * 100 : 0,
                        });
                    }
                    for (const t of tests) {
                        const name = t.name as string;
                        if (!allTestsByTitle[name]) allTestsByTitle[name] = { states: [] };
                        allTestsByTitle[name].states.push(t.status as string);
                    }
                }
            } catch {
                // individual run failure — skip
            }
        }

        let commits = '';
        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run as Record<string, unknown>;
            const hc = r.head_commit as Record<string, unknown> | null;
            if (hc) {
                const msg = ((hc.message as string) || '').split('\n')[0];
                const author = ((hc.author as Record<string, unknown>)?.name as string) || 'unknown';
                const date = ((r.created_at as string) || '').slice(0, 10);
                commits += `- ${msg} (${author}, ${date})\n`;
            }
        }

        let flakyTests = '';
        for (const [testName, data] of Object.entries(allTestsByTitle)) {
            if (data.states.length >= 2) {
                const unique = new Set(data.states);
                if (unique.has('passed') && unique.has('failed')) {
                    flakyTests += `- ${testName}: ${data.states.join(', ')}\n`;
                }
            }
        }

        return { commits, runs: runStats, flakyTests };
    } catch {
        return { commits: '', runs: [], flakyTests: '' };
    }
}

async function _fetchGitLabHistory(): Promise<CiContext> {
    const token = process.env.CI_JOB_TOKEN as string;
    const projectId = process.env.CI_PROJECT_ID as string;
    const serverUrl = process.env.CI_SERVER_URL || 'https://gitlab.com';
    const client = createHttpClient({
        baseUrl: serverUrl + '/api/v4',
        authHeader: { 'PRIVATE-TOKEN': token },
    });

    try {
        const runsResp = await client.get(`/projects/${projectId}/pipelines?per_page=${GIT_HISTORY_RUNS}`);
        const runs: unknown[] = (runsResp.data as unknown[]) || [];

        const runStats: RunStats[] = [];

        for (const run of runs.slice(0, GIT_HISTORY_RUNS)) {
            const r = run as Record<string, unknown>;
            try {
                const jobsResp = await client.get(`/projects/${projectId}/pipelines/${String(r.id)}/jobs`);
                const jobs: unknown[] = (jobsResp.data as unknown[]) || [];
                const testJob = jobs.find((j) => {
                    const name = (((j as Record<string, unknown>).name as string) || '').toLowerCase();
                    return name.includes('test') || name.includes('e2e') || name.includes('ctrf');
                });
                if (!testJob) continue;

                const tj = testJob as Record<string, unknown>;
                const artResp = await client.get(`/projects/${projectId}/jobs/${String(tj.id)}/artifacts`, {
                    responseType: 'arraybuffer' as const,
                    maxRedirects: 5,
                });
                const zip = new AdmZip(Buffer.from(artResp.data as ArrayBuffer));
                for (const entry of zip.getEntries()) {
                    if (!entry.name.endsWith('.json')) continue;
                    const parsed = JSON.parse(entry.getData().toString('utf8'));
                    const summary = parsed.results?.summary;
                    if (summary) {
                        runStats.push({
                            runId: r.id as number,
                            createdAt: (r.created_at as string) || '',
                            passed: summary.passed || 0,
                            failed: summary.failed || 0,
                            skipped: summary.skipped || 0,
                            total: summary.tests || 0,
                            passRate: summary.tests > 0 ? (summary.passed / summary.tests) * 100 : 0,
                        });
                    }
                }
            } catch {
                // individual pipeline failure — skip
            }
        }

        return { commits: '', runs: runStats, flakyTests: '' };
    } catch {
        return { commits: '', runs: [], flakyTests: '' };
    }
}

function _buildGitTrendHtml(ci: CiContext): string {
    if (ci.runs.length === 0 && !ci.commits && !ci.flakyTests) return '';

    let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">📈 Git Pipeline Context</div>';

    if (ci.runs.length > 0) {
        html += '<div style="margin-bottom:8px">';
        html +=
            '<div style="font-size:0.8rem;color:#6b7280;margin-bottom:4px">Pass Rate — Last ' +
            ci.runs.length +
            ' Runs</div>';
        html += '<div style="display:flex;gap:4px;align-items:flex-end;height:50px;padding:4px 0">';
        for (const run of ci.runs) {
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
    }

    if (ci.flakyTests) {
        html +=
            '<details style="margin-bottom:6px;font-size:0.85rem">' +
            '<summary style="cursor:pointer;color:#8b5cf6;font-weight:600">⚠️ Flaky Tests</summary>' +
            '<pre style="margin:4px 0 0 8px;font-size:0.8rem;white-space:pre-wrap">' +
            ci.flakyTests.replace(/</g, '&lt;') +
            '</pre>' +
            '</details>';
    }

    if (ci.commits) {
        html +=
            '<details style="margin-bottom:4px;font-size:0.85rem">' +
            '<summary style="cursor:pointer;color:#6366f1;font-weight:600">📝 Recent Commits</summary>' +
            '<pre style="margin:4px 0 0 8px;font-size:0.8rem;white-space:pre-wrap">' +
            ci.commits.replace(/</g, '&lt;') +
            '</pre>' +
            '</details>';
    }

    html += '</div>';
    return html;
}

async function _fetchJiraContext(
    failedTests: FlatTest[],
    jiraResource: CommandContext['jiraResource'],
    projectName: string,
): Promise<string> {
    if (failedTests.length === 0 || !projectName) return '';

    const testNames = failedTests.slice(0, 10).map((t) => t.title.replace(/['"]/g, ''));
    const jql = `project=${projectName} AND issuetype=Bug AND (${testNames.map((t) => `summary~"${t}"`).join(' OR ')})`;
    try {
        const result = await jiraResource.getJiraResource('search?jql=' + encodeURIComponent(jql) + '&maxResults=5');
        const data = result as Record<string, unknown>;
        const issues = (data.issues as unknown[]) || [];
        if (issues.length === 0) return '';

        let s = '';
        for (const issue of issues.slice(0, 5)) {
            const i = issue as Record<string, unknown>;
            const key = (i.key as string) || '';
            const fields = (i.fields as Record<string, unknown>) || {};
            const summary = (fields.summary as string) || '';
            const status = ((fields.status as Record<string, unknown>)?.name as string) || '';
            s += `- ${key} (${status}): ${summary}\n`;
        }
        return s;
    } catch {
        return '';
    }
}

function _buildJiraContextHtml(jiraContext: string): string {
    if (!jiraContext) return '';
    let html = '<div class="chart-box" style="border-left:4px solid #0052cc;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">🔗 Related Jira Issues</div>';
    html +=
        '<pre style="margin:0;font-size:0.85rem;white-space:pre-wrap">' + jiraContext.replace(/</g, '&lt;') + '</pre>';
    html += '</div>';
    return html;
}

function injectAnalysisSection(html: string, analysis: string): string {
    const bodyEnd = html.lastIndexOf('</body>');
    if (bodyEnd === -1) return html;
    const section = `<div class="chart-box"><h2>Failure Analysis</h2><pre style="white-space:pre-wrap;font-size:0.85rem">${analysis.replace(/</g, '&lt;')}</pre></div>`;
    return html.slice(0, bodyEnd) + section + html.slice(bodyEnd);
}

async function _writeReportFile(html: string, projectName: string): Promise<string> {
    const defaultName = `report-${projectName}-${Date.now()}.html`;
    const outPath = await ask('Caminho de saída do HTML', { default: '' });
    if (outPath.trim()) {
        const resolvedPath = path.resolve(outPath.trim());
        fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
        fs.writeFileSync(resolvedPath, html, 'utf8');
        return resolvedPath;
    }
    return writeReport(defaultName, html);
}

async function _addAiAnalysis(html: string, tests: ParseResult['tests'], context?: LlmContext): Promise<string> {
    const analysis = await withSpinner('Analisando falhas com IA...', () => analyzeFailuresWithReport(tests, context));
    if (!analysis || !analysis.content) return html;
    return injectAnalysisSection(html, analysis.content);
}

function _saveMetricsJson(tests: FlatTest[], htmlDir: string): void {
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
                message: t.error,
                suite: t.fullTitle,
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

function _computeDiff(current: FlatTest[]): { newFailures: FlatTest[]; newPasses: FlatTest[]; flaky: FlatTest[] } {
    const lastPath = path.join(process.cwd(), CTRF_LAST_FILE);
    if (!fs.existsSync(lastPath)) {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
    try {
        const lastData = JSON.parse(fs.readFileSync(lastPath, 'utf8')) as CtrfData;
        const lastTests = lastData.results.tests || [];
        const lastByTitle = new Map(lastTests.map((t) => [t.name, t]));

        const newFailures: FlatTest[] = [];
        const newPasses: FlatTest[] = [];
        const flaky: FlatTest[] = [];

        for (const t of current) {
            const last = lastByTitle.get(t.title);
            if (!last) continue;
            if (t.state === 'failed' && last.status === 'passed') newFailures.push(t);
            if (t.state === 'passed' && last.status === 'failed') newPasses.push(t);
            if (last.status === 'failed') flaky.push(t);
        }

        return { newFailures, newPasses, flaky };
    } catch {
        return { newFailures: [], newPasses: [], flaky: [] };
    }
}

function _buildDiffSummary(diff: { newFailures: FlatTest[]; newPasses: FlatTest[]; flaky: FlatTest[] }): string {
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

async function _autoCreateJiraBugs(
    diffNewFailures: FlatTest[],
    jiraResource: CommandContext['jiraResource'],
    projectName: string,
): Promise<void> {
    if (diffNewFailures.length === 0) return;
    const cat = categorizeFailure(diffNewFailures[0]?.error || '');

    for (const failure of diffNewFailures) {
        const summary = `[QA Tools] New test failure: ${failure.title}`;
        const description =
            `h2. Test Failure Detected\n\n` +
            `*Test:* ${failure.title}\n` +
            `*Error:* {code}${failure.error || 'N/A'}{code}\n` +
            `*Category:* ${cat}\n` +
            `*Duration:* ${failure.duration}ms\n\n` +
            `h3. Failure Analysis\n\n` +
            `This failure was automatically detected by QA Tools during test execution. ` +
            `It was passing in the previous run and is now failing.\n\n` +
            `h3. Recommended Action\n\n` +
            `1. Investigate the error message above\n` +
            `2. Check recent code changes that may have affected this test\n` +
            `3. Fix the issue and re-run the test suite\n`;

        const payload = {
            fields: {
                project: { key: projectName },
                summary,
                description,
                issuetype: { name: 'Bug' },
            },
        };

        try {
            const result = await jiraResource.postJiraResource('issue', payload);
            const keyVal: unknown = result.key;
            info('Jira bug auto-criado: ' + (typeof keyVal === 'string' ? keyVal : ''));
        } catch (err) {
            printError('Erro ao criar bug no Jira para: ' + failure.title, err);
        }
    }
}

async function _postPrComment(stats: ParseResult['stats']): Promise<void> {
    const githubToken = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    const prNumber = process.env.GITHUB_PR_NUMBER || process.env.CI_PR_NUMBER;

    if (!githubToken || !repo || !prNumber) return;

    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
    const body =
        `### 🤖 QA Tools — Test Report\n\n` +
        `**${stats.passed} ✅ passed** | **${stats.failed} ❌ failed** | **${stats.skipped} ⏭ skipped** | **${stats.total} total**\n\n` +
        `**Pass rate:** ${passRate}%\n\n` +
        `[View full report](${process.env.CI_JOB_URL || ''})\n`;

    try {
        const client = createHttpClient({
            baseUrl: 'https://api.github.com',
            authHeader: { Authorization: 'Bearer ' + githubToken },
        });
        await client.post(`/repos/${repo}/issues/${prNumber}/comments`, { body });
        info('PR comment posted successfully');
    } catch (err) {
        printError('Erro ao postar comment no PR', err);
    }
}

const MAPPING_FILE_CANDIDATES = [process.env.QA_MAPPING_PATH || '', path.join(process.cwd(), 'mapping.json')];

function _resolveMapping(): Map<string, string> {
    for (const candidate of MAPPING_FILE_CANDIDATES) {
        if (!candidate || !fs.existsSync(candidate)) continue;
        try {
            const raw = fs.readFileSync(candidate, 'utf8');
            const data = JSON.parse(raw);
            const tests = (data.tests ?? []) as Array<Record<string, string>>;
            if (tests.length === 0) return new Map();
            const entries: Array<[string, string]> = [];
            for (const t of tests) {
                if (t.title && t.key) entries.push([t.title, t.key]);
            }
            return new Map(entries);
        } catch {
            // try next candidate
        }
    }
    return new Map();
}

async function _resolveTestHistory(
    tests: FlatTest[],
    c: CommandContext,
    cache: TestHistoryCache,
): Promise<Record<string, TestHistoryRun[]>> {
    const mapping = _resolveMapping();
    if (mapping.size === 0) return {};

    const provider = createHistoryProvider(c.jiraResource);

    const keys = tests.map((t) => mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '').filter(Boolean);
    if (keys.length === 0) return {};

    const uniqueKeys = [...new Set(keys)];
    const results = await Promise.allSettled(
        uniqueKeys.map(async (key) => {
            const cached = cache.get(key);
            if (cached) return { key, history: cached };
            const history = await provider.getHistory(key);
            cache.set(key, history);
            return { key, history };
        }),
    );

    const keyToHistory = new Map<string, TestHistoryRun[]>();
    for (const result of results) {
        if (result.status === 'fulfilled') {
            keyToHistory.set(result.value.key, result.value.history);
        }
    }

    const titleToHistory: Record<string, TestHistoryRun[]> = {};
    for (const t of tests) {
        const key = mapping.get(t.title) || mapping.get(t.fullTitle ?? '') || '';
        if (key && keyToHistory.has(key)) {
            titleToHistory[t.title] = keyToHistory.get(key)!;
        }
    }
    return titleToHistory;
}

/** Parse CLI args for `--publish` and `--run label=file.json`. */
function _parseCliExtra(): { publishTarget?: string; extraRuns: Array<{ name: string; file: string }> } {
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

async function handler(c: CommandContext): Promise<boolean | void> {
    const filePath = await ask('Caminho do arquivo de resultados JSON', {
        hint: 'ex: cypress/reports/ctrf-report.json',
    });
    if (!filePath.trim()) {
        printError('Relatório HTML', new Error('Caminho do arquivo vazio.'));
        return;
    }

    const cliExtra = _parseCliExtra();

    title('Analisando relatório...');
    const result = parseTestResultsFile(filePath.trim());
    if (result.error) {
        printError('Erro ao ler relatório', new Error(result.error));
        return;
    }

    const diff = _computeDiff(result.tests);

    const historyCache = new TestHistoryCache();
    const testHistory = await _resolveTestHistory(result.tests, c, historyCache);

    const knownIssues = loadKnownIssues(process.env.KNOWN_ISSUES_PATH || '');

    const runs: TestRunTab[] = [];
    for (const extra of cliExtra.extraRuns) {
        const r = parseTestResultsFile(extra.file);
        if (r.error) {
            printError('Erro ao ler run adicional: ' + extra.file, new Error(r.error));
            continue;
        }
        runs.push({ name: extra.name, tests: r.tests });
    }
    if (runs.length > 0) {
        runs.unshift({ name: 'Primary', tests: result.tests });
    }

    const qualityGateThreshold = parseFloat(process.env.QA_FAIL_ON || '');
    const genOptions: Record<string, unknown> = {
        title: `Relatório - ${c.ctx.project_name}`,
        generatedAt: new Date().toISOString(),
        source: 'Relatório HTML',
        testHistory: Object.keys(testHistory).length > 0 ? testHistory : undefined,
        knownIssues: knownIssues.length > 0 ? knownIssues : undefined,
        runs: runs.length > 0 ? runs : undefined,
    };
    if (!isNaN(qualityGateThreshold)) {
        genOptions.qualityGate = qualityGateThreshold;
    }

    let html = generateHtmlReport(result.tests, genOptions);

    const diffHtml = _buildDiffSummary(diff);
    if (diffHtml) {
        html = html.replace('</body>', diffHtml + '</body>');
    }

    const ciContext = await _fetchGitHistory();
    const gitHtml = _buildGitTrendHtml(ciContext);
    if (gitHtml) {
        html = html.replace('</body>', gitHtml + '</body>');
    }

    const failedTests = result.tests.filter((t) => t.state === 'failed');
    const jiraContext = await _fetchJiraContext(failedTests, c.jiraResource, c.ctx.project_name);
    const jiraHtml = _buildJiraContextHtml(jiraContext);
    if (jiraHtml) {
        html = html.replace('</body>', jiraHtml + '</body>');
    }

    const llmContext: LlmContext = {};
    if (ciContext.commits) llmContext.gitCommits = ciContext.commits;
    if (ciContext.runs.length > 0) {
        llmContext.gitTrend = ciContext.runs
            .map(
                (r) =>
                    `Run ${r.runId} (${(r.createdAt || '').slice(0, 10)}): ${r.passRate.toFixed(1)}% (${r.passed}/${r.total})`,
            )
            .join('\n');
    }
    if (jiraContext) llmContext.jiraIssues = jiraContext;

    if (result.stats.failed > 0 && (await askConfirm('Incluir análise das falhas (IA)?', true))) {
        html = await _addAiAnalysis(html, result.tests, llmContext);
    }

    const resolvedPath = await _writeReportFile(html, c.ctx.project_name);

    const htmlDir = path.dirname(resolvedPath);
    _saveMetricsJson(result.tests, htmlDir);

    info(`Relatório HTML gerado: ${resolvedPath}`);
    void openWithOsOrFallback(resolvedPath);
    c.pushHistory(
        'html-report',
        `${result.stats.total} testes (${result.stats.passed} pass, ${result.stats.failed} fail)`,
        'ok',
    );

    const publishTarget = cliExtra.publishTarget || process.env.QA_PUBLISH || '';
    if (publishTarget && (publishTarget === 's3' || publishTarget === 'gh-pages')) {
        info('Publicando relatório para ' + publishTarget + '...');
        publishReport({ target: publishTarget, filePath: resolvedPath });
    }

    if (process.env.QA_AUTO_BUG === 'true' && diff.newFailures.length > 0) {
        info('Criando bugs no Jira para novas falhas...');
        await _autoCreateJiraBugs(diff.newFailures, c.jiraResource, c.ctx.project_name);
    }

    if (diff.newFailures.length > 0 || diff.newPasses.length > 0) {
        info(`Diff: ${diff.newFailures.length} novas falhas, ${diff.newPasses.length} novos passes`);
    }

    await _postPrComment(result.stats);

    if (
        !isNaN(qualityGateThreshold) &&
        result.stats.total > 0 &&
        (result.stats.passed / result.stats.total) * 100 < qualityGateThreshold
    ) {
        printError('Quality Gate', new Error(`Pass rate below threshold (${qualityGateThreshold}%)`));
        return false;
    }

    if (
        result.stats.failed > 0 &&
        (await askConfirm('Deseja criar um relatório de bug (Bug Report) no Jira para as falhas?', false))
    ) {
        const automatedReport = collectAutomated(result);
        await interactiveBugReportFlow(c.jiraResource, c.ctx.project_name, automatedReport, c.linkManager);
    }
}

export default { handler };
