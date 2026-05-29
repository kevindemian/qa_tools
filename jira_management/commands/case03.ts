/** Create a new version in the Jira project. */
import { warn, ask } from '../../shared/prompt';
import { safeJiraCall } from '../../shared/jira-helper';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const name = await ask('Nome da nova versão');
    if (!name.trim()) {
        warn('Nome da versão não pode ser vazio.');
        return;
    }
    const desc = await ask('Descrição da versão (opcional)');
    await safeJiraCall(c, 'criar-versão', name, () => c.jiraResource.createVersion(c.ctx.project_name, name, desc));
}

export default { handler };
