/** View project versions from Jira. */
import { info, error, divider, printError } from '../../shared/prompt.js';
import { rootLogger } from '../../shared/logger.js';
import type { CommandContext } from './context.js';

function getErrorStatus(err: unknown): number | undefined {
    if (err != null && typeof err === 'object' && 'response' in err) {
        const resp = err.response;
        if (resp != null && typeof resp === 'object' && 'status' in resp) {
            const st = resp.status;
            if (typeof st === 'number') return st;
        }
    }
    return undefined;
}

async function handler(c: CommandContext): Promise<boolean | void> {
    try {
        const projectId = await c.jiraResource.getProjectId(c.ctx.project_name);
        if (!projectId) {
            error('Projeto não encontrado: ' + c.ctx.project_name);
            return;
        }
        const results = await c.jiraResource.getProjectVersions(projectId);
        if (!Array.isArray(results) || results.length === 0) {
            info('Nenhuma versão encontrada para esse projeto.');
        } else {
            const now = new Date();
            divider();
            results.forEach((v) => {
                const released = v.released ? ' (RELEASED)' : '';
                const overdue = !v.released && v.releaseDate && new Date(v.releaseDate) < now ? ' (ATRASADA!)' : '';
                info(v.name + ' — ' + (v.description || 'sem descrição') + released + overdue);
            });
            c.pushHistory('listar-versoes', results.length + ' versão(oes)', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar versões', err);
        rootLogger.error('Erro ao listar versões', {
            project: c.ctx.project_name,
            status: getErrorStatus(err),
        });
        c.pushHistory('listar-versoes', 'erro', 'error');
    }
}

export default { handler };
