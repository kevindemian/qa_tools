/** Import CSV → Create Test Cases: configure CSV path and start the import pipeline. */
import Config from '../../shared/config-accessor.js';
import { ask, askFilePath, printError, warn } from '../../shared/ui/prompt.js';
import { loadTypedState } from '../../shared/state.js';
import { rootLogger } from '../../shared/logger.js';
import path from 'path';
import type { CommandContext } from './context.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';

/** Human-readable message for each distinguishable CSV read failure (never generic). */
function describeCsvFailure(reason: 'empty' | 'missing' | 'read-error', csvPath: string): string {
    switch (reason) {
        case 'missing':
            return 'Arquivo CSV não encontrado: ' + csvPath;
        case 'empty':
            return 'O CSV não contém nenhum teste válido. Verifique o conteúdo do arquivo.';
        default:
            return 'Falha ao ler o CSV. Verifique o caminho e o formato do arquivo.';
    }
}

async function handler(c: CommandContext): Promise<boolean | void> {
    try {
        const state = loadTypedState();
        const csvDefaultPath = Config.get('csvDefaultPath') || path.join(import.meta.dirname, '../test_steps.csv');
        const csvPath =
            Config.get('csvPath') ||
            (await askFilePath('Caminho do arquivo CSV', {
                extensions: ['.csv'],
                default: state.lastCsvPath || csvDefaultPath,
            }));

        const labelsHint = state.lastLabels ? 'último: ' + state.lastLabels : 'vazio para nenhuma';
        const jiraLabelsInput =
            Config.get('csvLabels') ||
            (await ask('Labels Jira (separadas por virgula)', { hint: labelsHint, default: state.lastLabels || '' }));
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
        if (!result.ok) {
            const detail = describeCsvFailure(result.reason, csvPath);
            warn(detail);
            c.pushHistory('csv-import', detail, 'error');
            c.ctx.lastOperation = detail;
            return;
        }
        c.ctx.inMemoryTasksId = result.result.inMemoryTasksId;
        c.ctx.inMemoryTasksText = result.result.inMemoryTasksText;
        c.pushHistory('csv-import', result.result.summary, result.result.status);
        c.ctx.lastOperation = result.result.summary;
        if (c.ctx.inMemoryTasksId.length > 0) {
            const csvName = state.lastCsvPath ? path.basename(state.lastCsvPath, '.csv') : 'Automated Execution';
            const teResult = await offerTestExecutionAssociation(c, c.ctx.inMemoryTasksId, csvName);
            await showResults(c, c.ctx.inMemoryTasksId, teResult);
        }
    } catch (err: unknown) {
        const msg = 'Falha ao importar CSV';
        printError(msg, err);
        rootLogger.error('case01 handler failed', { error: String(err), project: c.ctx.project_name });
        c.pushHistory('csv-import', 'erro', 'error');
        return;
    }
}

export default { handler };
