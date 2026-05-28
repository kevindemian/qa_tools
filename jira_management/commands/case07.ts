/** Close all tasks for a given version — transition unresolved issues to Done. */
import { warn, askConfirm, ask, printSummary } from '../../shared/prompt';
import type { CommandContext } from './context';
import { NO_TASKS_FOUND_FOR_VERSION, OPERATION_CANCELLED } from '../constants';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Versão a fechar', {});
    if (
        !(await askConfirm('Fechar todas as tarefas da versão ' + version + '? Esta operação não pode ser desfeita.'))
    ) {
        warn(OPERATION_CANCELLED);
        return true;
    }
    const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version);
    if (!Array.isArray(tasks) || tasks.length === 0) {
        warn(NO_TASKS_FOUND_FOR_VERSION);
        return true;
    }
    const taskIds: string[] = tasks
        .map((task: string) => task.match(/\[([A-Z][A-Z0-9]+-\d+)\]/)?.[1])
        .filter((id: string | undefined): id is string => id !== undefined);
    if (taskIds.length === 0) {
        warn('Nenhuma tarefa encontrada.');
        return true;
    }
    await c.ctx.withBusy(
        async () => {
            try {
                await c.jiraResource.moveCardsToDone(taskIds);
                const summary = taskIds.map((id) => ({ status: 'ok' as const, label: id, message: '' }));
                printSummary(summary);
                c.pushHistory('fechar-tarefas', taskIds.length + ' tarefa(s)', 'ok');
            } catch {
                const summary = taskIds.map((id) => ({
                    status: 'error' as const,
                    label: id,
                    message: 'Falha ao fechar tarefa',
                }));
                printSummary(summary);
                c.pushHistory('fechar-tarefas', 'erro', 'error');
            }
            c.ctx.lastOperation = taskIds.length + ' tarefa(s) fechadas';
        },
        'Fechando ' + taskIds.length + ' tarefa(s)...',
    );
    return false;
}

export default { handler };
