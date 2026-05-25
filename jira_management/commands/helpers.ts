import { printError } from '../../shared/prompt';
import type { CommandContext } from './context';
// anti-circular (prompt → create_tests → session-context → prompt)
// eslint-disable-next-line @typescript-eslint/no-require-imports
import createTests = require('../create_tests');

export async function createTestExecutionWithLinksWrapper(
    c: CommandContext,
    keys: string[],
    csvName: string,
    execTitle: string,
    execDesc: string,
): Promise<void> {
    try {
        const execResult = await createTests.createTestExecutionWithLinks(
            c.jiraResource,
            c.linkManager,
            c.ctx.project_name,
            keys,
            csvName,
            { title: execTitle, description: execDesc },
        );
        c.pushHistory('create-testexec', execResult.key, 'ok');
    } catch (err) {
        printError('Erro ao criar Test Execution', err);
        c.pushHistory('create-testexec', 'erro', 'error');
    }
}
