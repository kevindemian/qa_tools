/** Interactive bug-report flow — collect details and create Jira issue. */
import { printError, title } from '../../shared/prompt';
import { collectManual, interactiveBugReportFlow } from '../../shared/bug-report';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    title('Bug Report');
    try {
        const report = await collectManual();
        const result = await interactiveBugReportFlow(c.jiraResource, c.ctx.project_name, report, c.linkManager);
        if (result?.status === 'ok') {
            c.pushHistory('bug-report', `${result.label}: ${result.message}`, 'ok');
        }
    } catch (e) {
        printError('Erro ao criar bug report', e);
    }
}

export default { handler };
