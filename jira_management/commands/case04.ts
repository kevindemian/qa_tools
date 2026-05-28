/** Add tasks to sprint — assign issue keys to the current active sprint. */
import { print, success, warn, title, ask, askConfirm, printError, printSummary } from '../../shared/prompt';
import type { CommandContext } from './context';
import { OPERATION_CANCELLED, ERR_ADD_TASKS_TO_SPRINT } from '../constants';

async function handler(c: CommandContext): Promise<boolean | void> {
    const useInMemory = await askConfirm('Usar tarefas criadas anteriormente?', true);
    let taskIds: string[] = [];

    if (useInMemory) {
        if (c.ctx.inMemoryTasksId.length === 0) {
            warn('Nenhuma tarefa criada anteriormente. Insira manualmente.');
            const input = await ask('IDs das tarefas (separadas por espaco)');
            taskIds = input.split(' ').filter(Boolean);
        } else {
            c.ctx.inMemoryTasksId.forEach((id, idx) => {
                print('  ' + id + ' — ' + c.ctx.inMemoryTasksText[idx]);
                taskIds.push(id);
            });
        }
    } else {
        const input = await ask('IDs das tarefas (separadas por espaco)');
        taskIds = input.split(' ').filter(Boolean);
    }

    const version = await ask('Nome da versão', {});

    title('Preview da operação');
    print('  Versão: ' + version);
    print('  Tarefas (' + taskIds.length + '):');
    taskIds.forEach((id) => print('    - ' + id));
    if (!(await askConfirm('Confirmar atribuicao de fixVersion?'))) {
        warn(OPERATION_CANCELLED);
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

    if (await askConfirm('Adicionar tarefas a uma sprint?')) {
        const sprintId = await ask('ID da sprint', { hint: 'ex: 6991 (encontrado na URL do board)' });
        if (!sprintId.trim()) {
            warn('Sprint ID vazio. Pulando...');
        } else {
            try {
                await c.jiraResource.postJiraResource('sprint/' + sprintId + '/issue', { issues: taskIds });
                success('Tarefas adicionadas a sprint ' + sprintId);
            } catch (err: unknown) {
                printError(ERR_ADD_TASKS_TO_SPRINT, err);
            }
        }
    }
    return false;
}

export default { handler };
