import fs from 'fs';
import path from 'path';
import { success, error, info, printError, withSpinner } from '../shared/prompt';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import { generateFlakinessHtml } from '../shared/flakiness-dashboard';
import { offerPipelineFailureAnalysis } from './llm-pipeline';
import { collectTestResults as _collectTestResults } from './test-results';
import type { PipelineTriggerResult } from '../shared/types';
import {
    projects,
    currentProjectName,
    currentProvider,
    pushHistory,
    printSessionSummary,
    createManagerForProject,
    setCurrentProjectName,
    setProjectId,
    setManager,
} from './session-state';
import { pollPipeline } from './pipeline-handler';

export function parseBatchArgs(): { project?: string; branch?: string; auto?: boolean } {
    const args = process.argv.slice(2);
    const result: { project?: string; branch?: string; auto?: boolean } = {};
    for (let i = 0; i < args.length; i++) {
        if ((args[i] === '--project' || args[i] === '-p') && i + 1 < args.length) {
            result.project = args[++i];
        } else if ((args[i] === '--branch' || args[i] === '-b') && i + 1 < args.length) {
            result.branch = args[++i];
        } else if (args[i] === '--auto' || args[i] === '--batch') {
            result.auto = true;
        }
    }
    return result;
}

export async function tryBatchMode(): Promise<boolean> {
    const batch = parseBatchArgs();
    if (!batch.auto && !batch.project && !batch.branch) return false;

    if (batch.auto) {
        process.env.AUTO_CONFIRM = 'true';
    }

    if (!projects) {
        error('Nenhum projeto configurado.');
        return true;
    }

    const projectName = batch.project || Object.keys(projects)[0];
    if (!projects[projectName]) {
        error('Projeto "' + projectName + '" não encontrado em config/projects.json.');
        return true;
    }

    setCurrentProjectName(projectName);
    setProjectId(projects[projectName]);
    const m = createManagerForProject(projectName, projects[projectName]);
    setManager(m);

    const branch = batch.branch || 'main';
    const branchCheck = await m.getBranch(branch);
    if (!branchCheck) {
        error('Branch "' + branch + '" não encontrada em ' + projectName + '.');
        return true;
    }

    info('Modo batch: ' + projectName + ' @ ' + branch);

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
        const parsed = await _collectTestResults(m, pipelineId, branch, projectName, currentProvider, pushHistory);
        if (parsed) {
            await offerPipelineFailureAnalysis(parsed);
        }
    }

    if (currentProjectName) {
        const store = loadMetrics();
        const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
        if (projectRuns.length >= 2) {
            const flaky = calculateFlakiness({ runs: projectRuns }, 2);
            const html = generateFlakinessHtml(flaky, 'Flakiness — ' + currentProjectName);
            const outPath = path.resolve(__dirname, '../flakiness-' + currentProjectName + '.html');
            fs.writeFileSync(outPath, html, 'utf8');
            success('Dashboard de flakiness gerado: ' + outPath);
        }
    }

    printSessionSummary();
    return true;
}
