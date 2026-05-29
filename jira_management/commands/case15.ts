/** Import JSON/TXT test results (CTRF format) to create Test Executions. */
import Config from '../../shared/config';
import { ask, warn, success } from '../../shared/prompt';
import { load as loadState } from '../../shared/state';
import path from 'path';
import fs from 'fs';
import type { CommandContext } from './context';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow';

async function handler(c: CommandContext): Promise<boolean | void> {
    const state = loadState() as Record<string, string | undefined>;
    const jsonPathInput =
        Config.jsonPath ||
        (await ask('Caminho do arquivo JSON ou TXT (formato JSON)', { default: state.lastJsonPath || '' }));

    let jsonPath = jsonPathInput.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
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
