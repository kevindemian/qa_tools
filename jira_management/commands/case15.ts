import Config from '../../shared/config';
import { prompt, confirm, smartPrompt, warn, success } from '../../shared/prompt';
import { load as loadState } from '../../shared/state';
import path from 'path';
import fs from 'fs';
import type { CommandContext } from './context';
import { createTestExecutionWithLinksWrapper } from './helpers';

async function handler(c: CommandContext): Promise<boolean | void> {
    const state = loadState() as Record<string, string | undefined>;
    const jsonPathInput =
        Config.jsonPath ||
        smartPrompt('Caminho do arquivo JSON ou TXT (formato JSON)', { default: state.lastJsonPath || '' });

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createTestsFromJson = require('../create_tests').createTestsFromJson;
    const result = await createTestsFromJson({
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

        if (confirm('Criar Test Execution para estes testes?', true)) {
            const keys = result.inMemoryTasksId;
            const srcName = result.sourcePath ? path.basename(result.sourcePath, '.json') : 'json-import';
            const nameInput = prompt('Nome da execução', { hint: 'Enter = ' + srcName });
            const csvName = nameInput.trim() || srcName;
            const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + csvName });
            const execDesc = prompt('Descrição (opcional)');
            await createTestExecutionWithLinksWrapper(c, keys, csvName, execTitle, execDesc);
        }
    }
}

export = { handler };
