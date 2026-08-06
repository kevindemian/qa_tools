/**
 * Batch mode — run metrics, pipeline failure analysis, and test-impact selection headlessly.
 * Uses unified CLI args from cli-args.ts.
 */
import { success, error, info, printError, warn, withSpinner } from '../shared/ui/prompt.js';
import { extractErrorMessage } from '../shared/ui/prompt-errors.js';
import { getDataHub, setDataHub } from '../shared/data-hub/global-hub.js';
import {
    expireQuarantine,
    listQuarantined,
    quarantineRatio,
    generatePipelineQuarantine,
} from '../shared/validation/quarantine.js';
import { exportTestsCsv, exportTestsJson } from '../shared/report/report-export.js';
import { analyzeTestImpact, generateTestSelectionJson } from '../shared/quality/test-impact.js';
import { offerPipelineFailureAnalysis } from './llm-pipeline.js';
import { collectTestResults as _collectTestResults } from './test-results.js';
import { normalizeRunId } from '../shared/ci/run-id.js';
import type { ParseResult } from '../shared/result_parser.js';
import { generatePrReport } from '../shared/pr-report-core.js';
import { isPrReportEnabled, getPrReportConfig } from '../shared/feature-config.js';
import type { PipelineTriggerResult } from '../shared/types.js';
import Config from '../shared/config-accessor.js';
import JiraClient from '../shared/jira/jira-client.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import { writeReport } from '../shared/infra/temp-dir.js';
import {
    currentProvider,
    pushHistory,
    printSessionSummary,
    createManagerForProject,
    setProjectId,
    setManager,
    getProjects,
} from './session-state.js';
import { setCurrentProject, ensureSelfHostProject, getSelfHostEntry } from '../shared/project-context.js';
import type { ProjectEntry } from '../shared/types/project.js';
import { pollPipeline } from './pipeline-handler.js';
import type { BatchCliArgs } from './cli-args.js';
import { parseCliArgs } from './cli-args.js';

/**
 * Sets up a batch project from CLI args.
 * @param batch Parsed batch CLI arguments
 * @returns Project setup info or null on failure
 */
async function setupBatchProject(batch: BatchCliArgs): Promise<{
    m: import('../shared/types.js').GitProvider;
    branch: string;
    projectName: string;
} | null> {
    const projs = getProjects();
    if (Object.keys(projs).length === 0) {
        error('Nenhum projeto configurado.');
        return null;
    }

    const projsEntries = Object.entries(projs);
    const firstEntry = projsEntries[0];
    const projectName = batch.project || (firstEntry ? firstEntry[0] : '');
    const projectEntry = projsEntries.find(([k]) => k === projectName);
    if (!projectEntry) {
        // Registry miss: try self-host resolution (the checked-out repo is the requested project).
        // Resolves in-memory without writing the registry — correct for CI where the registry is empty.
        let selfEntry: ProjectEntry | undefined;
        try {
            ensureSelfHostProject(projectName);
            selfEntry = getSelfHostEntry();
        } catch {
            selfEntry = undefined;
        }
        if (!selfEntry) {
            error(
                'Projeto "' +
                    projectName +
                    '" não encontrado. Registre-o via Setup Wizard (opção "Adicionar projeto") ou execute a partir do repositório do projeto.',
            );
            return null;
        }
        setProjectId(selfEntry.projectId ?? '');
        const m = createManagerForProject(projectName, selfEntry.projectId ?? '');
        setManager(m);
        return { m, branch: batch.branch || 'main', projectName };
    }

    setCurrentProject(projectName);
    setProjectId(projectEntry[1]);
    const m = createManagerForProject(projectName, projectEntry[1]);
    setManager(m);

    const branch = batch.branch || 'main';
    const branchCheck = await m.getBranch(branch);
    if (!branchCheck) {
        error('Branch "' + branch + '" não encontrada em ' + projectName + '.');
        return null;
    }

    return { m, branch, projectName };
}

async function _triggerPipeline(
    m: import('../shared/types.js').GitProvider,
    branch: string,
): Promise<PipelineTriggerResult | undefined> {
    const payload = { ref: branch, variables: [] as Array<{ key: string; value: string }> };
    try {
        const result = await withSpinner('Disparando pipeline em ' + branch + '...', () => m.triggerPipeline(payload));
        if (result) {
            success('Pipeline disparado: ' + String(result.web_url));
            pushHistory('batch-pipeline', branch, 'ok');
        }
        return result;
    } catch (err) {
        printError('Falha ao disparar pipeline', err);
        pushHistory('batch-pipeline', branch, 'error');
        return undefined;
    }
}

async function generatePrReportIfNeeded(
    projectName: string,
    dataHub: import('../shared/types/data-hub.js').DataHub,
): Promise<void> {
    const prReportEnabled = isPrReportEnabled(projectName);
    if (!process.env['GITHUB_TOKEN'] || !prReportEnabled) return;
    const prConfig = getPrReportConfig(projectName);
    try {
        const reportResult = await generatePrReport({
            skipAi: prConfig.skipAi ?? false,
            skipQuality: prConfig.skipQuality ?? false,
            skipFlaky: prConfig.skipFlaky ?? false,
            htmlOutputPath: 'reports/pr-report.html',
            dataHub,
        });
        if (reportResult.htmlPath) {
            success('PR report gerado: ' + reportResult.htmlPath);
        }
    } catch (err) {
        warn('PR report generation failed: ' + String(err));
    }
}

