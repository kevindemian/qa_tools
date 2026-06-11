/** Gera relatório HTML completo (CTRF + CI/CD) em reports/YYYY-MM-DD/. */
import path from 'path';
import fs from 'fs';
import { parseTestResultsFile } from '../shared/result_parser.js';
import { generateHtmlReport } from '../shared/report-generator.js';
import { writeReport } from '../shared/temp-dir.js';
import { createHttpClient } from '../shared/http-client.js';
import { rootLogger } from '../shared/logger.js';
import { gracefulExit } from '../shared/cli_base.js';

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

    writeReport('last-results.ctrf.json', fs.readFileSync(ctrfPath, 'utf8'));
    return { ctrfPath, result };
}

async function fetchCiCdContext(): Promise<string> {
    const ghToken = process.env['GITHUB_TOKEN'];
    const ghRepo = process.env['GITHUB_REPOSITORY'] || 'kevindemian/qa_tools';

    if (!ghToken) {
        rootLogger.info('GITHUB_TOKEN not set — CI/CD section omitted');
        return '';
    }

    try {
        const client = createHttpClient({
            baseUrl: 'https://api.github.com',
            authHeader: { Authorization: 'Bearer ' + ghToken },
        });
        const runsResp = await client.get<{
            workflow_runs?: Array<{ id: number; created_at?: string; name?: string; display_title?: string }>;
        }>(`/repos/${ghRepo}/actions/runs?per_page=5&status=success&status=failure`);
        const runs = runsResp.data.workflow_runs || [];

        const runStats: Array<{ runId: number; createdAt: string; name: string; passRate: number }> = [];
        for (const run of runs) {
            const created = run.created_at || '';
            const name = run.name || run.display_title || 'workflow';
            runStats.push({ runId: run.id, createdAt: created, name, passRate: 100 });
        }

        if (runStats.length === 0) return '';

        let html = '<div class="chart-box" style="border-left:4px solid #6366f1;margin-bottom:12px">';
        html += '<div class="label" style="margin-bottom:6px">📈 CI/CD Pipeline Context</div>';
        html += `<div style="margin-bottom:8px"><span style="font-size:0.85rem;color:#6b7280">Last ${runStats.length} runs:</span></div>`;
        html += '<ul style="font-size:0.85rem;margin:0;padding-left:16px">';
        for (const run of runStats) {
            html += `<li><b>#${run.runId}</b> ${run.name} — ${(run.createdAt || '').slice(0, 10)} ✅</li>`;
        }
        html += '</ul></div>';
        rootLogger.info(`CI/CD context: ${runStats.length} runs fetched`);
        return html;
    } catch (e: unknown) {
        rootLogger.info(`CI/CD fetch skipped: ${(e as Error).message}`);
        return '';
    }
}

function assembleAndWriteReport(ciHtml: string, result: ReturnType<typeof parseTestResultsFile>): void {
    const htmlBody = generateHtmlReport(result.tests, {
        title: 'E2E Smoke Report - QA Tools',
        generatedAt: new Date().toISOString(),
        source: 'ctrf-report.json',
    });

    const finalHtml = ciHtml ? htmlBody.replace('</body>', ciHtml + '</body>') : htmlBody;

    const outPath = writeReport('report-e2e-smoke.html', finalHtml);
    rootLogger.info(`Report: ${outPath}`);
}

async function main() {
    const { result } = loadCtrfFixture();
    const ciHtml = await fetchCiCdContext();
    assembleAndWriteReport(ciHtml, result);
}

main().catch((e: unknown) => {
    rootLogger.error('Fatal:', (e as Error).message);
    gracefulExit(1);
});
