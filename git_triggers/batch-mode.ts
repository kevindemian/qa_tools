/** Batch mode — run metrics, flakiness dashboard, pipeline failure analysis, flaky auto-actions, and test-impact selection headlessly. */
import { success, error, info, printError, warn, withSpinner } from '../shared/prompt';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import { executeFlakyActions } from '../shared/flaky-auto-actions';
import { expireQuarantine, listQuarantined, quarantineRatio } from '../shared/quarantine';
import { analyzeTestImpact, generateTestSelectionJson } from '../shared/test-impact';
import { offerPipelineFailureAnalysis } from './llm-pipeline';
import { collectTestResults as _collectTestResults } from './test-results';
import type { PipelineTriggerResult } from '../shared/types';
import Config from '../shared/config';
import JiraClient from '../shared/jira-client';
import { writeReport } from '../shared/temp-dir';
import { publishReport } from '../shared/publish';
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
} from './session-state';
import { pollPipeline } from './pipeline-handler';

export function parseBatchArgs(): {
    project?: string;
    branch?: string;
    auto?: boolean;
    publish?: string;
    runImpactedTests?: boolean;
    conservative?: boolean;
    teKey?: string;
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
    } = {};
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--project' || args[i] === '-p') && i + 1 < args.length) {
            result.project = args[++i];
        } else if ((args[i] === '--branch' || args[i] === '-b') && i + 1 < args.length) {
            result.branch = args[++i];
        } else if (args[i] === '--auto' || args[i] === '--batch') {
            result.auto = true;
        } else if (args[i] === '--publish' && i + 1 < args.length) {
            result.publish = args[++i];
        } else if (args[i] === '--run-impacted-tests') {
            result.runImpactedTests = true;
        } else if (args[i] === '--conservative') {
            result.conservative = true;
        } else if ((args[i] === '--te-key' || args[i] === '-k') && i + 1 < args.length) {
            result.teKey = args[++i];
        }
    }
    return result;
}

async function setupBatchProject(batch: ReturnType<typeof parseBatchArgs>): Promise<{
    m: import('../shared/types').GitProvider;
    branch: string;
    projectName: string;
} | null> {
    const projs = getProjects();
    if (!projs || Object.keys(projs).length === 0) {
        error('Nenhum projeto configurado.');
        return null;
    }

    const projectName = batch.project || Object.keys(projs)[0]!;
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

async function triggerAndCollectBatchPipeline(
    m: import('../shared/types').GitProvider,
    branch: string,
    projectName: string,
    teKey?: string,
): Promise<boolean> {
    const payload = { ref: branch, variables: [] as Array<{ key: string; value: string }> };
    let pipelineResult: PipelineTriggerResult | undefined;
    try {
        pipelineResult = await withSpinner('Disparando pipeline em ' + branch + '...', () =>
            m.triggerPipeline(payload),
        );
        if (pipelineResult) {
            success('Pipeline disparado: ' + String(pipelineResult.web_url));
            pushHistory('batch-pipeline', branch, 'ok');
        }
    } catch (err) {
        printError('Falha ao disparar pipeline', err);
        pushHistory('batch-pipeline', branch, 'error');
        return true;
    }

    if (!pipelineResult) return true;

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
            teKey,
        });
        if (parsed) {
            await offerPipelineFailureAnalysis(parsed);
        }
    }
    return false;
}

async function runFlakyAutoActions(projectName: string, jiraResource: JiraClient): Promise<void> {
    try {
        if (!Config.jiraBaseUrl || !Config.jiraPersonalToken) return;
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
        info('Flaky auto-actions skipping (Jira config or insufficient data).');
    }
}

function generateFlakinessDashboard(projectName: string, publishTarget?: string): void {
    if (!currentProjectName) return;
    const store = loadMetrics();
    const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
    if (projectRuns.length < 2) return;
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

    const done = await triggerAndCollectBatchPipeline(setup.m, setup.branch, setup.projectName, batch.teKey);
    if (done) return true;

    generateFlakinessDashboard(setup.projectName, batch.publish);
    if (Config.jiraBaseUrl && Config.jiraPersonalToken) {
        const jiraResource = new JiraClient(Config.jiraPersonalToken, Config.jiraBaseUrl + '/rest/api/2');
        await runFlakyAutoActions(setup.projectName, jiraResource);
    }
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
    const allEntries = listQuarantined();
    if (allEntries.length > 0) {
        const meta = quarantineRatio(allEntries.length + 10);
        info('Quarantined: ' + allEntries.length + ' test(s)');
        if (meta.warning) {
            warn(meta.warning);
        }
    }
}