async function _collectPipelineResults(
    m: import('../shared/types.js').GitProvider,
    pipelineResult: PipelineTriggerResult,
    branch: string,
    projectName: string,
    teKey: string | undefined,
    jiraResource: JiraClient,
    jiraBaseUrl: string,
    linkManager: JiraLinkManager,
): Promise<boolean> {
    const pipelineId = (pipelineResult.id as string) || (pipelineResult.run_number as string) || '';
    if (!pipelineId) {
        error('ID da pipeline não encontrado na resposta.');
        return true;
    }

    info('Aguardando pipeline #' + pipelineId + '...');
    const pollResult = await pollPipeline(m, pipelineId);
    const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
    info('Pipeline #' + pipelineId + ': ' + icon + ' ' + pollResult.status);

    if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
        const parsed = await _collectTestResults({
            m,
            pipelineId,
            branch,
            projectName,
            currentProvider,
            pushHistory,
            ...(teKey ? { teKey } : {}),
            jiraResource,
            linkManager,
            jiraBaseUrl,
        });
        if (parsed) {
            const dataHub = await _reconcileDataHub(m, projectName, parsed, pipelineId);
            // Register DataHub in the global singleton so downstream consumers
            // (quality-gate, health-score, session summary) can access it via getDataHub().
            if (dataHub) {
                setDataHub(dataHub);
                await generatePrReportIfNeeded(projectName, dataHub);
            } else {
                error('batch-mode: PR report não gerado — DataHub indisponível após falha de fetch.');
            }
            // Análise de falhas APÓS o hub estar disponível (F0-T8): o hub
            // passado já reflete o parse coletado; sem hub, a própria oferta
            // constrói um hub dedicado (defensivo — nunca analisa contra hub vazio).
            await offerPipelineFailureAnalysis(parsed, dataHub ? { dataHub } : undefined);
        }
    }
    return false;
}

/**
 * F0-T8 (SSOT): fetch do hub e reconciliação do parse coletado como run atual,
 * ANTES de qualquer consumo. O `saveParseResult` interno do test-results vai no
 * hub GLOBAL (ainda antigo neste momento); sem esta reconciliação, o hub novo
 * refletiria um run stale para o PR report e a análise de falhas. Guard §24:
 * fetch sem hub → erro explícito (§25), nunca run stale silencioso.
 */
async function _reconcileDataHub(
    m: import('../shared/types.js').GitProvider,
    projectName: string,
    parsed: ParseResult,
    pipelineId: string,
): Promise<import('../shared/types/data-hub.js').DataHub | undefined> {
    try {
        const { getOrFetchDataHub } = await import('../shared/ci/ci-data.js');
        const fetched = await getOrFetchDataHub(m, projectName);
        if (!fetched) {
            throw new Error('getOrFetchDataHub returned undefined');
        }
        fetched.saveParseResult(projectName, parsed, normalizeRunId(pipelineId));
        return fetched;
    } catch (err: unknown) {
        error('batch-mode: DataHub fetch failed — ' + extractErrorMessage(err));
        return undefined;
    }
}

async function triggerAndCollectBatchPipeline(
    m: import('../shared/types.js').GitProvider,
    branch: string,
    projectName: string,
    teKey: string | undefined,
    jiraResource: JiraClient,
    jiraBaseUrl: string,
    linkManager: JiraLinkManager,
): Promise<boolean> {
    const pipelineResult = await _triggerPipeline(m, branch);
    if (!pipelineResult) return true;

    return _collectPipelineResults(
        m,
        pipelineResult,
        branch,
        projectName,
        teKey,
        jiraResource,
        jiraBaseUrl,
        linkManager,
    );
}

/**
 * Manual report-retention prune command (C-12): `--prune-reports` is a dry-run;
 * `--prune-reports --force` executes. G1: accesses DataHub via the public
 * `createDataHubForMaintenance` factory (maintenance-only, no data fetch).
 */
async function _runPruneCommand(projectName: string, force: boolean): Promise<boolean> {
    const { createDataHubForMaintenance } = await import('../shared/data-hub/factory.js');
    const hub = createDataHubForMaintenance(projectName);
    const removed = hub.pruneReports(!force);
    if (removed.length === 0) {
        info('Nenhum relatório excede a política de retenção para ' + projectName + '.');
    } else if (!force) {
        info(
            '--prune-reports (dry-run): ' +
                removed.length +
                ' relatório(s) seriam removidos de ' +
                projectName +
                '. Use --force para executar.',
        );
    } else {
        hub.flush('prune: retenção de relatórios');
        success('Prune concluído: ' + removed.length + ' relatório(s) removido(s) de ' + projectName + '.');
    }
    return true;
}

