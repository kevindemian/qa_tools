// @ts-check
const { success, error, warn, info, title, divider, prompt, confirm, smartPrompt, printError, printSummary } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const version = smartPrompt('Versão a fechar', {}, () => {});
    if (!confirm('Fechar todas as tarefas da versão ' + version + '? Esta operação nao pode ser desfeita.')) {
        warn('Operação cancelada.');
        return true;
    }
    const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version);
    if (!Array.isArray(tasks) || tasks.length === 0) {
        warn('Nenhuma tarefa encontrada para esta versão.');
        return true;
    }
    const taskIds = tasks
        .map(task => task.match(/\[([A-Z][A-Z0-9]+-\d+)\]/)?.[1])
        .filter(id => id !== undefined);
    if (taskIds.length === 0) {
        warn('Nenhuma tarefa encontrada.');
        return true;
    }
    await c.ctx.withBusy(async () => {
        try {
            await c.jiraResource.moveCardsToDone(taskIds);
            const summary = taskIds.map(id => ({ status: 'ok', label: id, message: '' }));
            printSummary(
                /** @type {import('../../shared/types').TestResult[]} */ (summary));
            c.pushHistory('fechar-tarefas', taskIds.length + ' tarefa(s)', 'ok');
        } catch (err) {
            const summary = taskIds.map(id => ({ status: 'error', label: id, message: 'Falha ao fechar tarefa' }));
            printSummary(
                /** @type {import('../../shared/types').TestResult[]} */ (summary));
            c.pushHistory('fechar-tarefas', 'erro', 'error');
        }
        c.ctx.lastOperation = taskIds.length + ' tarefa(s) fechadas';
    }, "Fechando " + taskIds.length + " tarefa(s)...");
    return false;
}

module.exports = { handler };
