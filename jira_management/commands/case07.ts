/** Close all tasks for a given version — transition unresolved issues to Done. */
import { formatErr } from '../../shared/errors.js';
import { warn, askConfirm, ask, printSummary, printError } from '../../shared/ui/prompt.js';
import { rootLogger } from '../../shared/logger.js';
import type { CommandContext } from './context.js';
import { NO_TASKS_FOUND_FOR_VERSION, OPERATION_CANCELLED } from '../constants.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Versão a fechar', { hint: 'ex: v2.8.0' });
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
        .map((task: string) => /\[([A-Z][A-Z0-9]+-\d+)\]/.exec(task)?.[1])
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
                c.ctx.lastOperation = taskIds.length + ' tarefa(s) fechadas';
            } catch (err: unknown) {
                rootLogger.error('Falha ao fechar tarefas: ' + formatErr(err));
                printError('Erro ao fechar tarefas', err);
                const summary = taskIds.map((id) => ({
                    status: 'error' as const,
                    label: id,
                    message: 'Falha ao fechar tarefa',
                }));
                printSummary(summary);
                c.pushHistory('fechar-tarefas', 'erro', 'error');
                c.ctx.lastOperation = 'Falha ao fechar ' + taskIds.length + ' tarefa(s)';
            }
        },
        'Fechando ' + taskIds.length + ' tarefa(s)...',
    );
}

export default { handler };
