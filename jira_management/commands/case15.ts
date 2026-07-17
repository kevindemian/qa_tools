/** Import JSON/TXT test definitions to create Test Executions in Jira.
 * Uses Store-backed resolution: SHA cache → CI download → branch baseline,
 * falling back to manual file path when no automated data source is available. */
import path from 'path';
import Config from '../../shared/config-accessor.js';
import { ask, warn, success } from '../../shared/prompt.js';
import { writeEphemeral } from '../../shared/temp-dir.js';
import { resolveTestDataSource, resolveSessionContext } from '../../shared/session-context.js';
import type { CommandContext } from './context.js';
// anti-circular (prompt → create_tests → session-context → prompt)
import createTests from '../create_tests.js';
import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';

/** Human-readable message for each distinguishable JSON read failure (never generic). */
function describeJsonFailure(reason: 'empty' | 'missing' | 'read-error'): string {
    switch (reason) {
        case 'missing':
            return 'Arquivo JSON nao encontrado.';
        case 'empty':
            return 'O JSON nao contem nenhum teste valido.';
        default:
            return 'Falha ao ler o JSON. Verifique o caminho e o formato do arquivo.';
    }
}

function getSourceMessage(resolvedData: { source: string }, sha: string | null): string {
    if (resolvedData.source === 'cache') {
        return 'Usando dados em cache (SHA ' + (sha as string).slice(0, 7) + ')';
    }
    if (resolvedData.source === 'ci') {
        return 'Resultados baixados do CI';
    }
    return 'Usando baseline do branch ';
}

async function handler(c: CommandContext): Promise<boolean | void> {
    const projectName = c.ctx.project_name;
    if (!projectName) {
        warn('Nenhum projeto Jira selecionado.');
        return;
    }

    const { sha, branch, store } = resolveSessionContext(c.ctx, projectName);

    /* Attempt automated resolution: SHA cache → CI download → branch baseline */
    const resolvedData = sha ? await resolveTestDataSource(projectName, sha, branch, store) : null;

    let jsonPath: string;
    if (resolvedData && resolvedData.result.tests.length > 0) {
        /* Write resolved test data to a temp file for the import pipeline */
        const ctrfContent = JSON.stringify(
            {
                results: {
                    tests: resolvedData.result.tests.map((t) => ({
                        name: t.title,
                        status: t.state,
                        duration: t.duration,
                    })),
                },
            },
            null,
            2,
        );
        jsonPath = writeEphemeral('ctrf-import', `resolve-${sha ?? 'nosha'}-${Date.now()}.json`, ctrfContent);
        const sourceMsg = getSourceMessage(resolvedData, sha);
        success(sourceMsg);
    } else {
        /* Fallback: prompt user for manual file path */
        const jsonPathInput =
            Config.get('jsonPath') ||
            (await ask('Caminho do arquivo JSON ou TXT (formato JSON)', {
                hint: 'ex: ./results/ctrf.json',
                default: Config.get('jsonPath') || '',
            }));
        jsonPath = jsonPathInput.trim();
        if (!jsonPath) {
            warn('Caminho do JSON vazio. Operação cancelada.');
            return;
        }
    }

    const result = await createTests.createTestsFromJson({
        jiraResource: c.jiraResource,
        jiraResourceXray: c.jiraResourceXray,
        linkManager: c.linkManager,
        linkManagerXray: c.linkManagerXray,
        project_name: projectName,
        base_url: c.base_url,
        sessionLog: c.sessionLog,
        onBusy: (val: boolean) => {
            c.ctx.isBusy = val;
        },
        jsonPath,
    });

    /* Register import in Store for future cache hits */
    if (result.ok && sha && resolvedData) {
        store.saveReport(sha, resolvedData.result.tests);
        store.put(sha, {
            sha,
            project: projectName,
            timestamp: Date.now(),
            tool: 'case15-import',
            branch: branch || '',
            total: resolvedData.result.stats.total,
            passed: resolvedData.result.stats.passed,
            failed: resolvedData.result.stats.failed,
            skipped: resolvedData.result.stats.skipped,
        });
        store.flush('qa-tools: case15 import ' + sha.slice(0, 7));
    }

    if (!result.ok) {
        const detail = describeJsonFailure(result.reason);
        warn(detail);
        c.pushHistory('importar-json', detail, 'error');
        c.ctx.lastOperation = detail;
        return;
    }

    const imported = result.result;
    c.ctx.inMemoryTasksId = imported.inMemoryTasksId;
    c.ctx.inMemoryTasksText = imported.inMemoryTasksText;
    const okCount = imported.inMemoryTasksId.length;
    success('Importacao JSON concluida: ' + okCount + ' testes');
    c.ctx.results = imported.inMemoryTasksId.map((key: string) => ({
        status: 'ok' as const,
        label: key,
        message: '',
    }));
    c.pushHistory('importar-json', okCount + ' testes', 'ok');

    const keys = imported.inMemoryTasksId;
    const srcName = imported.sourcePath ? path.basename(imported.sourcePath, '.json') : 'json-import';
    const teResult = await offerTestExecutionAssociation(c, keys, srcName);
    await showResults(c, keys, teResult);
}

export default { handler };
