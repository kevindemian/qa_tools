/** Create a new version in the Jira project. */
import { warn, ask, askMultiline } from '../../shared/ui/prompt.js';
import { safeJiraCall } from '../../shared/jira/jira-helper.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const name = await ask('Nome da nova versão', { hint: 'ex: v2.8.0' });
    if (!name.trim()) {
        warn('Nome da versão não pode ser vazio.');
        return;
    }
    const desc = await askMultiline('Descrição da versão (opcional)');
    await safeJiraCall(c, 'criar-versão', name, () => c.jiraResource.createVersion(c.ctx.project_name, name, desc));
}

export default { handler };
