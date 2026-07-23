/** Pipeline handler — monitor CI/CD status, parse results, and offer failure analysis. */
import { print, success, warn, info, title, prompt, confirm, printError, withSpinner } from '../shared/ui/prompt.js';
import { rootLogger } from '../shared/logger.js';
import { load as loadState, update as updateState } from '../shared/state.js';
import { sleep } from '../shared/infra/http-client.js';
import type { ParseResult } from '../shared/result_parser.js';
import type { PipelineTriggerResult, StateContainer } from '../shared/types.js';
import type { GitProvider } from '../shared/types.js';
import { writeEphemeral } from '../shared/infra/temp-dir.js';
import { getHeadSha } from '../shared/ci/git-sha.js';
import { getDataHub } from '../shared/data-hub/global-hub.js';
import { detectStoreBackend } from '../shared/infra/store-backend.js';
import {
    collectTestResults as _collectTestResults,
    createTestExecution as _createTestExecution,
    type CreateTestExecutionOptions,
    _jiraEnv as __jiraEnv,
    _resolveGlob as __resolveGlob,
    downloadTestArtifacts as _downloadTestArtifacts,
    parseTestResults as _parseTestResults,
} from './test-results.js';
import { offerPipelineFailureAnalysis } from './llm-pipeline.js';
import { handleBugCreation } from './pipeline-jira.js';
import JiraClient from '../shared/jira/jira-client.js';
import type { JiraMode } from '../shared/jira/jira-auth.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import { currentProvider, pushHistory, setIsBusy, MSG_OPERATION_CANCELED } from './session-state.js';
import { confirmDestructiveAction } from '../shared/ui/cli_base.js';

const PIPELINE_POLL_INTERVAL_MS = 5000;
const PIPELINE_POLL_TIMEOUT_MS = 300000;

export function isComplete(status: string): boolean {
    return ['success', 'failed', 'canceled', 'skipped'].includes(status);
}

export async function pollPipeline(
    m: GitProvider,
    pipelineId: string | number,
    interval = PIPELINE_POLL_INTERVAL_MS,
    timeout = PIPELINE_POLL_TIMEOUT_MS,
): Promise<{ status: string; web_url: string }> {
    return withSpinner('Aguardando pipeline #' + pipelineId, async () => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const p = await m.getPipeline(pipelineId);
            if (!p) {
                await sleep(interval);
                continue;
            }
            const status = (p.status as string) || (p.state as string) || '';
            if (isComplete(status)) {
                return { status, web_url: (p.web_url as string) || '' };
            }
            await sleep(interval);
        }
        return { status: 'timeout', web_url: '' };
    });
}

export function _jiraEnv(): { base: string; token: string; xray: string; mode: JiraMode } | null {
    return __jiraEnv();
}

export async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number): Promise<ParseResult | null> {
    return _downloadTestArtifacts(m, pipelineId);
}

export function _resolveGlob(pattern: string): string | null {
    return __resolveGlob(pattern);
}

export async function parseTestResults(parsed: ParseResult): Promise<{
    matched: Array<{ key: string; title: string; status: 'passed' | 'failed' | 'skipped'; duration: number }>;
    unmatched: Array<{ title: string; state: string }>;
    csvName: string;
} | null> {
    return _parseTestResults(parsed);
}

export async function createTestExecution(
    opts: CreateTestExecutionOptions & {
        currentProvider: 'gitlab' | 'github';
        pushHistory: (op: string, detail: string, status: string) => void;
    },
): Promise<void> {
    await _createTestExecution({
        ...opts,
        currentProvider,
        pushHistory,
    });
}

export async function collectTestResults(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    extra: { jiraResource: JiraClient; linkManager: JiraLinkManager; jiraBaseUrl: string },
): Promise<ParseResult | null> {
    return _collectTestResults({ m, pipelineId, branch, projectName, currentProvider, pushHistory, ...extra });
}

async function handleQuickMerge(m: GitProvider, branch: string, pollStatus: string | undefined): Promise<void> {
    if (pollStatus !== 'success') return;
    if (!confirm('Criar merge request de ' + branch + ' para?', false)) return;
    const target = prompt('Branch de destino', { default: 'main' });
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    const mrTitle = prompt('Titulo do ' + prLabel, { default: 'chore: merge ' + branch + ' -> ' + target });
    try {
        const mr = await withSpinner('Criando ' + prLabel + ' ' + branch + ' -> ' + target + '...', () =>
            m.createMergeRequest(branch, target, mrTitle, ''),
        );
        if (mr) {
            success(prLabel + ' criado: ' + String(mr.web_url));
            pushHistory('quick-mr', branch + '->' + target, 'ok');
            await tryAcceptMerge(m, mr.iid as string | number, prLabel);
        }
    } catch (err) {
        printError('Falha ao criar ' + prLabel, err);
        pushHistory('quick-mr', branch + '->' + target, 'error');
    }
}

