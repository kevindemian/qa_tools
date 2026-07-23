/** Dry-run: simulate CSV import without creating or updating issues. */
import Config from '../../shared/config-accessor.js';
import { ask, askFilePath, printError, warn } from '../../shared/ui/prompt.js';
import { loadTypedState } from '../../shared/state.js';
import { rootLogger } from '../../shared/logger.js';
import path from 'path';
import type { CommandContext } from './context.js';
import createTests from '../create_tests.js';

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

        const keysInput = await ask('Target-keys (opcional, separadas por vírgula)', {
            hint: 'ex: ECSPOL-1612,ECSPOL-1613 ou Enter para nenhuma',
            default: '',
        });
        const targetKeys = keysInput
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
        if (targetKeys.length > 0) {
            Config.set('targetKeys', targetKeys.join(','));
        }

        Config.set('dryRun', true);

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
        });

        Config.set('dryRun', false);
        Config.set('targetKeys', '');

        if (!result.ok) {
            const detail = describeCsvFailure(result.reason, csvPath);
            warn(detail);
            c.pushHistory('dry-run', detail, 'error');
            c.ctx.lastOperation = detail;
            return;
        }
        c.pushHistory('dry-run', result.result.summary, result.result.status);
        c.ctx.lastOperation = result.result.summary;
    } catch (err: unknown) {
        Config.set('dryRun', false);
        Config.set('targetKeys', '');
        const msg = 'Falha ao simular importação CSV';
        printError(msg, err);
        rootLogger.error('case29 handler failed', { error: String(err), project: c.ctx.project_name });
        c.pushHistory('dry-run', 'erro', 'error');
        return;
    }
}

export default { handler };
