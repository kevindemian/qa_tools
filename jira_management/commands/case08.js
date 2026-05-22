// @ts-check
const { success, error, warn, info, prompt, confirm, smartPrompt, printError, printSummary } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const version = smartPrompt('Versão a publicar', {}, () => {});
    if (!confirm('Publicar versão ' + version + '? Isso marcara a versão como released.')) {
        warn('Operação cancelada.');
        return true;
    }
    try {
        await c.jiraResource.releaseVersion(c.ctx.project_name, version);
        printSummary(
            /** @type {import('../../shared/types').TestResult[]} */ ([{ status: 'ok', label: 'Versão ' + version, message: 'Publicada com sucesso' }]));
        c.ctx.lastOperation = 'Versão ' + version + ' publicada';
        c.pushHistory('publicar-versão', version, 'ok');
    } catch (err) {
        printError('Erro ao publicar versão', err);
        c.pushHistory('publicar-versão', 'erro', 'error');
    }
    return false;
}

module.exports = { handler };
