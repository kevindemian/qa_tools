import path from 'path';
import fs from 'fs';
import os from 'os';
import Config from '../shared/config';
import GitLabManager from './gitlab_manager';
import GitHubManager from './github_manager';
import { nivelarBranches } from './nivelar';
import {
    print,
    success,
    error,
    warn,
    info,
    title,
    prompt,
    confirm,
    printError,
    withSpinner,
    showSelect,
    CancelError,
} from '../shared/prompt';
import { load as loadState, update as updateState } from '../shared/state';
import { createValidateEnv, setupSigint, printSessionSummary as sharedPrintSessionSummary } from '../shared/cli_base';
import { rootLogger } from '../shared/logger';
import type { ParseResult } from '../shared/result_parser';
import { showSplash } from '../shared/splash';
import { palette } from '../shared/palette';
import { defaultOutput } from '../shared/output';
import { sleep } from '../shared/http-client';
import { SessionContext } from '../shared/session-context';
import type { GitProvider } from '../shared/types';
import {
    collectTestResults as _collectTestResults,
    createTestExecution as _createTestExecution,
    _jiraEnv as __jiraEnv,
    _resolveGlob as __resolveGlob,
    downloadTestArtifacts as _downloadTestArtifacts,
    parseTestResults as _parseTestResults,
} from './test-results';
import {
    providerLabel as _providerLabel,
    handleHelp as _handleHelp,
    handleShowHistory as _handleShowHistory,
} from './ui-helpers';

let projectId: string;
const apiToken: string = Config.gitToken || '';
const gitlabBaseUrl: string = Config.gitBaseUrl || '';
let currentProvider: 'gitlab' | 'github' = 'gitlab';
let isBusy = false;

const MSG_OPERATION_CANCELED = 'Operação cancelada.';

const sessionLog = rootLogger.child({ session: 'gitlab' });
const sessionContext = new SessionContext();

let manager: GitProvider | null = null;

const PROVIDERS_PATH = path.resolve(__dirname, '../config/providers.json');
let providersConfig: Record<string, unknown> = {};
try {
    providersConfig = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
} catch {
    rootLogger.warn('Falha ao carregar providers.json. Usando GitLab como padrao.');
}

function getProviderForProject(projectName: string): 'gitlab' | 'github' {
    const cfg = providersConfig[projectName] as Record<string, unknown> | undefined;
    return cfg?.provider === 'github' ? 'github' : 'gitlab';
}

function createManagerForProject(projectName: string, id: string): GitProvider {
    const provider = getProviderForProject(projectName);
    currentProvider = provider;
    if (provider === 'github') {
        const cfg = providersConfig[projectName] as Record<string, unknown> | undefined;
        const repo = (cfg?.repo as string) || id;
        const ghToken = Config.githubToken || Config.gitToken || '';
        const ghApiUrl = Config.githubApiUrl || 'https://api.github.com';
        return new GitHubManager(repo, ghToken, ghApiUrl) as unknown as GitProvider;
    }
    return new GitLabManager(id, apiToken, gitlabBaseUrl);
}

function pushHistory(op: string, detail: string, status: string) {
    sessionContext.pushHistory(op, detail, status);
    updateState((state) => {
        if (!state.history) state.history = [];
        (state.history as Array<unknown>).push({ op, detail, status, ts: new Date().toISOString() });
        if ((state.history as Array<unknown>).length > 50)
            (state.history as Array<unknown>) = (state.history as Array<unknown>).slice(-50);
    });
}

const validateEnv = createValidateEnv([
    { key: 'GIT_TOKEN', label: 'GIT_TOKEN (token de autenticação GitLab)', example: 'GIT_TOKEN=seu-token-aqui' },
    {
        key: 'GIT_BASE_URL',
        label: 'GIT_BASE_URL (URL base do GitLab)',
        example: 'GIT_BASE_URL=https://gitlab.seusite.com',
    },
    {
        key: 'GITHUB_TOKEN',
        label: 'GITHUB_TOKEN (token GitHub, opcional se usar GitHub)',
        example: 'GITHUB_TOKEN=seu-token-github',
    },
]);

function printSessionSummary() {
    sharedPrintSessionSummary(sessionContext.sessionCounters, sessionContext.lastOperation);
}

async function nivelarBranchesWrapper(gitlab: GitProvider) {
    await nivelarBranches(gitlab, { pushHistory });
}

function isComplete(status: string): boolean {
    return ['success', 'failed', 'canceled', 'skipped'].includes(status);
}

