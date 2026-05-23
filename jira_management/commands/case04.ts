import {
    print,
    success,
    warn,
    title,
    prompt,
    confirm,
    smartPrompt,
    printError,
    printSummary,
} from '../../shared/prompt';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const useInMemory = confirm('Usar tarefas criadas anteriormente?', true);
    let taskIds: string[] = [];

    if (useInMemory) {
        if (c.ctx.inMemoryTasksId.length === 0) {
            warn('Nenhuma tarefa criada anteriormente. Insira manualmente.');
            const input = prompt('IDs das tarefas (separadas por espaco)');
            taskIds = input.split(' ').filter(Boolean);
        } else {
            c.ctx.inMemoryTasksId.forEach((id, idx) => {
                print('  ' + id + ' — ' + c.ctx.inMemoryTasksText[idx]);
                taskIds.push(id);
            });
        }
    } else {
        const input = prompt('IDs das tarefas (separadas por espaco)');
        taskIds = input.split(' ').filter(Boolean);
    }

    const version = smartPrompt('Nome da versão', {}, () => {});

    title('Preview da operação');
    print('  Versão: ' + version);
    print('  Tarefas (' + taskIds.length + '):');
    taskIds.forEach((id) => print('    - ' + id));
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
            } catch {
                c.ctx.results.push({ status: 'error', label: taskId, message: 'Falha ao atualizar fixVersion' });
            }
        }
    }, 'Atribuindo fixVersion...');
    printSummary(c.ctx.results);
    c.ctx.lastOperation =
        c.ctx.results.filter((r) => r.status === 'ok').length + '/' + taskIds.length + ' tarefas atualizadas';
    c.pushHistory(
        'atribuir-fixversion',
        c.ctx.lastOperation,
        c.ctx.results.some((r) => r.status === 'error') ? 'error' : 'ok',
    );

    if (confirm('Adicionar tarefas a uma sprint?')) {
        const sprintId = prompt('ID da sprint', { hint: 'ex: 6991 (encontrado na URL do board)' });
        try {
            await c.jiraResource.postJiraResource('sprint/' + sprintId + '/issue', { issues: taskIds });
            success('Tarefas adicionadas a sprint ' + sprintId);
        } catch (err: unknown) {
            printError('Erro ao adicionar tarefas a sprint', err);
        }
    }
    return false;
}

export { handler };
module.exports = { handler };
