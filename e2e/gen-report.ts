/** Gera relatório HTML completo (CTRF + CI/CD) em reports/YYYY-MM-DD/. */
import path from 'path';
import fs from 'fs';
import { parseTestResultsFile } from '../shared/result_parser';
import { generateHtmlReport } from '../shared/report-generator';
import { writeReport } from '../shared/temp-dir';
import { createHttpClient } from '../shared/http-client';

function loadCtrfFixture(): { ctrfPath: string; result: ReturnType<typeof parseTestResultsFile> } {
    const ctrfArg = process.argv.find((a) => a.startsWith('--ctrf='));
    const ctrfPath = ctrfArg
        ? path.resolve(ctrfArg.split('=')[1]!)
        : path.resolve(__dirname, 'fixtures/ctrf-report.json');
    const result = parseTestResultsFile(ctrfPath);

    if (result.error) {
        console.error('Parse error:', result.error);
        process.exit(1);
    }

    writeReport('last-results.ctrf.json', fs.readFileSync(ctrfPath, 'utf8'));
    return { ctrfPath, result };
}

async function fetchCiCdContext(): Promise<string> {
    const ghToken = process.env.GITHUB_TOKEN;
    const ghRepo = process.env.GITHUB_REPOSITORY || 'kevindemian/qa_tools';

    if (!ghToken) {
        console.log('GITHUB_TOKEN not set — CI/CD section omitted');
        return '';
    }

    try {
        const client = createHttpClient({
            baseUrl: 'https://api.github.com',
            authHeader: { Authorization: 'Bearer ' + ghToken },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API response shape
        const runsResp = await client.get<any>(
            `/repos/${ghRepo}/actions/runs?per_page=5&status=success&status=failure`,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API response shape
        const runs: any[] = runsResp.data?.workflow_runs || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GitHub API response shape
        const runStats: Array<{ runId: any; createdAt: string; name: string; passRate: number }> = [];
        for (const run of runs) {
            const created = (run.created_at as string) || '';
            const name = (run.name as string) || (run.display_title as string) || 'workflow';
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
        console.log(`CI/CD context: ${runStats.length} runs fetched`);
        return html;
    } catch (e: unknown) {
        console.log(`CI/CD fetch skipped: ${(e as Error).message}`);
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
    console.log(`Report: ${outPath}`);
}

async function main() {
    const { result } = loadCtrfFixture();
    const ciHtml = await fetchCiCdContext();
    assembleAndWriteReport(ciHtml, result);
}

main().catch((e: unknown) => {
    console.error('Fatal:', (e as Error).message);
    process.exit(1);
});
