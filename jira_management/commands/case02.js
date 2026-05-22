// @ts-check
const { info, error, divider, printError } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    try {
        const projectId = await c.jiraResource.getProjectId(c.ctx.project_name);
        if (!projectId) {
            error('Projeto nao encontrado: ' + c.ctx.project_name);
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
        rootLogger.error('Erro ao listar versões', { project: c.ctx.project_name, status: err.response?.status });
        c.pushHistory('listar-versoes', 'erro', 'error');
    }
}

module.exports = { handler };
