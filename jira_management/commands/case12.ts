/** Diagnose Jira/Xray connection by probing key endpoints, plus local health readiness. */
import { title, printSummary, divider, badge, tableView } from '../../shared/prompt.js';
import { sanitizeUrl } from '../../shared/cli_base.js';
import { rootLogger } from '../../shared/logger.js';
import { palette } from '../../shared/palette.js';
import { defaultOutput } from '../../shared/output.js';
import { loadMetrics } from '../../shared/metrics.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('12 · Diagnosticar Conexão');
    const diagResults: Array<{ status: string; label: string; message: string }> = [];
    const endpoints = [
        { url: sanitizeUrl(c.base_url + '/rest/api/2/myself'), label: 'Jira API' },
        { url: sanitizeUrl(c.base_url), label: 'Xray API' },
        {
            url: sanitizeUrl(c.base_url + '/rest/api/2/project/' + c.ctx.project_name),
            label: 'Projeto ' + c.ctx.project_name,
        },
    ];
    for (const ep of endpoints) {
        diagResults.push(await _runSingleDiagnostic(ep, c.jiraResource.axiosInstance));
    }

    const { healthReady, healthMsg } = _checkHealthScore(c.ctx.project_name);
    diagResults.push({
        status: healthReady ? 'ok' : 'warn',
        label: 'Health Score',
        message: healthMsg,
    });

    const tableData = diagResults.map((r) => ({
        Endpoint: r.label,
        Status: r.status === 'ok' ? '🟢 ' + r.message : r.status === 'warn' ? '🟡 ' + r.message : '🔴 ' + r.message,
        Time: r.message,
    }));
    tableView(tableData, ['Endpoint', 'Status', 'Time'], 'Status');

    const okCount = diagResults.filter((r) => r.status === 'ok').length;
    const errCount = diagResults.filter((r) => r.status === 'error').length;
    defaultOutput.print('  ' + badge(okCount, 'ok', 'ok') + '  ' + badge(errCount, 'error', 'error'));

    _printDiagnosticTips(diagResults, healthReady);

    divider();
    printSummary(
        diagResults.map((r) => ({ status: r.status === 'ok' ? 'ok' : 'error', label: r.label, message: r.message })),
    );
    c.pushHistory(
        'diagnostico',
        diagResults.filter((r) => r.status === 'ok').length + '/' + diagResults.length + ' ok',
        diagResults.some((r) => r.status === 'error') ? 'error' : 'ok',
    );
}

async function _runSingleDiagnostic(
    ep: { url: string; label: string },
    axiosInstance: { get: (url: string) => Promise<unknown> },
): Promise<{ status: string; label: string; message: string }> {
    const start = Date.now();
    try {
        await axiosInstance.get(ep.url);
        const ms = Date.now() - start;
        return { status: 'ok', label: ep.label, message: ms + 'ms' };
    } catch (err) {
        rootLogger.error('Falha ao diagnosticar ' + ep.label + ': ' + (err as Error).message);
        const ms = Date.now() - start;
        const st = (err as { response?: { status?: number } }).response?.status || 'ERR';
        const detail = st === 401 || st === 403 ? 'token pode estar inválido' : 'falha na conexão';
        return { status: 'error', label: ep.label, message: st + ' ' + ms + 'ms - ' + detail };
    }
}

function _checkHealthScore(projectName: string): { healthReady: boolean; healthMsg: string } {
    const store = loadMetrics();
    const projectRuns = store.runs.filter((r) => r.project === projectName);
    const coverageCount = store.coverageHistory?.length || 0;
    const healthReady = projectRuns.length >= 10 && coverageCount > 0;
    let healthMsg = healthReady ? 'pronto' : 'insuficiente';
    if (!healthReady) {
        const missing: string[] = [];
        if (projectRuns.length < 10) missing.push(projectRuns.length + '/' + 10 + ' runs');
        if (coverageCount === 0) missing.push('sem snapshots de cobertura');
        healthMsg += ' (' + missing.join(', ') + ')';
    }
    return { healthReady, healthMsg };
}

function _printDiagnosticTips(
    diagResults: Array<{ status: string; label: string; message: string }>,
    healthReady: boolean,
): void {
    for (const r of diagResults) {
        if (r.status === 'error') {
            defaultOutput.print(palette.red('  ✖ ' + r.label + ': ' + r.message));
            defaultOutput.print(palette.blue('    → Check JIRA_BASE_URL e JIRA_TOKEN no .env'));
        }
    }
    if (!healthReady) {
        defaultOutput.print(
            palette.yellow('  ⚡ Dica: rode pipelines para acumular métricas e gere cobertura (opção 19).'),
        );
    }
}

export default { handler };