async function tryAcceptMerge(m: GitProvider, iid: string | number, prLabel: string): Promise<void> {
    if (!confirmDestructiveAction('merge em ' + prLabel + ' #' + String(iid))) return;
    try {
        const mergeResult = await withSpinner('Fazendo merge de ' + prLabel + ' #' + String(iid) + '...', () =>
            m.acceptMergeRequest(iid),
        );
        if (mergeResult) {
            success('Merge realizado: ' + String(mergeResult.web_url));
            pushHistory('quick-merge', String(iid), 'ok');
        }
    } catch (err) {
        printError('Falha ao fazer merge', err);
        pushHistory('quick-merge', String(iid), 'error');
    }
}

async function _postPipeline(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    jiraResource: JiraClient,
    jiraBaseUrl: string,
    linkManager: JiraLinkManager,
    pollStatus?: string,
): Promise<void> {
    let parsed: ParseResult | null = null;
    if (confirm('Coletar resultados para Jira?', false)) {
        parsed = await collectTestResults(m, pipelineId, branch, projectName, {
            jiraResource,
            linkManager,
            jiraBaseUrl,
        });
    }
    if (parsed) {
        const sha = getHeadSha() || 'no-sha';
        const backend = detectStoreBackend();
        const store = getDataHub();
        store.saveReport(sha, parsed.tests);
        store.put(sha, {
            sha,
            project: projectName,
            timestamp: Date.now(),
            tool: '',
            branch,
            total: parsed.stats.total,
            passed: parsed.stats.passed,
            failed: parsed.stats.failed,
            skipped: parsed.stats.skipped,
        });
        store.flush(`cache: pipeline #${pipelineId}`);
        await offerPipelineFailureAnalysis(parsed, (analysisReport) => {
            return handleBugCreation(parsed, pipelineId, branch, analysisReport, jiraResource, backend);
        });
    }
    await handleQuickMerge(m, branch, pollStatus);
}

async function resumePendingPipeline(
    m: GitProvider,
    projectName: string,
    jiraResource: JiraClient,
    jiraBaseUrl: string,
    linkManager: JiraLinkManager,
): Promise<string | null> {
    const savedState = loadState();
    const pending = savedState['pendingPipeline'] as
        { branch?: string; pipelineId?: string; projectName?: string } | undefined;
    if (!pending || pending.projectName !== projectName || !pending.pipelineId) return null;

    if (
        !confirm(
            'Pipeline pendente encontrada: #' +
                pending.pipelineId +
                ' (' +
                pending.branch +
                '). Continuar deste ponto?',
            true,
        )
    ) {
        updateState((s: StateContainer) => {
            delete s['pendingPipeline'];
        });
        return null;
    }

    const branch = pending.branch || '';
    const id = pending.pipelineId;
    info('Retomando pipeline #' + id + '...');
    updateState((s: StateContainer) => {
        delete s['pendingPipeline'];
    });
    const pollResult = await pollPipeline(m, id);
    setIsBusy(false);
    const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
    info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
    if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
        await _postPipeline(m, id, branch, projectName, jiraResource, jiraBaseUrl, linkManager, pollResult.status);
    }
    return branch;
}

async function buildPipelinePayload(
    m: GitProvider,
    projectName: string,
): Promise<{
    branch: string;
    payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string };
} | null> {
    const branch = prompt('Branch para disparar pipeline');
    const branchCheck = await m.getBranch(branch);
    if (!branchCheck) {
        warn('Branch "' + branch + '" não encontrada.');
        pushHistory('pipeline', 'branch-not-found: ' + branch, 'error');
        return null;
    }
    const payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string } = {
        ref: branch,
        variables: [],
    };

    if (currentProvider === 'github') {
        const wfId = prompt('Workflow ID (deixe vazio para auto-detectar)');
        if (wfId.trim()) payload.workflow_id = wfId.trim();
    }

    const addVars = confirm('Adicionar variáveis?');
    if (addVars) {
        const varsInput = prompt('Variáveis (chave=valor separadas por vírgula)');
        varsInput.split(',').forEach((v) => {
            const [key, ...rest] = v.trim().split('=');
            if (key) payload.variables.push({ key, value: rest.join('=') });
        });
    }

    title('Preview');
    print('  Projeto: ' + projectName);
    print('  Branch: ' + branch);
    print('  Variáveis: ' + payload.variables.length);
    if (!confirmDestructiveAction('disparo de pipeline')) {
        warn(MSG_OPERATION_CANCELED);
        return null;
    }

    return { branch, payload };
}

