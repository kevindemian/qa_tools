/** Gera relatório HTML completo: CTRF + CI/CD + Xray History.
 *  mapping.json liga títulos CTRF → Jira keys para history. */
import path from 'path';
import fs from 'fs';
import { parseTestResultsFile } from '../shared/result_parser.js';
import { generateHtmlReport } from '../shared/report-generator.js';
import { writeReport } from '../shared/temp-dir.js';
import { createHttpClient } from '../shared/http-client.js';
import JiraResource from '../jira_management/jira_resource.js';
import { rootLogger } from '../shared/logger.js';
import { gracefulExit } from '../shared/cli_base.js';

const JIRA_BASE = process.env['JIRA_BASE_URL'] || 'https://jiraprod.srv.euronext.com';
const TOKEN = process.env['JIRA_PERSONAL_TOKEN'] || '';

function loadCtrfFixture(): { ctrfPath: string; result: ReturnType<typeof parseTestResultsFile> } {
    const ctrfArg = process.argv.find((a) => a.startsWith('--ctrf='));
    const ctrfPath = ctrfArg
        ? path.resolve(ctrfArg.split('=')[1] ?? '')
        : path.resolve(import.meta.dirname, 'fixtures/ctrf-report.json');
    const result = parseTestResultsFile(ctrfPath);
    if (result.error) {
        rootLogger.error('Parse error:', result.error);
        gracefulExit(1);
    }
    writeReport('last-results.ctrf.json', fs.readFileSync(path.resolve(ctrfPath), 'utf8'));
    return { ctrfPath, result };
}

function setupMappingFile(): void {
    const mappingArg = process.argv.find((a) => a.startsWith('--mapping='));
    if (mappingArg) {
        const mappingPath = path.resolve(mappingArg.split('=')[1] ?? '');
        const raw = JSON.parse(fs.readFileSync(path.resolve(mappingPath), 'utf8')) as {
            tests?: Array<{ title: string; key: string }>;
        };
        const mappingCopy = writeReport('mapping.json', JSON.stringify(raw, null, 2));
        process.env['QA_MAPPING_PATH'] = mappingCopy;
        rootLogger.info(`Mapping loaded: ${mappingPath}`);
    } else {
        const mapping = {
            tests: [
                { title: 'TC01 - Login valido', key: 'ECSPOL-1255' },
                { title: 'TC02 - Login invalido', key: 'ECSPOL-1295' },
            ],
        };
        const mappingPath = writeReport('mapping.json', JSON.stringify(mapping, null, 2));
        process.env['QA_MAPPING_PATH'] = mappingPath;
        rootLogger.info(`Mapping (default): ${mappingPath}`);
    }
}

function formatRunStatus(r: { [key: string]: unknown }): string {
    const status = (r['status'] as string) || 'TODO';
    let color: string;
    if (status === 'PASS') {
        color = '#22c55e';
    } else if (status === 'FAIL') {
        color = '#ef4444';
    } else {
        color = '#6b7280';
    }
    let html = `<li>${(r['testExecKey'] as string) || '?'} — <span style="color:${color};font-weight:600">${status}</span>`;
    if (r['finishedOn']) html += ` (${(r['finishedOn'] as string).slice(0, 10)})`;
    html += '</li>';
    return html;
}

function formatRunRuns(runs: unknown[]): string {
    if (runs.length === 0) return '';
    let html = '<ul style="font-size:0.85rem;margin:4px 0 0 16px">';
    for (const run of runs) {
        html += formatRunStatus(run as { [key: string]: unknown });
    }
    html += '</ul>';
    return html;
}

function buildXrayHistoryHtml(historyRows: Array<{ key: string; runs: unknown[] }>): string {
    let html = '<div class="chart-box" style="border-left:4px solid #0052cc;margin-bottom:12px">';
    html += '<div class="label" style="margin-bottom:6px">📋 Xray Test History</div>';
    for (const h of historyRows) {
        html += `<div style="margin-bottom:8px"><b>${h.key}</b> — ${h.runs.length} run(s)`;
        html += formatRunRuns(h.runs);
        html += '</div>';
    }
    html += '</div>';
    const historySummary = historyRows.map((h) => `${h.key}=${h.runs.length}`).join(', ');
    rootLogger.info(`Xray history: ${historySummary}`);
    return html;
}

