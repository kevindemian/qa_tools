// @ts-check
const { success, error, warn, info, title, divider, prompt, confirm, smartPrompt, printError, printSummary } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const useInMemory = confirm('Usar tarefas criadas anteriormente?', true);
    let taskIds = [];

    if (useInMemory) {
        if (c.ctx.inMemoryTasksId.length === 0) {
            warn('Nenhuma tarefa criada anteriormente. Insira manualmente.');
            const input = prompt('IDs das tarefas (separadas por espaco)');
            taskIds = input.split(' ').filter(Boolean);
        } else {
            c.ctx.inMemoryTasksId.forEach((id, idx) => {
                console.log('  ' + id + ' — ' + c.ctx.inMemoryTasksText[idx]);
                taskIds.push(id);
            });
        }
    } else {
        const input = prompt('IDs das tarefas (separadas por espaco)');
        taskIds = input.split(' ').filter(Boolean);
    }

    const version = smartPrompt('Nome da versão', {}, () => {});

    title('Preview da operação');
    console.log('  Versão: ' + version);
    console.log('  Tarefas (' + taskIds.length + '):');
    taskIds.forEach(id => console.log('    - ' + id));
    if (!confirm('Confirmar atribuicao de fixVersion?')) {
        warn('Operação cancelada.');
        return true;
    }

    c.ctx.results = [];
    await c.ctx.withBusy(async () => {
        for (const taskId of taskIds) {
            try {
                await c.jiraResource.updateFixVersions([taskId], c.ctx.project_name, version);
                c.ctx.results.push({ status: 'ok', label: taskId, message: '' });
            } catch (err) {
                c.ctx.results.push({ status: 'error', label: taskId, message: 'Falha ao atualizar fixVersion' });
            }
        }
    }, "Atribuindo fixVersion...");
    printSummary(
        /** @type {import('../../shared/types').TestResult[]} */ (c.ctx.results));
    c.ctx.lastOperation = c.ctx.results.filter(r => r.status === 'ok').length + '/' + taskIds.length + ' tarefas atualizadas';
    c.pushHistory('atribuir-fixversion', c.ctx.lastOperation,
        c.ctx.results.some(r => r.status === 'error') ? 'error' : 'ok');

    if (confirm('Adicionar tarefas a uma sprint?')) {
        const sprintId = prompt('ID da sprint', { hint: 'ex: 6991 (encontrado na URL do board)' });
        try {
            const moveResult = await c.jiraResource.axiosInstance.post(
                '/rest/api/2/sprint/' + sprintId + '/issue',
                { issues: taskIds }
            );
            success('Tarefas adicionadas a sprint ' + sprintId);
        } catch (err) {
            printError('Erro ao adicionar tarefas a sprint', err);
        }
    }
    return false;
}

module.exports = { handler };