async function triggerAndPollPipeline(
    m: GitProvider,
    branch: string,
    payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string },
    projectName: string,
    jiraResource: JiraClient,
    jiraBaseUrl: string,
    linkManager: JiraLinkManager,
): Promise<void> {
    let pipelineResult: PipelineTriggerResult | undefined;
    try {
        pipelineResult = await withSpinner('Disparando pipeline em ' + branch + '...', () =>
            m.triggerPipeline(payload),
        );
        if (pipelineResult) {
            success('Pipeline disparado: ' + String(pipelineResult.web_url));
            pushHistory('pipeline', branch, 'ok');
        }
    } catch (err) {
        rootLogger.warn(`[pipeline-handler] Falha ao disparar pipeline: ${String(err)}`);
        printError('Falha ao disparar pipeline', err);
        pushHistory('pipeline', branch, 'error');
        return;
    }

    if (!pipelineResult || !confirm('Aguardar conclusao da pipeline?', true)) return;

    const id = (pipelineResult.id as string) || (pipelineResult.run_number as string) || '';
    if (!id) return;

    updateState((s: StateContainer) => {
        s['pendingPipeline'] = { branch, pipelineId: id, projectName };
    });
    setIsBusy(true);
    info('Aguardando pipeline #' + id + '...');
    const pollResult = await pollPipeline(m, id);
    setIsBusy(false);
    const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
    info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
    updateState((s: StateContainer) => {
        delete s['pendingPipeline'];
    });
    if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
        await _postPipeline(m, id, branch, projectName, jiraResource, jiraBaseUrl, linkManager, pollResult.status);
    }
}

export async function handleTriggerPipeline(m: GitProvider, projectName: string): Promise<void> {
    try {
        const jira = __jiraEnv();
        if (!jira) {
            warn('Variáveis JIRA não configuradas. Defina JIRA_BASE_URL, JIRA_PERSONAL_TOKEN e XRAY_BASE_URL.');
        }

        let jiraResource: JiraClient | undefined;
        let linkManager: JiraLinkManager | undefined;
        let jiraBaseUrl: string | undefined;
        if (jira) {
            jiraResource = new JiraClient(jira.token, jira.base + '/rest/api/2', jira.mode);
            linkManager = new JiraLinkManager(jiraResource);
            jiraBaseUrl = jira.base;
        }

        const resumed = await resumePendingPipeline(
            m,
            projectName,
            jiraResource as JiraClient,
            jiraBaseUrl as string,
            linkManager as JiraLinkManager,
        );
        if (resumed !== null) return;

        const built = await buildPipelinePayload(m, projectName);
        if (!built) return;

        await triggerAndPollPipeline(
            m,
            built.branch,
            built.payload,
            projectName,
            jiraResource as JiraClient,
            jiraBaseUrl as string,
            linkManager as JiraLinkManager,
        );
    } catch (err) {
        printError('Falha ao disparar pipeline', err);
    }
}

export async function handleExportVariables(m: GitProvider): Promise<void> {
    if (!confirmDestructiveAction('exportar TODAS as variáveis CI/CD')) {
        warn(MSG_OPERATION_CANCELED);
        return;
    }
    try {
        const variables = await withSpinner('Buscando variáveis CI/CD...', () => m.getCICDVariables());
        if (variables) {
            const envContent = variables
                .map((v: { key: string; value: string }) => {
                    const safeValue = (v.value || '').replace(/\n/g, '\\n');
                    if (safeValue.includes('=')) {
                        return v.key + '="' + safeValue.replace(/"/g, '\\"') + '"';
                    }
                    return v.key + '=' + safeValue;
                })
                .join('\n');

            const tmpPath = writeEphemeral('vars', 'qa-vars-' + process.pid + '.env', envContent);
            success('Variáveis exportadas (' + variables.length + '):');
            print('');
            print(envContent);
            print('');
            warn('As variáveis acima foram exibidas no terminal e NÃO foram salvas em disco.');
            info('Uma copia temporaria foi salva em ' + tmpPath + ' (modo 600, apenas leitura)');
            info('Ela sera removida ao encerrar esta sessão. Não compartilhe este arquivo.');
            pushHistory('export-vars', variables.length + ' variáveis', 'ok');
        }
    } catch (err) {
        printError('Falha ao buscar variáveis CI/CD', err);
        pushHistory('export-vars', 'erro', 'error');
    }
}
