/** Batch mode — run metrics, flakiness dashboard, pipeline failure analysis, flaky auto-actions, and test-impact selection headlessly. */
import { success, error, info, printError, warn, withSpinner } from '../shared/prompt.js';
import { rootLogger } from '../shared/logger.js';
import { loadMetrics, calculateFlakiness } from '../shared/metrics.js';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard.js';
import { executeFlakyActions } from '../shared/flaky-auto-actions.js';
import {
    expireQuarantine,
    listQuarantined,
    quarantineRatio,
    generatePipelineQuarantine,
} from '../shared/quarantine.js';
import { aggregatePipelineHealth, renderPipelineHealthHtml } from './pipeline-health.js';
import type { PipelineRunExtended, PipelineJobExtended } from './pipeline-health.js';
import { exportTestsCsv, exportTestsJson } from '../shared/report-export.js';
import { generateGitMetricsRuns } from '../shared/git-metrics-adapter.js';
import { analyzeTestImpact, generateTestSelectionJson } from '../shared/test-impact.js';
import { offerPipelineFailureAnalysis } from './llm-pipeline.js';
import { collectTestResults as _collectTestResults } from './test-results.js';
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

/** Extract the next argument value after a flag, or `undefined` if out of bounds. */
function _nextArg(args: string[], i: number): string | undefined {
    return i + 1 < args.length ? args[i + 1] : undefined;
}

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
    const args = process.argv.slice(2);
    const result: {
        project?: string;
        branch?: string;
        auto?: boolean;
        publish?: string;
        runImpactedTests?: boolean;
        conservative?: boolean;
        teKey?: string;
        dryRun?: boolean;
    } = {};
    for (let i = 0; i < args.length; i++) {
        const val = _nextArg(args, i);
        if ((args[i] === '--project' || args[i] === '-p') && val !== undefined) {
            result.project = val;
            i++;
        } else if ((args[i] === '--branch' || args[i] === '-b') && val !== undefined) {
            result.branch = val;
            i++;
        } else if (args[i] === '--auto' || args[i] === '--batch') {
            result.auto = true;
        } else if (args[i] === '--publish' && val !== undefined) {
            result.publish = val;
            i++;
        } else if (args[i] === '--run-impacted-tests') {
            result.runImpactedTests = true;
        } else if (args[i] === '--conservative') {
            result.conservative = true;
        } else if (args[i] === '--dry-run') {
            result.dryRun = true;
        } else if ((args[i] === '--te-key' || args[i] === '-k') && val !== undefined) {
            result.teKey = val;
            i++;
        }
    }
    return result;
}

async function setupBatchProject(batch: ReturnType<typeof parseBatchArgs>): Promise<{
    m: import('../shared/types.js').GitProvider;
    branch: string;
    projectName: string;
} | null> {
    const projs = getProjects();
    if (!projs || Object.keys(projs).length === 0) {
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

export async function runFlakyAutoActions(projectName: string, jiraResource: JiraClient): Promise<void> {
    try {
        if (!Config.get('jiraBaseUrl') || !Config.get('jiraPersonalToken')) return;
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        if (projectRuns.length < 5) return;
        const actions = await executeFlakyActions({ runs: projectRuns }, jiraResource, projectName, {
            autoCreateBug: true,
            minTotalRuns: 10,
            dedupSearch: true,
        });
        const bugs = actions.filter((a) => a.action === 'create_bug' || a.action === 'reenable');
        if (bugs.length > 0) {
            success(bugs.length + ' flaky auto-action(s) executada(s) para ' + projectName);
        }
    } catch {
        rootLogger.debug('Flaky auto-actions failed (expected if Jira not configured): insufficient data or config');
        info('Flaky auto-actions skipping (Jira config or insufficient data).');
    }
}

export function generateFlakinessDashboard(projectName: string, publishTarget?: string): void {
    if (!currentProjectName) return;
    const store = loadMetrics();
    let projectRuns = store.runs.filter((r) => r.project === currentProjectName);
    if (projectRuns.length < 2) {
        const gitRuns = generateGitMetricsRuns({ projectName: currentProjectName });
        if (gitRuns.length >= 2) {
            projectRuns = gitRuns;
            info('Fallback para git metrics — flakiness dashboard com dados do histórico de commits');
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

export async function tryBatchMode(): Promise<boolean> {
    const batch = parseBatchArgs();
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
    if (jiraResource) {
        await runFlakyAutoActions(setup.projectName, jiraResource);
    }
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
            if (gitRuns.length > 0) {
                projectRuns = gitRuns;
                info('Fallback para git metrics — export com dados do histórico de commits');
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
        const runs = (await m.getRecentPipelines(10)) as unknown as PipelineRunExtended[];
        if (!runs || runs.length === 0) return;
        const allJobs: PipelineJobExtended[][] = [];
        for (const run of runs) {
            const jobs = (await m.getPipelineJobs(run.id ?? '')) as unknown as PipelineJobExtended[];
            allJobs.push(jobs || []);
        }
        const health = aggregatePipelineHealth(runs, allJobs, [], [], new Date());
        const html = renderPipelineHealthHtml(health, 'Pipeline Health \u2014 ' + currentProjectName);
        const outPath = writeReport('pipeline-health-' + currentProjectName + '.html', html);
        success('Pipeline health report gerado: ' + outPath);
    } catch (err) {
        printError('Falha ao gerar pipeline health', err);
    }
}
