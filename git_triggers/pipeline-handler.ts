import path from 'path';
import os from 'os';
import fs from 'fs';
import { print, success, warn, info, title, prompt, confirm, printError, withSpinner } from '../shared/prompt';
import { load as loadState, update as updateState } from '../shared/state';
import { sleep } from '../shared/http-client';
import { SessionContext } from '../shared/session-context';
import type { ParseResult } from '../shared/result_parser';
import type { PipelineTriggerResult } from '../shared/types';
import type { GitProvider } from '../shared/types';
import {
    collectTestResults as _collectTestResults,
    createTestExecution as _createTestExecution,
    _jiraEnv as __jiraEnv,
    _resolveGlob as __resolveGlob,
    downloadTestArtifacts as _downloadTestArtifacts,
    parseTestResults as _parseTestResults,
} from './test-results';
import { offerPipelineFailureAnalysis } from './llm-pipeline';
import { currentProvider, pushHistory, setIsBusy, MSG_OPERATION_CANCELED } from './session-state';

export function isComplete(status: string): boolean {
    return ['success', 'failed', 'canceled', 'skipped'].includes(status);
}

export async function pollPipeline(m: GitProvider, pipelineId: string | number, interval = 5000, timeout = 300000) {
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

export function _jiraEnv(): { base: string; token: string; xray: string } | null {
    return __jiraEnv();
}

export async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number) {
    return _downloadTestArtifacts(m, pipelineId);
}

export function _resolveGlob(pattern: string): string | null {
    return __resolveGlob(pattern);
}

export async function parseTestResults(parsed: ParseResult) {
    return _parseTestResults(parsed);
}

export async function createTestExecution(
    matched: Array<{ key: string; title: string; status: 'passed' | 'failed' | 'skipped'; duration: number }>,
    csvName: string,
    jira: { base: string; token: string; xray: string },
    projectName: string,
    pipelineId: string | number,
    branch: string,
) {
    await _createTestExecution(matched, csvName, jira, projectName, pipelineId, branch, currentProvider, pushHistory);
}

export async function collectTestResults(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
): Promise<ParseResult | null> {
    return _collectTestResults(m, pipelineId, branch, projectName, currentProvider, pushHistory);
}

async function _postPipeline(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    pollStatus?: string,
) {
    let parsed: ParseResult | null = null;
    if (confirm('Coletar resultados para Jira?', false)) {
        parsed = await collectTestResults(m, pipelineId, branch, projectName);
    }
    if (parsed) {
        await offerPipelineFailureAnalysis(parsed);
    }
    if (pollStatus !== 'success') return;
    if (confirm('Criar merge request de ' + branch + ' para?', false)) {
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

                if (confirm('Fazer merge de ' + branch + ' em ' + target + ' agora?', false)) {
                    try {
                        const mergeResult = await withSpinner(
                            'Fazendo merge de ' + prLabel + ' #' + String(mr.iid) + '...',
                            () => m.acceptMergeRequest(mr.iid as string | number),
                        );
                        if (mergeResult) {
                            success('Merge realizado: ' + String(mergeResult.web_url));
                            pushHistory('quick-merge', String(mr.iid), 'ok');
                        }
                    } catch (err) {
                        printError('Falha ao fazer merge', err);
                        pushHistory('quick-merge', String(mr.iid), 'error');
                    }
                }
            }
        } catch (err) {
            printError('Falha ao criar ' + prLabel, err);
            pushHistory('quick-mr', branch + '->' + target, 'error');
        }
    }
}

export async function handleTriggerPipeline(ctx: SessionContext, m: GitProvider, projectName: string) {
    const savedState = loadState();
    const pending = savedState.pendingPipeline as
        | { branch?: string; pipelineId?: string; projectName?: string }
        | undefined;
    let currentBranch = '';

    if (pending && pending.projectName === projectName && pending.pipelineId) {
        if (
            confirm(
                'Pipeline pendente encontrada: #' +
                    pending.pipelineId +
                    ' (' +
                    pending.branch +
                    '). Continuar deste ponto?',
                true,
            )
        ) {
            currentBranch = pending.branch || '';
            const id = pending.pipelineId;
            info('Retomando pipeline #' + id + '...');
            updateState((s: Record<string, unknown>) => {
                delete s.pendingPipeline;
            });
            const pollResult = await pollPipeline(m, id);
            setIsBusy(false);
            const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
            info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
            if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
                await _postPipeline(m, id, currentBranch, projectName);
            }
            return;
        }
        updateState((s: Record<string, unknown>) => {
            delete s.pendingPipeline;
        });
    }

    currentBranch = prompt('Branch para disparar pipeline');
    const branchCheck = await m.getBranch(currentBranch);
    if (!branchCheck) {
        warn('Branch "' + currentBranch + '" não encontrada.');
        pushHistory('pipeline', 'branch-not-found: ' + currentBranch, 'error');
        return;
    }
    const payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string } = {
        ref: currentBranch,
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
    print('  Branch: ' + currentBranch);
    print('  Variáveis: ' + payload.variables.length);
    if (!confirm('Confirmar disparo de pipeline?')) {
        warn(MSG_OPERATION_CANCELED);
        return;
    }

    let pipelineResult: PipelineTriggerResult | undefined;
    try {
        pipelineResult = await withSpinner('Disparando pipeline em ' + currentBranch + '...', () =>
            m.triggerPipeline(payload),
        );
        if (pipelineResult) {
            success('Pipeline disparado: ' + String(pipelineResult.web_url));
            pushHistory('pipeline', currentBranch, 'ok');
        }
    } catch (err) {
        printError('Falha ao disparar pipeline', err);
        pushHistory('pipeline', currentBranch, 'error');
        return;
    }

    if (pipelineResult && confirm('Aguardar conclusao da pipeline?', true)) {
        const id = (pipelineResult.id as string) || (pipelineResult.run_number as string) || '';
        if (id) {
            updateState((s: Record<string, unknown>) => {
                s.pendingPipeline = { branch: currentBranch, pipelineId: id, projectName };
            });
            setIsBusy(true);
            info('Aguardando pipeline #' + id + '...');
            const pollResult = await pollPipeline(m, id);
            setIsBusy(false);
            const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
            info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
            updateState((s: Record<string, unknown>) => {
                delete s.pendingPipeline;
            });
            if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
                await _postPipeline(m, id, currentBranch, projectName);
            }
        }
    }
}

export async function handleExportVariables(ctx: SessionContext, m: GitProvider) {
    if (!confirm('Exportar TODAS as variáveis CI/CD (incluindo secrets)?', false)) {
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

            const tmpPath = path.join(os.tmpdir(), 'qa-vars-' + process.pid + '.env');
            fs.writeFileSync(tmpPath, envContent, { mode: 0o600, encoding: 'utf8' });
            success('Variáveis exportadas (' + variables.length + '):');
            print('');
            print(envContent);
            print('');
            warn('As variáveis acima foram exibidas no terminal e NÃO foram salvas em disco.');
            info('Uma copia temporaria foi salva em ' + tmpPath + ' (modo 600, apenas leitura)');
            info('Ela sera removida ao encerrar esta sessão. Não compartilhe este arquivo.');
            fs.unlinkSync(tmpPath);
            pushHistory('export-vars', variables.length + ' variáveis', 'ok');
        }
    } catch (err) {
        printError('Falha ao buscar variáveis CI/CD', err);
        pushHistory('export-vars', 'erro', 'error');
    }
}
