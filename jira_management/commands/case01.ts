/** Import CSV → Create Test Cases: configure CSV path and start the import pipeline. */
import Config from '../../shared/config-accessor.js';
import { ask, askFilePath, onError, printError, warn, info } from '../../shared/ui/prompt.js';
import { loadTypedState } from '../../shared/state.js';
import { rootLogger } from '../../shared/logger.js';
import path from 'path';
import type { CommandContext } from './context.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';
import type { TestExecutionAssociationResult } from './test-execution-flow.js';
import type { ImportMode } from '../../shared/types.js';

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

function _isMissingFile(err: unknown): boolean {
    return err instanceof Error && (err.message.includes('ENOENT') || err.message.includes('no such file'));
}

/** First pass over the CSV to learn how many tests it holds. Failures stay explicit and distinguishable. */
async function readCsvTotal(c: CommandContext, csvPath: string): Promise<number | 'empty' | 'missing' | 'read-error'> {
    try {
        const parsed = await c.csvResource.readBulkCsvWithMeta(csvPath);
        if (!parsed || parsed.tests.length === 0) return 'empty';
        return parsed.tests.length;
    } catch (err) {
        return _isMissingFile(err) ? 'missing' : 'read-error';
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

        const totalResult = await readCsvTotal(c, csvPath);
        if (typeof totalResult !== 'number') {
            const detail = describeCsvFailure(totalResult, csvPath);
            warn(detail);
            c.pushHistory('csv-import', detail, 'error');
            c.ctx.lastOperation = detail;
            return;
        }
        const total = totalResult;

        let targetKeys: string[] = [];
        let importMode: ImportMode = 'create';
        let keysHint = '';
        for (;;) {
            const nInput = await ask('Quantas issues serão atualizadas?', {
                hint:
                    'se quiser atualizar issues existentes, informe a quantidade e Enter; ' +
                    'caso contrário, Enter cria todas as ' +
                    total +
                    ' (' +
                    total +
                    ' = atualizar todas' +
                    (total > 1 ? ' | 1..' + (total - 1) + ' = atualizar parte' : '') +
                    ')' +
                    (keysHint ? ' | já informadas: ' + keysHint : ''),
                default: '0',
            });
            const trimmed = nInput.trim();
            if (trimmed === '' || trimmed === '0') {
                targetKeys = [];
                importMode = 'create';
                break;
            }
            const n = Number(trimmed);
            if (!Number.isInteger(n) || n <= 0) {
                warn(
                    'Valor inválido. Informe um número inteiro entre 1 e ' + total + ' (ou Enter para não atualizar).',
                );
                continue;
            }
            if (n > total) {
                warn('N (' + n + ') é maior que o total de testes no CSV (' + total + '). Informe um valor menor.');
                continue;
            }
            const keysInput = await ask('Informe as ' + n + ' chaves Jira (separadas por vírgula)', {
                hint: 'ordem = ordem dos testes no CSV',
            });
            const keys = keysInput
                .split(',')
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
            if (keys.length !== n) {
                keysHint = keys.join(', ');
                warn(
                    'Você informou ' +
                        keys.length +
                        ' chave(s), mas declarou ' +
                        n +
                        '. Informe exatamente ' +
                        n +
                        ' chaves.',
                );
                continue;
            }
            targetKeys = keys;
            importMode = n === total ? 'update' : 'hybrid';
            break;
        }

        const missingKeys: string[] = [];
        for (const key of targetKeys) {
            for (;;) {
                try {
                    const issue = await c.jiraResource.getJiraResource<{ fields?: { summary?: string } }>(
                        'issue/' + key,
                    );
                    info('Chave encontrada ' + key + (issue?.fields?.summary ? ': ' + issue.fields.summary : ''));
                    break;
                } catch (err) {
                    const choice = onError('Chave ' + key + ' não encontrada no Jira', err, { retry: true });
                    if (choice === 'retry') continue;
                    if (choice === 'skip') {
                        missingKeys.push(key);
                        break;
                    }
                    warn('Importação cancelada pelo usuário.');
                    c.pushHistory('csv-import', 'cancelada pelo usuário', 'error');
                    c.ctx.lastOperation = 'cancelada pelo usuário';
                    return;
                }
            }
        }

        Config.set('targetKeys', targetKeys.join(','));
        Config.set('importMode', importMode);

        const labelsHint = state.lastLabels ? 'último: ' + state.lastLabels : 'vazio para nenhuma';
        const jiraLabelsInput =
            Config.get('csvLabels') ||
            (await ask('Labels Jira (separadas por virgula)', { hint: labelsHint, default: state.lastLabels || '' }));
        const jiraLabels = jiraLabelsInput
            .split(',')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        const dryRunInput = await ask('Dry-run? (visualizar plano sem executar)', {
            hint: 's = simular | Enter = executar',
            default: '',
        });
        const isDryRun = dryRunInput.toLowerCase() === 's' || dryRunInput.toLowerCase() === 'sim';
        if (isDryRun) {
            Config.set('dryRun', true);
        }

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
            ...(targetKeys.length > 0 ? { targetKeys } : {}),
            importMode: importMode,
        });
        if (!result.ok) {
            const detail = describeCsvFailure(result.reason, csvPath);
            warn(detail);
            c.pushHistory('csv-import', detail, 'error');
            c.ctx.lastOperation = detail;
            if (isDryRun) Config.set('dryRun', false);
            return;
        }
        c.ctx.inMemoryTasksId = result.result.inMemoryTasksId;
        c.ctx.inMemoryTasksText = result.result.inMemoryTasksText;
        c.pushHistory('csv-import', result.result.summary, result.result.status);
        c.ctx.lastOperation = result.result.summary;
        if (isDryRun) Config.set('dryRun', false);
        if (missingKeys.length > 0) {
            warn('Chaves não encontradas no Jira e ignoradas: ' + missingKeys.join(', '));
        }
        if (c.ctx.inMemoryTasksId.length > 0) {
            const csvName = state.lastCsvPath ? path.basename(state.lastCsvPath, '.csv') : 'Automated Execution';
            let teResult: TestExecutionAssociationResult;
            if (result.testExecution) {
                info('Test Execution declarada no arquivo — criando automaticamente...');
                const { default: TestExecutionCreator } = await import('../test-execution-creator.js');
                const executor = new TestExecutionCreator(c.jiraResource, c.linkManager);
                const te = await createTests.createTestExecutionWithLinks({
                    testExecutionCreator: executor,
                    projectName: c.ctx.project_name,
                    testKeys: c.ctx.inMemoryTasksId,
                    csvName,
                    ...(result.testExecution.linkedIssues ? { teLinkedIssues: result.testExecution.linkedIssues } : {}),
                    execOpts: {
                        ...(result.testExecution.title ? { title: result.testExecution.title } : {}),
                        ...(result.testExecution.description ? { description: result.testExecution.description } : {}),
                        ...(result.testExecution.labels ? { labels: result.testExecution.labels } : {}),
                    },
                });
                teResult = te
                    ? { associated: true, key: te.key, summary: te.summary, mode: 'created' }
                    : { associated: false };
            } else {
                teResult = await offerTestExecutionAssociation(
                    c,
                    c.ctx.inMemoryTasksId,
                    csvName,
                    result.result.parentIssues,
                );
            }
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