async function fetchXrayHistory(): Promise<string> {
    const jiraRoot = new JiraResource(TOKEN, JIRA_BASE);
    try {
        const { createHistoryProvider, TestHistoryCache } = await import('../jira_management/xray-history.js');
        const provider = createHistoryProvider(jiraRoot, 'server');
        const cache = new TestHistoryCache();

        const keys = ['ECSPOL-1255', 'ECSPOL-1295'];
        const historyRows: Array<{ key: string; runs: unknown[] }> = [];

        for (const key of keys) {
            const cached = cache.get(key);
            const runs = cached ?? (await provider.getHistory(key));
            cache.set(key, runs);
            historyRows.push({ key, runs });
        }

        if (historyRows.some((h) => h.runs.length > 0)) {
            return buildXrayHistoryHtml(historyRows);
        }
    } catch (e: unknown) {
        rootLogger.info(`Xray history skipped: ${(e as Error).message}`);
    }
    return '';
}

async function fetchCiCdContext(): Promise<string> {
    const ghToken = process.env['GITHUB_TOKEN'];
    const ghRepo = process.env['GITHUB_REPOSITORY'] || 'kevindemian/qa_tools';

    if (!ghToken) return '';

    try {
        const client = createHttpClient({
            baseUrl: 'https://api.github.com',
            authHeader: { Authorization: 'Bearer ' + ghToken },
        });
        const runsResp = await client.get<{
            workflow_runs?: Array<{ id: number; created_at?: string; name?: string; display_title?: string }>;
        }>(`/repos/${ghRepo}/actions/runs?per_page=5&status=success&status=failure`);
        const runs = runsResp.data.workflow_runs || [];

        const runStats: Array<{ runId: number; createdAt: string; name: string }> = runs.map((run) => ({
            runId: run.id,
            createdAt: run.created_at || '',
            name: run.name || run.display_title || 'workflow',
        }));

        if (runStats.length === 0) return '';

        let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
        html += '<div class="label" style="margin-bottom:6px">📈 CI/CD Pipeline Context</div>';
        html += `<div style="margin-bottom:8px"><span style="font-size:0.85rem;color:#6b7280">Last ${runStats.length} runs:</span></div>`;
        html += '<ul style="font-size:0.85rem;margin:0;padding-left:16px">';
        for (const run of runStats) {
            html += `<li><b>#${run.runId}</b> ${run.name} — ${(run.createdAt || '').slice(0, 10)} ✅</li>`;
        }
        html += '</ul></div>';
        rootLogger.info(`CI/CD context: ${String(runStats.length)} runs`);
        return html;
    } catch (e: unknown) {
        rootLogger.info(`CI/CD fetch: ${(e as Error).message}`);
        return '';
    }
}

function generateFinalReport(
    ciHtml: string,
    xrayHistoryHtml: string,
    result: ReturnType<typeof parseTestResultsFile>,
): void {
    const sections = [ciHtml, xrayHistoryHtml].filter(Boolean).join('\n');
    const htmlBody = generateHtmlReport(result.tests, {
        title: 'E2E Complete Report - QA Tools',
        generatedAt: new Date().toISOString(),
        source: 'ctrf-report.json',
    });
    const finalHtml = sections ? htmlBody.replace('</body>', sections + '</body>') : htmlBody;

    const outPath = writeReport('report-e2e-complete.html', finalHtml);
    rootLogger.info(`\nReport: ${outPath}`);
}

export async function main() {
    const { result } = loadCtrfFixture();
    setupMappingFile();
    const xrayHistoryHtml = await fetchXrayHistory();
    const ciHtml = await fetchCiCdContext();
    generateFinalReport(ciHtml, xrayHistoryHtml, result);
}

main().catch((e: unknown) => {
    rootLogger.error('Fatal:', (e as Error).message);
    gracefulExit(1);
});
