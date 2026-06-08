/** Import JSON/TXT test results (CTRF format) to create Test Executions. */
import path from 'path';
import Config from '../../shared/config.js';
import { ask, warn, success } from '../../shared/prompt.js';
import type { CommandContext } from './context.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const jsonPathInput =
        Config.get('jsonPath') ||
        (await ask('Caminho do arquivo JSON ou TXT (formato JSON)', {
            hint: 'ex: ./results/ctrf.json',
            default: Config.get('jsonPath') || '',
        }));

    const jsonPath = jsonPathInput.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }

    const result = await createTests.createTestsFromJson({
        jiraResource: c.jiraResource,
        jiraResourceXray: c.jiraResourceXray,
        linkManager: c.linkManager,
        linkManagerXray: c.linkManagerXray,
        project_name: c.ctx.project_name,
        base_url: c.base_url,
        sessionLog: c.sessionLog,
        onBusy: (val: boolean) => {
            c.ctx.isBusy = val;
        },
        jsonPath: jsonPath,
    });
    if (result) {
        c.ctx.inMemoryTasksId = result.inMemoryTasksId;
        c.ctx.inMemoryTasksText = result.inMemoryTasksText;
        const okCount = result.inMemoryTasksId.length;
        success('Importacao JSON concluída: ' + okCount + ' testes');
        c.ctx.results = result.inMemoryTasksId.map((key: string) => ({
            status: 'ok' as const,
            label: key,
            message: '',
        }));
        c.pushHistory('importar-json', okCount + ' testes', 'ok');

        const keys = result.inMemoryTasksId;
        const srcName = result.sourcePath ? path.basename(result.sourcePath, '.json') : 'json-import';
        const teResult = await offerTestExecutionAssociation(c, keys, srcName);
        await showResults(c, keys, teResult);
    }
}

export default { handler };