async function pollPipeline(m: GitProvider, pipelineId: string | number, interval = 5000, timeout = 300000) {
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

setupSigint(
    () => isBusy,
    () => printSessionSummary(),
);

const projectsPath = path.resolve(__dirname, '../config/projects.json');
let projects: Record<string, string>;
try {
    projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    const projectOverrides = Config.getAllPrefixed('PROJECT_ID_');
    for (const key of Object.keys(projects)) {
        const envKey = 'PROJECT_ID_' + key.toUpperCase();
        if (projectOverrides[envKey]) {
            projects[key] = projectOverrides[envKey];
        }
    }
} catch (err: unknown) {
    rootLogger.error(`Falha ao carregar configuração de projetos de "${projectsPath}": ${(err as Error).message}`, {
        configPath: projectsPath,
    });
    error(`Configuração inválida em "${projectsPath}". Verifique o JSON.`);
    process.exitCode = 1;
    projects = {};
}

function displayProjects() {
    title('Projetos');
    const names = Object.keys(projects);
    names.forEach((name, i) => {
        const p = getProviderForProject(name);
        const tag = p === 'github' ? ' [GH]' : ' [GL]';
        print('  ' + (i + 1) + '  ' + name + tag);
    });
    print('  ' + (names.length + 1) + '  Sair');
}

function _jiraEnv(): { base: string; token: string; xray: string } | null {
    return __jiraEnv();
}

async function downloadTestArtifacts(m: GitProvider, pipelineId: string | number) {
    return _downloadTestArtifacts(m, pipelineId);
}

function _resolveGlob(pattern: string): string | null {
    return __resolveGlob(pattern);
}

async function parseTestResults(parsed: ParseResult) {
    return _parseTestResults(parsed);
}

async function createTestExecution(
    matched: Array<{ key: string; title: string; status: 'passed' | 'failed' | 'skipped'; duration: number }>,
    csvName: string,
    jira: { base: string; token: string; xray: string },
    projectName: string,
    pipelineId: string | number,
    branch: string,
) {
    await _createTestExecution(matched, csvName, jira, projectName, pipelineId, branch, currentProvider, pushHistory);
}

async function collectTestResults(m: GitProvider, pipelineId: string | number, branch: string, projectName: string) {
    await _collectTestResults(m, pipelineId, branch, projectName, currentProvider, pushHistory);
}

async function _postPipeline(
    m: GitProvider,
    pipelineId: string | number,
    branch: string,
    projectName: string,
    pollStatus?: string,
) {
    if (confirm('Coletar resultados para Jira?', false)) {
        await collectTestResults(m, pipelineId, branch, projectName);
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

function providerLabel(): string {
    return _providerLabel(currentProvider);
}

function buildContextLine(): string {
    return providerLabel().toUpperCase() + ' TOOLS' + sessionContext.buildContextLine();
}

function buildActionChoices(): Array<Record<string, unknown>> {
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    const choices: Array<Record<string, unknown>> = [
        { type: 'separator', line: '        ' },
        { type: 'separator', line: '       PIPELINES' },
        { name: '      Disparar pipeline', value: '1' },
    ];
    if (currentProvider === 'gitlab') {
        choices.push({ name: '      Listar schedules', value: '2' }, { name: '      Disparar schedule', value: '3' });
    }
    choices.push(
        { type: 'separator', line: '        ' },
        { type: 'separator', line: '       ' + prLabel + 'S' },
        { name: '      Criar ' + prLabel, value: '4' },
        { name: '      Listar ' + prLabel + 's aprovados', value: '5' },
        { name: '      Fazer merge por ID', value: '6' },
        { name: '      Nivelar branches', value: '7' },
        { type: 'separator', line: '        ' },
        { type: 'separator', line: '       UTILITARIOS' },
        { name: '      Exportar variáveis CI/CD', value: '8' },
        { name: '      Trocar de projeto', value: '9' },
        { name: '      Voltar ao menu principal', value: '0' },
        { type: 'separator', line: '        ' },
        { name: '      /help  Ajuda', value: '/help' },
        { name: '      /history  Histórico', value: '/history' },
    );
    return choices;
}

async function displayRecentPipelines(m: GitProvider) {
    try {
        const pipelines = await m.getRecentPipelines(5);
        if (pipelines && pipelines.length > 0) {
            print('  Últimas pipelines:');
            pipelines.slice(0, 3).forEach((p: Record<string, unknown>) => {
                const id = (p.id as string) || (p.run_number as string) || '?';
                const ref = (p.ref as string) || (p.head_branch as string) || '';
                const s = (p.status as string) || (p.conclusion as string) || '?';
                const icon = s === 'success' ? '\u2713' : s === 'failed' ? '\u2717' : '~';
                print('    #' + id + ' ' + ref + ' — ' + icon + ' ' + s);
            });
            print('');
        }
    } catch {
        // non-critical
    }
}

async function handleListSchedules(ctx: SessionContext, m: GitProvider) {
    if (currentProvider !== 'gitlab') {
        warn('Opção não disponivel para GitHub.');
        return;
    }
    try {
        const schedules = await withSpinner('Buscando schedules...', () => m.getSchedules());
        if (schedules && schedules.length > 0) {
            info('Schedules encontrados:');
            schedules.forEach((s: Record<string, unknown>) => {
                print(
                    '  ID: ' +
                        (s.id as string) +
                        '  ' +
                        ((s.description as string) || 'sem descrição') +
                        '  (proxima execução: ' +
                        ((s.next_run_at as string) || 'N/A') +
                        ')',
                );
            });
            pushHistory('list-schedules', schedules.length + ' schedules', 'ok');
        } else {
            warn('Nenhum schedule encontrado.');
            pushHistory('list-schedules', 'vazio', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar schedules', err);
        pushHistory('list-schedules', 'erro', 'error');
    }
}

async function handleRunSchedule(ctx: SessionContext, m: GitProvider) {
    if (currentProvider !== 'gitlab') {
        warn('Opção não disponivel para GitHub.');
        return;
    }
    const scheduleId = prompt('ID do schedule');
    try {
        const result = await withSpinner('Disparando schedule ' + scheduleId + '...', () => m.runSchedule(scheduleId));
        if (result) {
            success('Schedule disparado: ' + scheduleId);
            pushHistory('schedule-run', scheduleId, 'ok');
        }
    } catch (err) {
        printError('Erro ao disparar schedule', err);
        pushHistory('schedule-run', scheduleId, 'error');
    }
}

async function handleCreateMR(ctx: SessionContext, m: GitProvider) {
    const sourceBranch = prompt('Branch de origem');
    const targetBranch = prompt('Branch de destino');
    const mrTitle = prompt('Titulo do ' + (currentProvider === 'github' ? 'PR' : 'MR'));
    const description = prompt('Descrição');
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const result = await withSpinner(
            'Criando ' + prLabel + ' ' + sourceBranch + ' -> ' + targetBranch + '...',
            () => m.createMergeRequest(sourceBranch, targetBranch, mrTitle, description),
        );
        if (result) {
            success(prLabel + ' criado: ' + String(result.web_url));
            pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'ok');
        }
    } catch (err) {
        printError('Falha ao criar ' + prLabel, err);
        pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'error');
    }
}

async function handleListApprovedMRs(ctx: SessionContext, m: GitProvider) {
    const status = prompt('Status dos ' + (currentProvider === 'github' ? 'PRs' : 'MRs'), { default: 'opened' });
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const results = await m.searchMergeRequests('', '', status);
        const approved: Array<Record<string, unknown>> = [];
        for (const r of results) {
            if (
                typeof m.isApproved === 'function' &&
                (await m.isApproved((r.iid as string | number) || (r.number as string | number)))
            ) {
                approved.push(r);
            }
        }
        if (approved.length > 0) {
            info(prLabel + 's aprovados:');
            approved.forEach((r) =>
                print('  ' + prLabel + ' #' + (String(r.iid) || String(r.number)) + ': ' + String(r.title)),
            );
            pushHistory('prs-approved', approved.length + ' ' + prLabel + 's', 'ok');
        } else {
            warn('Nenhum ' + prLabel + ' aprovado encontrado.');
            pushHistory('prs-approved', 'vazio', 'ok');
        }
    } catch (err) {
        printError('Erro ao listar ' + prLabel + 's aprovados', err);
        pushHistory('prs-approved', status, 'error');
    }
}

async function handleMergeMR(ctx: SessionContext, m: GitProvider) {
    const iid = prompt('ID do ' + (currentProvider === 'github' ? 'PR' : 'MR') + ' para merge');
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    try {
        const result = await withSpinner('Fazendo merge de ' + prLabel + ' #' + iid + '...', () =>
            m.acceptMergeRequest(iid),
        );
        if (result) {
            success('Merge realizado: ' + String(result.web_url));
            pushHistory('pr-merge', iid, 'ok');
        }
    } catch (err) {
        printError('Falha ao fazer merge', err);
        pushHistory('pr-merge', iid, 'error');
    }
}

async function handleExportVariables(ctx: SessionContext, m: GitProvider) {
    if (!confirm('Exportar TODAS as variáveis CI/CD (incluindo secrets)?', false)) {
        warn(MSG_OPERATION_CANCELED);
        return;
    }
    try {
        const variables = await withSpinner('Buscando variáveis CI/CD...', () => m.getCICDVariables());
        if (variables) {
            const envContent = variables
                .map((v: Record<string, unknown>) => {
                    const safeValue = ((v.value as string) || '').replace(/\n/g, '\\n');
                    if (safeValue.includes('=')) {
                        return (v.key as string) + '="' + safeValue.replace(/"/g, '\\"') + '"';
                    }
                    return (v.key as string) + '=' + safeValue;
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

async function handleChangeProject(ctx: SessionContext, m: GitProvider, names: string[]) {
    displayProjects();
    const newChoice = prompt('Escolha um projeto', { hint: '1-' + names.length });
    const newIdx = parseInt(newChoice, 10);
    if (!isNaN(newIdx) && newIdx >= 1 && newIdx <= names.length) {
        const newName = names[newIdx - 1];
        projectId = projects[newName];
        manager = createManagerForProject(newName, projectId);
        updateState((s) => {
            s.lastProject = newName;
        });
        success('Projeto alterado para: ' + newName + ' (' + getProviderForProject(newName) + ')');
        const newM = manager;
        await displayRecentPipelines(newM);
        pushHistory('trocar-projeto', newName, 'ok');
    } else {
        warn('Opção inválida.');
    }
}

async function handleTriggerPipeline(ctx: SessionContext, m: GitProvider, projectName: string) {
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
            updateState((s) => {
                delete s.pendingPipeline;
            });
            const pollResult = await pollPipeline(m, id);
            isBusy = false;
            const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
            info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
            if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
                await _postPipeline(m, id, currentBranch, projectName);
            }
            await displayRecentPipelines(m);
            return;
        }
        updateState((s) => {
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

    let pipelineResult: Record<string, unknown> | undefined;
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
            updateState((s) => {
                s.pendingPipeline = { branch: currentBranch, pipelineId: id, projectName };
            });
            isBusy = true;
            info('Aguardando pipeline #' + id + '...');
            const pollResult = await pollPipeline(m, id);
            isBusy = false;
            const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
            info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);
            updateState((s) => {
                delete s.pendingPipeline;
            });
            if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped') {
                await _postPipeline(m, id, currentBranch, projectName);
            }
        }
    }
    await displayRecentPipelines(m);
}

async function handleHelp() {
    await _handleHelp();
}

async function handleShowHistory() {
    await _handleShowHistory();
}

function _selectProject(): { projectName: string; names: string[] } {
    const state = loadState();
    displayProjects();
    const names = Object.keys(projects!);
    const firstDefault = (state.lastProject as string) || '';
    const firstChoice = prompt('Escolha um projeto', {
        hint: '1-' + names.length,
        default: firstDefault,
    });
    const firstIdx = !firstChoice.trim() ? names.indexOf(firstDefault) + 1 : parseInt(firstChoice, 10);
    if (isNaN(firstIdx) || firstIdx < 1 || firstIdx > names.length) {
        error('Projeto inválido.');
        process.exitCode = 1;
        throw new Error('Invalid project');
    }
    const projectName = names[firstIdx - 1];
    projectId = projects![projectName];
    updateState((s) => {
        s.lastProject = projectName;
    });
    success('Projeto selecionado: ' + projectName + ' (' + getProviderForProject(projectName) + ')');
    return { projectName, names };
}

async function _promptChoice(stateHint: string): Promise<string> {
    if (process.stdout.isTTY && !Config.quiet) {
        const ctx = buildContextLine();
        const ok = sessionContext.sessionCounters.filter((c) => c.status === 'ok').length;
        const err = sessionContext.sessionCounters.filter((c) => c.status === 'error').length;
        const headerLines: string[] = [];
        if (sessionContext.sessionCounters.length > 0) {
            headerLines.push(
                `   ${palette.muted(sessionContext.sessionCounters.length + ' operações')}  ·  ${palette.green('' + ok + ' ✓')}${err > 0 ? '  ' + palette.red('' + err + ' ✗') : ''}`,
            );
        }
        if (headerLines.length > 0) {
            defaultOutput.box(headerLines, { border: 'double', padding: 1, title: 'QA Tools · ' + ctx, width: 80 });
        }

        const stateHint2 =
            loadState().lastChoice && (loadState().lastChoice as string) !== '0'
                ? (loadState().lastChoice as string)
                : undefined;
        return showSelect('      Escolha uma opção', buildActionChoices(), {
            default: stateHint2,
            pageSize: (process.stdout.rows || 24) - 4,
        });
    }
    const nonTtyLines = buildActionChoices()
        .filter((c: Record<string, unknown>) => c.name)
        .map((c: Record<string, unknown>) => '  ' + String(c.name));
    nonTtyLines.unshift('');
    nonTtyLines.push('  /help   Ajuda');
    nonTtyLines.push('  /exit   Voltar ao menu principal');
    nonTtyLines.push('');
    defaultOutput.box(nonTtyLines, {
        border: 'double',
        padding: 1,
        title: 'QA Tools · ' + providerLabel().toUpperCase() + ' TOOLS',
    });
    const choice = prompt('Escolha uma opção', { hint: stateHint });
    const resolved =
        !choice.trim() && (loadState().lastChoice as string) && (loadState().lastChoice as string) !== '0'
            ? (loadState().lastChoice as string)
            : choice;
    if (resolved !== choice) info('Repetindo última opção: ' + resolved);
    return resolved;
}

const ACTION_HANDLERS: Record<string, (m: GitProvider, pn: string, ns: string[]) => Promise<boolean>> = {
    '1': (m, pn) => handleTriggerPipeline(sessionContext, m, pn).then(() => false),
    '2': (m) => handleListSchedules(sessionContext, m).then(() => false),
    '3': (m) => handleRunSchedule(sessionContext, m).then(() => false),
    '4': (m) => handleCreateMR(sessionContext, m).then(() => false),
    '5': (m) => handleListApprovedMRs(sessionContext, m).then(() => false),
    '6': (m) => handleMergeMR(sessionContext, m).then(() => false),
    '7': (m) => nivelarBranchesWrapper(m).then(() => false),
    '8': (m) => handleExportVariables(sessionContext, m).then(() => false),
    '9': (m, _pn, ns) => handleChangeProject(sessionContext, m, ns).then(() => false),
};

function _handleExit(): boolean {
    title('Até logo!');
    printSessionSummary();
    if (sessionContext.sessionCounters.some((c) => c.status === 'error')) process.exitCode = 1;
    return true;
}

async function _dispatchAction(
    finalChoice: string,
    m: GitProvider,
    projectName: string,
    names: string[],
): Promise<boolean> {
    const cmd = finalChoice.trim().toLowerCase();
    if (cmd === '/h' || cmd === '/help') {
        await handleHelp();
        return false;
    }
    if (cmd === '/history') {
        await handleShowHistory();
        return false;
    }
    if (cmd === '/docs' || cmd === '/d') {
        warn('Documentação disponível apenas no módulo Jira.');
        return false;
    }
    if (cmd === '/back' || cmd === '/menu') {
        return false;
    }
    if (finalChoice === '0' || cmd === '/exit' || cmd === '/sair') return _handleExit();

    const handlerFn = ACTION_HANDLERS[finalChoice];
    if (handlerFn) return handlerFn(m, projectName, names);
    warn('Opção inválida.');
    return false;
}

async function main() {
    if (!projects) {
        process.exitCode = 1;
        return;
    }
    validateEnv();
    await showSplash();
    sessionLog.info('Sessão iniciada');

    const { projectName, names } = _selectProject();
    manager = createManagerForProject(projectName, projectId);
    const m = manager;

    await displayRecentPipelines(m);

    const stateHint =
        loadState().lastChoice && (loadState().lastChoice as string) !== '0'
            ? 'Enter = ' + (loadState().lastChoice as string)
            : '0-9';

    while (true) {
        console.clear();
        const finalChoice = await _promptChoice(stateHint);
        updateState((s) => {
            s.lastChoice = finalChoice;
        });
        try {
            const shouldExit = await _dispatchAction(finalChoice, m, projectName, names);
            if (shouldExit) return;
        } catch (e) {
            if (e instanceof CancelError) continue;
            throw e;
        }
    }
}

process.on('unhandledRejection', (reason: unknown) => {
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
    process.exitCode = 1;
});

main().catch((err) => {
    printError('Erro inesperado', err);
    printSessionSummary();
    process.exitCode = 1;
});

export = {
    nivelarBranchesWrapper,
    isComplete,
    providerLabel,
    buildActionChoices,
    getProviderForProject,
    _jiraEnv,
    _resolveGlob,
    pushHistory,
    pollPipeline,
    handleListSchedules,
    handleRunSchedule,
    handleCreateMR,
    handleListApprovedMRs,
    handleMergeMR,
    handleExportVariables,
    handleChangeProject,
    handleTriggerPipeline,
    handleHelp,
    handleShowHistory,
    parseTestResults,
    downloadTestArtifacts,
    createTestExecution,
    collectTestResults,
    printSessionSummary,
    displayProjects,
    displayRecentPipelines,
};
