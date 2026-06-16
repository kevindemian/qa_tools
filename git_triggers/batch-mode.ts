/**
 * Batch mode — run metrics, flakiness dashboard, pipeline failure analysis, and test-impact selection headlessly.
 * Uses unified CLI args from cli-args.ts.
 */
import { success, error, info, printError, warn, withSpinner } from '../shared/prompt.js';
import { loadMetrics, calculateFlakiness } from '../shared/metrics.js';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard.js';
import {
    expireQuarantine,
    listQuarantined,
    quarantineRatio,
    generatePipelineQuarantine,
} from '../shared/quarantine.js';
import { aggregatePipelineHealth, renderPipelineHealthHtml } from './pipeline-health.js';
import type { PipelineRunExtended, PipelineJobExtended } from './pipeline-health.js';
import { exportTestsCsv, exportTestsJson } from '../shared/report-export.js';
import { generateGitMetricsRuns, getLastGitLogError } from '../shared/git-metrics-adapter.js';
import { analyzeTestImpact, generateTestSelectionJson } from '../shared/test-impact.js';
import { offerPipelineFailureAnalysis } from './llm-pipeline.js';
import { collectTestResults as _collectTestResults } from './test-results.js';
import { generatePrReport } from '../shared/pr-report-core.js';
import { isPrReportEnabled, getPrReportConfig } from '../shared/feature-config.js';
import type { PipelineTriggerResult } from '../shared/types.js';
import Config from '../shared/config.js';
import JiraClient from '../shared/jira-client.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import { writeReport } from '../shared/temp-dir.js';
import { publishReport } from '../shared/publish.js';
import {
    currentProjectName,
    currentProvider,
    pushHistory,
    printSessionSummary,
    createManagerForProject,
    setCurrentProjectName,
    setProjectId,
    setManager,
    getProjects,
} from './session-state.js';
import { pollPipeline } from './pipeline-handler.js';
import type { BatchCliArgs } from './cli-args.js';
import { parseCliArgs } from './cli-args.js';

/**
 * @deprecated Use parseCliArgs() from cli-args.ts instead.
 * Backward-compatible wrapper that returns only set fields.
 */
export function parseBatchArgs(): {
    project?: string;
    branch?: string;
    auto?: boolean;
    publish?: string;
    runImpactedTests?: boolean;
    conservative?: boolean;
    teKey?: string;
    dryRun?: boolean;
} {
    const args = parseCliArgs();
    if (args.mode !== 'batch') return {};
    const result: Record<string, string | boolean> = {};
    if (args.project !== undefined) result['project'] = args.project;
    if (args.branch !== undefined) result['branch'] = args.branch;
    if (args.auto) result['auto'] = true;
    if (args.publish !== undefined) result['publish'] = args.publish;
    if (args.runImpactedTests) result['runImpactedTests'] = true;
    if (args.conservative) result['conservative'] = true;
    if (args.teKey !== undefined) result['teKey'] = args.teKey;
    if (args.dryRun) result['dryRun'] = true;
    return result;
}

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

    const projectName = (batch.project || Object.keys(projs)[0]) ?? '';
    if (!projs[projectName]) {
        error('Projeto "' + projectName + '" não encontrado em config/projects.json.');
        return null;
    }

    setCurrentProjectName(projectName);
    setProjectId(projs[projectName]);
    const m = createManagerForProject(projectName, projs[projectName]);
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
            await offerPipelineFailureAnalysis(parsed);
            const prReportEnabled = isPrReportEnabled(projectName);
            if (process.env['GITHUB_TOKEN'] && prReportEnabled) {
                const prConfig = getPrReportConfig(projectName);
                try {
                    const reportResult = await generatePrReport({
                        tests: parsed.tests,
                        stats: {
                            passed: parsed.stats.passed,
                            failed: parsed.stats.failed,
                            skipped: parsed.stats.skipped,
                            total: parsed.stats.total,
                            duration: parsed.stats.duration,
                        },
                        skipAi: prConfig.skipAi ?? false,
                        skipQuality: prConfig.skipQuality ?? false,
                        skipFlaky: prConfig.skipFlaky ?? false,
                        htmlOutputPath: 'reports/pr-report.html',
                    });
                    if (reportResult.htmlPath) {
                        success('PR report gerado: ' + reportResult.htmlPath);
                    }
                } catch {
                    /* PR report errors are non-fatal */
                }
            }
        }
    }
    return false;
}

