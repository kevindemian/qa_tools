/** Check release-task status — verify all issues for a version are resolved. */
import { ask, warn } from '../../shared/ui/prompt.js';
import { safeJiraCall } from '../../shared/jira/jira-helper.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Nome da versão', { hint: 'ex: v2.8.0' });
    if (!version.trim()) {
        warn('Nome da versão não pode ser vazio.');
        return;
    }
    await safeJiraCall(c, 'verificar-status', version, () =>
        c.jiraResource.checkReleaseTasksStatus(c.ctx.project_name, version),
    );
}

export default { handler };
