import { printError } from '../../shared/prompt';
import type { CommandContext } from './context';

export async function createTestExecutionWithLinksWrapper(
    c: CommandContext,
    keys: string[],
    csvName: string,
    execTitle: string,
    execDesc: string,
): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createTestExecutionWithLinks } = require('../create_tests');
    try {
        const execResult = await createTestExecutionWithLinks(
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
