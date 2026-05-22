import Config from '../../shared/config';
import { prompt, confirm, smartPrompt } from '../../shared/prompt';
import { load as loadState } from '../../shared/state';
import path from 'path';
import type { CommandContext } from './context';
import { createTestExecutionWithLinksWrapper } from './helpers';

async function handler(c: CommandContext): Promise<boolean | void> {
    const state = loadState() as Record<string, string | undefined>;
    const csvDefaultPath = Config.csvDefaultPath || path.join(__dirname, '../test_steps.csv');
    const csvPath =
        Config.csvPath || smartPrompt('Caminho do arquivo CSV', { default: state.lastCsvPath || csvDefaultPath });

    const labelsHint = state.lastLabels ? 'último: ' + state.lastLabels : 'vazio para nenhuma';
    const jiraLabelsInput =
        Config.csvLabels ||
        prompt(
            'Labels Jira (separadas por virgula)',

            { hint: labelsHint, default: state.lastLabels || '' },
        );
    const jiraLabels = jiraLabelsInput
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createTestsFromCsv = require('../create_tests').createTestsFromCsv;
    const result = await createTestsFromCsv({
        jiraResource: c.jiraResource,
        jiraResourceXray: c.jiraResourceXray,
        linkManager: c.linkManager,
        linkManagerXray: c.linkManagerXray,
        csvResource: c.csvResource,
        project_name: c.ctx.project_name,
        base_url: c.base_url,
        sessionLog: c.sessionLog,
        onBusy: (val: boolean) => {
            c.ctx.isBusy = val;
        },
        csvPath: csvPath,
        jiraLabels: jiraLabels,
    });
    if (result) {
        c.ctx.inMemoryTasksId = result.inMemoryTasksId;
        c.ctx.inMemoryTasksText = result.inMemoryTasksText;
        c.pushHistory('csv-import', result.summary, result.status);
        c.ctx.lastOperation = result.summary;
    }
    if (result && c.ctx.inMemoryTasksId.length > 0) {
        const execState = loadState() as Record<string, string | undefined>;
        const csvPathHint = execState.lastCsvPath || '';
        const csvName = csvPathHint ? path.basename(csvPathHint, '.csv') : '';
        if (confirm('Criar Test Execution para ' + c.ctx.inMemoryTasksId.length + ' testes criados?', true)) {
            const execTitle = prompt('Titulo do Test Execution', {
                hint: 'Enter = ' + (csvName || 'Automated Execution'),
            });
            const execDesc = prompt('Descrição (opcional)');
            await createTestExecutionWithLinksWrapper(c, c.ctx.inMemoryTasksId, csvName, execTitle, execDesc);
        }
    }
}

export { handler };
module.exports = { handler };