export async function triggerAndCollectBatchPipeline(
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

export function generateFlakinessDashboard(projectName: string, publishTarget?: string): void {
    if (!currentProjectName) return;
    const store = loadMetrics();
    let projectRuns = store.runs.filter((r) => r.project === currentProjectName);
    if (projectRuns.length < 2) {
        const gitRuns = generateGitMetricsRuns({ projectName: currentProjectName });
        const gitError = getLastGitLogError();
        if (gitRuns.length >= 2) {
            projectRuns = gitRuns;
            info('Fallback para git metrics — flakiness dashboard com dados do histórico de commits');
        } else if (gitError) {
            warn('Não foi possível obter o git history para flakiness dashboard. ' + gitError);
            return;
        } else {
            return;
        }
    }
    const flaky = calculateFlakiness({ runs: projectRuns }, 2);
    const html = generateFlakinessHtml(flaky, 'Flakiness — ' + projectName);
    const outPath = writeReport('flakiness-' + projectName + '.html', html);
    success('Dashboard de flakiness gerado: ' + outPath);
    if (publishTarget) {
        publishReport({ target: publishTarget as 's3' | 'gh-pages', filePath: outPath });
    }
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
        info('  4. Generate flakiness dashboard');
        info('  5. Generate test export');
        info('  6. Generate pipeline health report');
        if (Config.get('jiraBaseUrl') && Config.get('jiraPersonalToken')) {
            info('  7. Run flaky auto-actions');
        }
        info('  8. Run quarantine maintenance');
        if (batch.runImpactedTests) {
            info('  9. Run test impact selection');
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

    generateFlakinessDashboard(setup.projectName, batch.publish);
    generateTestExport(setup.projectName);
    await generatePipelineHealthReport(setup.m);
    runQuarantineMaintenance();
    if (batch.runImpactedTests) {
        runTestImpactSelection(batch.conservative);
    }
    printSessionSummary();
    return true;
}

export function runTestImpactSelection(conservative?: boolean): void {
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
        const store = loadMetrics();
        let projectRuns = store.runs.filter((r) => r.project === projectName);
        if (projectRuns.length === 0) {
            const gitRuns = generateGitMetricsRuns({ projectName });
            const gitError = getLastGitLogError();
            if (gitRuns.length > 0) {
                projectRuns = gitRuns;
                info('Fallback para git metrics — export com dados do histórico de commits');
            } else if (gitError) {
                warn('Não foi possível obter o git history para export. ' + gitError);
                return;
            } else {
                return;
            }
        }
        const latestRun = projectRuns[projectRuns.length - 1];
        if (!latestRun || latestRun.tests.length === 0) return;
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

async function generatePipelineHealthReport(m: import('../shared/types.js').GitProvider): Promise<void> {
    try {
        const runs: PipelineRunExtended[] = await m.getRecentPipelines(10);
        if (runs.length === 0) return;
        const allJobs: PipelineJobExtended[][] = [];
        for (const run of runs) {
            const jobs: PipelineJobExtended[] = await m.getPipelineJobs(run.id ?? '');
            allJobs.push(jobs);
        }
        const health = aggregatePipelineHealth(runs, allJobs, [], [], new Date());
        const html = renderPipelineHealthHtml(health, 'Pipeline Health \u2014 ' + currentProjectName);
        const outPath = writeReport('pipeline-health-' + currentProjectName + '.html', html);
        success('Pipeline health report gerado: ' + outPath);
    } catch (err) {
        printError('Falha ao gerar pipeline health', err);
    }
}

/**
 * Standalone handler for pipeline health report — callable from interactive mode.
 * @param m GitProvider instance for the current project
 */
export async function handlePipelineHealth(m: import('../shared/types.js').GitProvider): Promise<boolean> {
    await generatePipelineHealthReport(m);
    return false;
}
