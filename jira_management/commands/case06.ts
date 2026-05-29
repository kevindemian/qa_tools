/** Check release-task status — verify all issues for a version are resolved. */
import { ask } from '../../shared/prompt';
import { safeJiraCall } from '../../shared/jira-helper';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const version = await ask('Nome da versão', {});
    await safeJiraCall(c, 'verificar-status', version, () =>
        c.jiraResource.checkReleaseTasksStatus(c.ctx.project_name, version),
    );
}

export default { handler };
