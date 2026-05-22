// @ts-check
const { success, error, warn, info, prompt, smartPrompt, printError } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const name = prompt('Nome da nova versão');
    if (!name.trim()) {
        warn('Nome da versão não pode ser vazio.');
        return;
    }
    const desc = prompt('Descrição da versão (opcional)');
    try {
        await c.jiraResource.createVersion(c.ctx.project_name, name, desc);
        c.pushHistory('criar-versão', name, 'ok');
    } catch (err) {
        const msg = 'Erro ao criar versão "' + name + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, { version: name, project: c.ctx.project_name, status: err.response?.status });
        c.pushHistory('criar-versão', name, 'error');
    }
}

module.exports = { handler };
