/** Jira API helpers — reduce boilerplate across handlers. */
import { printError } from './prompt';
import { rootLogger } from './logger';
import type { CommandContext } from '../jira_management/commands/context';

/** Wrap a Jira API call with consistent error handling, logging, and pushHistory.
 *  On success: pushes `ok` history entry.
 *  On failure: logs with rootLogger, prints error, pushes `error` history entry.
 *  @returns true if the operation succeeded, false otherwise. */
export async function safeJiraCall(
    c: CommandContext,
    operationName: string,
    detailLabel: string,
    fn: () => Promise<unknown>,
): Promise<boolean> {
    try {
        await fn();
        c.pushHistory(operationName, detailLabel, 'ok');
        return true;
    } catch (err) {
        const msg = 'Erro ao ' + operationName + ' "' + detailLabel + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, {
            detail: detailLabel,
            project: c.ctx.project_name,
            status: (err as { response?: { status?: number } }).response?.status,
        });
        c.pushHistory(operationName, detailLabel, 'error');
        return false;
    }
}