/**
 * Tries to run in batch mode.
 * @param batchArgs Optional pre-parsed batch args (if not provided, parses from process.argv)
 * @returns true if batch mode was executed, false otherwise
 */
export async function tryBatchMode(batchArgs?: BatchCliArgs): Promise<boolean> {
    const batch = batchArgs ?? (parseCliArgs() as BatchCliArgs);
    if (!batch.auto && !batch.project && !batch.branch) return false;

    if (batch.auto) {
        Config.setAutoConfirm(true);
    }

    const setup = await setupBatchProject(batch);
    if (!setup) return true;

    info('Modo batch: ' + setup.projectName + ' @ ' + setup.branch);

    if (batch.pruneReports) {
        return _runPruneCommand(setup.projectName, batch.force);
    }

    let jiraResource: JiraClient | undefined;
    let linkManager: JiraLinkManager | undefined;
    let jiraBaseUrl: string | undefined;
    if (Config.get('jiraBaseUrl') && Config.get('jiraPersonalToken')) {
        jiraResource = new JiraClient(
            Config.get('jiraPersonalToken'),
            Config.get('jiraBaseUrl') + '/rest/api/2',
            Config.get('jiraMode'),
        );
        linkManager = new JiraLinkManager(jiraResource);
        jiraBaseUrl = Config.get('jiraBaseUrl');
    }

    if (batch.dryRun) {
        info('--dry-run: plano de operações para ' + setup.projectName + ' @ ' + setup.branch);
        info('  1. Trigger pipeline on ' + setup.branch);
        info('  2. Poll pipeline result');
        info('  3. Collect test results');
        info('  4. Generate test export');
        if (Config.get('jiraBaseUrl') && Config.get('jiraPersonalToken')) {
            info('  5. Run flaky auto-actions');
        }
        info('  6. Run quarantine maintenance');
        if (batch.runImpactedTests) {
            info('  7. Run test impact selection');
        }
        printSessionSummary();
        return true;
    }

    const done = await triggerAndCollectBatchPipeline(
        setup.m,
        setup.branch,
        setup.projectName,
        batch.teKey,
        jiraResource as JiraClient,
        jiraBaseUrl as string,
        linkManager as JiraLinkManager,
    );
    if (done) return true;

    generateTestExport(setup.projectName);
    runQuarantineMaintenance();
    if (batch.runImpactedTests) {
        runTestImpactSelection(batch.conservative);
    }
    printSessionSummary();
    return true;
}

function runTestImpactSelection(conservative?: boolean): void {
    try {
        const result = analyzeTestImpact();
        if (result.changedFiles.length === 0) {
            info('Nenhum arquivo alterado detectado — pulando seleção de testes.');
            return;
        }
        const selection = generateTestSelectionJson(result, {
            conservative,
            smokeTests: conservative ? ['smoke'] : [],
        });
        const outPath = writeReport('test-selection.json', JSON.stringify(selection, null, 2));
        success('Seleção de testes impactados salva: ' + outPath);
        const labelMode = conservative ? '(modo conservador)' : '(modo preciso)';
        info(
            result.impactedTests.length +
                ' teste(s) impactado(s) em ' +
                result.changedFiles.length +
                ' arquivo(s) ' +
                labelMode +
                '. Confiança: ' +
                result.confidence,
        );
    } catch (err) {
        printError('Falha ao analisar impacto de testes', err);
    }
}

function runQuarantineMaintenance(): void {
    const expired = expireQuarantine();
    if (expired > 0) {
        info(expired + ' quarantined test(s) expired.');
    }
    generatePipelineQuarantine();
    const allEntries = listQuarantined();
    if (allEntries.length > 0) {
        const meta = quarantineRatio(allEntries.length + 10);
        info('Quarantined: ' + allEntries.length + ' test(s)');
        if (meta.warning) {
            warn(meta.warning);
        }
    }
}

function generateTestExport(projectName: string): void {
    try {
        const hub = getDataHub();
        const projectRuns = (hub.computed.metricsRuns ?? []).filter((r) => r.project === projectName);
        if (projectRuns.length === 0) {
            warn(
                `Dados insuficientes para export de testes de '${projectName}' — sem computed.metricsRuns. Execute pipelines primeiro.`,
            );
            return;
        }
        const latestRun = projectRuns[projectRuns.length - 1];
        if (!latestRun || latestRun.tests.length === 0) {
            warn(
                `Dados insuficientes para export de testes de '${projectName}' — última execução sem testes (computed.metricsRuns).`,
            );
            return;
        }
        const csv = exportTestsCsv(latestRun.tests);
        const csvPath = writeReport('tests-' + projectName + '.csv', csv);
        success('Test CSV export gerado: ' + csvPath);
        const json = exportTestsJson(latestRun.tests);
        const jsonPath = writeReport('tests-' + projectName + '.json', json);
        success('Test JSON export gerado: ' + jsonPath);
    } catch (err) {
        printError('Falha ao exportar testes', err);
    }
}
