/** Gera relatório HTML completo: CTRF + CI/CD + Xray History.
 *  mapping.json liga títulos CTRF → Jira keys para history. */
import path from 'path';
import fs from 'fs';
import { parseTestResultsFile } from '../shared/result_parser';
import { generateHtmlReport } from '../shared/report-generator';
import { writeReport } from '../shared/temp-dir';
import { createHttpClient } from '../shared/http-client';
import JiraResource from '../jira_management/jira_resource';

const JIRA_BASE = process.env.JIRA_BASE_URL || 'https://jiraprod.srv.euronext.com';
const TOKEN = process.env.JIRA_PERSONAL_TOKEN || '';
// XRAY_BASE_URL used by JiraResource below

async function main() {
    const ctrfPath = path.resolve(__dirname, 'fixtures/ctrf-report.json');
    const result = parseTestResultsFile(ctrfPath);
    if (result.error) {
        console.error('Parse error:', result.error);
        process.exit(1);
    }

    // ── 1. Mapping file: CTRF titles → Jira issue keys ──
    const mapping = {
        tests: [
            { title: 'TC01 - Login valido', key: 'ECSPOL-1255' },
            { title: 'TC02 - Login invalido', key: 'ECSPOL-1295' },
        ],
    };
    const mappingPath = writeReport('mapping.json', JSON.stringify(mapping, null, 2));
    process.env.QA_MAPPING_PATH = mappingPath;
    console.log(`Mapping: ${mappingPath}`);

    // ── 2. Baseline CTRF for diff comparison ──
    writeReport('last-results.ctrf.json', fs.readFileSync(ctrfPath, 'utf8'));

    // ── 3. Xray History via ServerHistoryProvider ──
    // Usa JiraResource apontado para raiz do Jira (sem /rest/api/2)
    const jiraRoot = new JiraResource(TOKEN, JIRA_BASE);
    let xrayHistoryHtml = '';

    // ServerHistoryProvider internamente usa:
    //   getJiraResource('rest/raven/1.0/api/test/{key}/testruns')
    // Com baseURL = JIRA_BASE (raiz), a URL final fica:
    //   JIRA_BASE + / + rest/raven/1.0/... ✅ (sem duplo /rest/)
    // Isto contorna o bug de path duplicado em xray-history.ts:77

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
            let html = '<div class="chart-box" style="border-left:4px solid #0052cc;margin-bottom:12px">';
            html += '<div class="label" style="margin-bottom:6px">📋 Xray Test History</div>';
            for (const h of historyRows) {
                html += `<div style="margin-bottom:8px"><b>${h.key}</b> — ${h.runs.length} run(s)`;
                if (h.runs.length > 0) {
                    html += '<ul style="font-size:0.85rem;margin:4px 0 0 16px">';
                    for (const run of h.runs) {
                        const status = run.status || 'TODO';
                        const color = status === 'PASS' ? '#22c55e' : status === 'FAIL' ? '#ef4444' : '#6b7280';
                        html += `<li>${run.testExecKey || '?'} — <span style="color:${color};font-weight:600">${status}</span>`;
                        if (run.finishedOn) html += ` (${String(run.finishedOn).slice(0, 10)})`;
                        html += '</li>';
                    }
                    html += '</ul>';
                }
                html += '</div>';
            }
            html += '</div>';
            xrayHistoryHtml = html;
            console.log(`Xray history: ${historyRows.map((h) => `${h.key}=${h.runs.length}`).join(', ')}`);
        }
    } catch (e: unknown) {
        console.log(`Xray history skipped: ${e.message}`);
    }

    // ── 4. CI/CD context from GitHub ──
    let ciHtml = '';
    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPOSITORY || 'kevindemian/qa_tools';

    if (ghToken) {
        try {
            const client = createHttpClient({
                baseUrl: 'https://api.github.com',
                authHeader: { Authorization: 'Bearer ' + ghToken },
            });
            const runsResp = await client.get(`/repos/${ghRepo}/actions/runs?per_page=5&status=success&status=failure`);
            const runs: unknown[] = ((runsResp.data as unknown).workflow_runs as unknown[]) || [];

            const runStats: unknown[] = runs.map((run: unknown) => ({
                runId: run.id,
                createdAt: run.created_at || '',
                name: run.name || run.display_title || 'workflow',
            }));

            if (runStats.length > 0) {
                let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
                html += '<div class="label" style="margin-bottom:6px">📈 CI/CD Pipeline Context</div>';
                html += `<div style="margin-bottom:8px"><span style="font-size:0.85rem;color:#6b7280">Last ${runStats.length} runs:</span></div>`;
                html += '<ul style="font-size:0.85rem;margin:0;padding-left:16px">';
                for (const run of runStats) {
                    html += `<li><b>#${run.runId}</b> ${run.name} — ${(run.createdAt || '').slice(0, 10)} ✅</li>`;
                }
                html += '</ul></div>';
                ciHtml = html;
                console.log(`CI/CD context: ${runStats.length} runs`);
            }
        } catch (e: unknown) {
            console.log(`CI/CD fetch: ${e.message}`);
        }
    }

    // ── 5. Generate final HTML ──
    const sections = [ciHtml, xrayHistoryHtml].filter(Boolean).join('\n');
    const htmlBody = generateHtmlReport(result.tests, {
        title: 'E2E Complete Report - QA Tools',
        generatedAt: new Date().toISOString(),
        source: 'ctrf-report.json',
    });
    const finalHtml = sections ? htmlBody.replace('</body>', sections + '</body>') : htmlBody;

    const outPath = writeReport('report-e2e-complete.html', finalHtml);
    console.log(`\nReport: ${outPath}`);
}

main().catch((e) => {
    console.error('Fatal:', e.message);
    process.exit(1);
});
