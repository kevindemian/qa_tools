import { smartPrompt, printError } from '../../shared/prompt';
import { rootLogger } from '../../shared/logger';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = smartPrompt('Nome da versão', {}, () => {});
    try {
        await c.jiraResource.checkReleaseTasksStatus(c.ctx.project_name, version);
        c.pushHistory('verificar-status', version, 'ok');
    } catch (err) {
        const msg = 'Erro ao verificar status da versão "' + version + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, {
            version,
            project: c.ctx.project_name,
            status: (err as { response?: { status?: number } }).response?.status,
        });
        c.pushHistory('verificar-status', version, 'error');
    }
}

export = { handler };
