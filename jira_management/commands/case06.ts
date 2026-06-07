/** Check release-task status — verify all issues for a version are resolved. */
import { ask } from '../../shared/prompt.js';
import { safeJiraCall } from '../../shared/jira-helper.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Nome da versão', { hint: 'ex: v2.8.0' });
    await safeJiraCall(c, 'verificar-status', version, () =>
        c.jiraResource.checkReleaseTasksStatus(c.ctx.project_name, version),
    );
}

export default { handler };
