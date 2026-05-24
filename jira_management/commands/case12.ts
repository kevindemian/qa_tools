import { title, printSummary, divider, badge, tableView } from '../../shared/prompt';
import { sanitizeUrl } from '../../shared/cli_base';
import { palette } from '../../shared/palette';
import { defaultOutput } from '../../shared/output';
import type { CommandContext } from './context';
import type { TestResult } from '../../shared/types';

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
        const start = Date.now();
        try {
            await c.jiraResource.axiosInstance.get(ep.url);
            const ms = Date.now() - start;
            diagResults.push({ status: 'ok', label: ep.label, message: ms + 'ms' });
        } catch (err) {
            const ms = Date.now() - start;
            const st = (err as { response?: { status?: number } }).response?.status || 'ERR';
            const detail = st === 401 || st === 403 ? 'token pode estar inválido' : 'falha na conexão';
            diagResults.push({ status: 'error', label: ep.label, message: st + ' ' + ms + 'ms - ' + detail });
        }
    }

    const tableData = diagResults.map((r) => ({
        Endpoint: r.label,
        Status: r.status === 'ok' ? '🟢 ' + r.message : '🔴 ' + r.message,
        Time: r.message,
    }));
    tableView(tableData, ['Endpoint', 'Status', 'Time'], 'Status');

    const okCount = diagResults.filter((r) => r.status === 'ok').length;
    const errCount = diagResults.filter((r) => r.status === 'error').length;
    defaultOutput.print('  ' + badge(okCount, 'ok', 'ok') + '  ' + badge(errCount, 'error', 'error'));

    for (const r of diagResults) {
        if (r.status === 'error') {
            defaultOutput.print(palette.red('  ✖ ' + r.label + ': ' + r.message));
            defaultOutput.print(palette.blue('    → Check JIRA_BASE_URL e JIRA_TOKEN no .env'));
        }
    }

    divider();
    printSummary(diagResults as TestResult[]);
    c.pushHistory(
        'diagnostico',
        diagResults.filter((r) => r.status === 'ok').length + '/' + diagResults.length + ' ok',
        diagResults.some((r) => r.status === 'error') ? 'error' : 'ok',
    );
}

export = { handler };
