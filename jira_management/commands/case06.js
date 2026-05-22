// @ts-check
const { success, error, warn, info, prompt, smartPrompt, printError } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const version = smartPrompt('Nome da versão', {}, () => {});
    try {
        await c.jiraResource.checkReleaseTasksStatus(c.ctx.project_name, version);
        c.pushHistory('verificar-status', version, 'ok');
    } catch (err) {
        const msg = 'Erro ao verificar status da versão "' + version + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, { version, project: c.ctx.project_name, status: err.response?.status });
        c.pushHistory('verificar-status', version, 'error');
    }
}

module.exports = { handler };
