import { success, error, warn, info, prompt, smartPrompt, printError } from '../../shared/prompt';
import { rootLogger } from '../../shared/logger';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<void> {
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
        rootLogger.error(msg, { version: name, project: c.ctx.project_name, status: (err as any).response?.status });
        c.pushHistory('criar-versão', name, 'error');
    }
}

export { handler };
module.exports = { handler };
