/** Import CSV → Create Test Cases: configure CSV path and start the import pipeline. */
import Config from '../../shared/config.js';
import { ask, askFilePath } from '../../shared/prompt.js';
import { load as loadState } from '../../shared/state.js';
import path from 'path';
import type { CommandContext } from './context.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const state = loadState() as Record<string, string | undefined>;
    const csvDefaultPath = Config.get('csvDefaultPath') || path.join(import.meta.dirname, '../test_steps.csv');
    const csvPath =
        Config.get('csvPath') ||
        (await askFilePath('Caminho do arquivo CSV', {
            extensions: ['.csv'],
            default: state['lastCsvPath'] || csvDefaultPath,
        }));

    const labelsHint = state['lastLabels'] ? 'último: ' + state['lastLabels'] : 'vazio para nenhuma';
    const jiraLabelsInput =
        Config.get('csvLabels') ||
        (await ask('Labels Jira (separadas por virgula)', { hint: labelsHint, default: state['lastLabels'] || '' }));
    const jiraLabels = jiraLabelsInput
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    const result = await createTests.createTestsFromCsv({
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
        const csvPathHint = execState['lastCsvPath'] || '';
        const csvName = csvPathHint ? path.basename(csvPathHint, '.csv') : 'Automated Execution';
        const teResult = await offerTestExecutionAssociation(c, c.ctx.inMemoryTasksId, csvName);
        await showResults(c, c.ctx.inMemoryTasksId, teResult);
    }
}

export default { handler };
