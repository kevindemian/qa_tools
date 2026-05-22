import { info, error, divider, printError } from '../../shared/prompt';
import { rootLogger } from '../../shared/logger';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<void> {
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
            results.forEach(v => {
                const released = v.released ? ' (RELEASED)' : '';
                const overdue = !v.released && v.releaseDate && new Date(v.releaseDate) < now ? ' (ATRASADA!)' : '';
                info(v.name + ' — ' + (v.description || 'sem descrição') + released + overdue);
            });
            c.pushHistory('listar-versoes', results.length + ' versão(oes)', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar versões', err);
        rootLogger.error('Erro ao listar versões', { project: c.ctx.project_name, status: (err as any).response?.status });
        c.pushHistory('listar-versoes', 'erro', 'error');
    }
}

export { handler };
module.exports = { handler };
