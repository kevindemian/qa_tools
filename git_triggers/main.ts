/** git_triggers entry point — validates environment, shows splash, and dispatches to sub-handlers. */
import { pushBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs';
import { createValidateEnv, offerEnvSetup, setupSigint } from '../shared/cli_base';
import Config from '../shared/config';
import { showSplash } from '../shared/splash';
import { palette } from '../shared/palette';
import { defaultOutput } from '../shared/output';
import { rootLogger } from '../shared/logger';
import {
    CancelError,
    success,
    warn,
    info,
    title,
    prompt,
    showSelect,
    printError,
    confirm as promptConfirm,
} from '../shared/prompt';
import { load as loadState, update as updateState } from '../shared/state';
import type { GitProvider, JsonObject, StateContainer } from '../shared/types';
import {
    sessionLog,
    sessionContext,
    isBusy,
    providerLabel,
    buildActionChoices,
    displayProjects,
    displayRecentPipelines,
    printSessionSummary,
    getProviderForProject,
    createManagerForProject,
    pushHistory,
    setCurrentProjectName,
    setProjectId,
    setManager,
    projectId,
    getProjects,
    clearProjectCache,
} from './session-state';
import {
    handleTriggerPipeline,
    handleExportVariables,
    isComplete,
    pollPipeline,
    _jiraEnv,
    _resolveGlob,
    downloadTestArtifacts,
    parseTestResults,
    createTestExecution,
    collectTestResults,
} from './pipeline-handler';
import { nivelarBranchesWrapper, handleCreateMR, handleListApprovedMRs, handleMergeMR } from './mr-handler';
import { ensureDirs, registerCleanup } from '../shared/temp-dir';
import {
    handleListSchedules,
    handleRunSchedule,
    handleChangeProject,
    handleFlakinessDashboard,
} from './schedule-handler';
import { tryBatchMode, parseBatchArgs } from './batch-mode';
import { handleHelp as _handleHelp, handleShowHistory as _handleShowHistory } from './ui-helpers';
import { handleSetupWizard as _handleSetupWizard } from './case00-handler';
import { showDocs } from '../shared/show-docs';

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

async function handleHelp(): Promise<void> {
    await _handleHelp();
}

async function handleShowHistory(): Promise<void> {
    await _handleShowHistory();
}

function buildContextLine(): string {
    return providerLabel().toUpperCase() + ' TOOLS' + sessionContext.buildContextLine();
}

function _selectProject(): { projectName: string | null; names: string[] } {
    const state = loadState();
    displayProjects();
    const names = Object.keys(getProjects());
    const firstDefault = (state.lastProject as string) || '';
    const firstChoice = prompt('Escolha um projeto', {
        hint: '1-' + names.length,
        default: firstDefault,
    });
    const firstIdx = !firstChoice.trim() ? names.indexOf(firstDefault) + 1 : parseInt(firstChoice, 10);
    if (isNaN(firstIdx) || firstIdx < 1 || firstIdx > names.length) {
        warn('Projeto inválido.');
        return { projectName: null, names };
    }
    const projectName = names[firstIdx - 1]!;
    setCurrentProjectName(projectName);
    setProjectId(getProjects()[projectName]!);
    updateState((s: StateContainer) => {
        s.lastProject = projectName;
    });
    success('Projeto selecionado: ' + projectName + ' (' + getProviderForProject(projectName) + ')');
    return { projectName, names };
}

async function _promptChoice(stateHint: string): Promise<string> {
    if (process.stdout.isTTY && !Config.get('quiet')) {
        const ctx = buildContextLine();
        const ok = sessionContext.sessionCounters.filter((c: { status: string }) => c.status === 'ok').length;
        const err = sessionContext.sessionCounters.filter((c: { status: string }) => c.status === 'error').length;
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
        .filter((c: JsonObject) => c.name)
        .map((c: JsonObject) => '  ' + String(c.name));
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

function withErrorHandling(
    handler: (m: GitProvider, pn: string, ns: string[]) => Promise<unknown>,
): (m: GitProvider, pn: string, ns: string[]) => Promise<boolean> {
    return (m, pn, ns) =>
        handler(m, pn, ns).then(
            () => false,
            (err) => {
                printError('Handler error', err);
                return false;
            },
        );
}

const ACTION_HANDLERS: Record<string, (m: GitProvider, pn: string, ns: string[]) => Promise<boolean>> = {
    '00': () => _handleSetupWizard(),
    w: () => _handleSetupWizard(),
    '1': withErrorHandling((m, pn) => handleTriggerPipeline(m, pn)),
    '2': withErrorHandling((m) => handleListSchedules(m)),
    '3': withErrorHandling((m) => handleRunSchedule(m)),
    '4': withErrorHandling((m) => handleCreateMR(m)),
    '5': withErrorHandling((m) => handleListApprovedMRs(m)),
    '6': withErrorHandling((m) => handleMergeMR(m)),
    '7': withErrorHandling((m) => nivelarBranchesWrapper(m)),
    '8': withErrorHandling((m) => handleExportVariables(m)),
    '9': withErrorHandling((_m, _pn, ns) => handleChangeProject(ns)),
    a: () => {
        void handleFlakinessDashboard();
        return Promise.resolve(false);
    },
};

function _handleExit(): boolean {
    clearBreadcrumbs();
    title('Até logo!');
    printSessionSummary();
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
        await showDocs();
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

function _initInfrastructure(): void {
    ensureDirs();
    registerCleanup();
}

async function _ensureProjectsConfigured(): Promise<boolean> {
    let projs = getProjects();
    if (!projs || Object.keys(projs).length === 0) {
        warn('Nenhum projeto configurado.');
        try {
            const wantsSetup = promptConfirm('Deseja configurar um projeto agora?');
            if (wantsSetup) {
                await _handleSetupWizard();
                clearProjectCache();
                projs = getProjects();
            }
        } catch {
            // confirm cancelled — exit
        }
        if (!projs || Object.keys(projs).length === 0) {
            warn('É necessário configurar ao menos um projeto. Configure projects.json ou execute o setup wizard.');
            return false;
        }
    }
    return true;
}

async function _initEnvironment(): Promise<void> {
    setupSigint(
        () => isBusy,
        () => printSessionSummary(),
    );
    const envResult = validateEnv();
    if (offerEnvSetup(envResult)) {
        try {
            await _handleSetupWizard();
        } catch {
            // wizard failed — continue anyway
        }
    }
    await showSplash();
    sessionLog.info('Sessão iniciada');
}

async function _selectProjectAndCreateManager(): Promise<{
    projectName: string;
    names: string[];
    manager: GitProvider;
} | null> {
    const { projectName, names } = _selectProject();
    if (!projectName) return null;
    let m: GitProvider;
    try {
        m = createManagerForProject(projectName, projectId);
    } catch (e) {
        if ((e as Error).name === 'MissingTokenError') {
            warn(String(e));
            try {
                if (promptConfirm('Token de acesso não encontrado. Deseja configurar agora?')) {
                    await _handleSetupWizard();
                    clearProjectCache();
                    m = createManagerForProject(projectName, projectId);
                } else {
                    return null;
                }
            } catch {
                return null;
            }
        } else {
            printError('Erro ao criar gerenciador do projeto', e);
            rootLogger.error('createManagerForProject failed', { projectName, error: String(e) });
            return null;
        }
    }
    setManager(m);
    return { projectName, names, manager: m };
}

async function main(): Promise<void> {
    _initInfrastructure();

    if (await tryBatchMode()) return;

    const hasProjects = await _ensureProjectsConfigured();
    if (!hasProjects) return;

    await _initEnvironment();

    const result = await _selectProjectAndCreateManager();
    if (!result) return;
    const { projectName, names, manager: m } = result;

    clearBreadcrumbs();
    pushBreadcrumb('GIT');
    pushBreadcrumb(projectName);

    await displayRecentPipelines(m);

    const stateHint =
        loadState().lastChoice && (loadState().lastChoice as string) !== '0'
            ? 'Enter = ' + (loadState().lastChoice as string)
            : '0-9';

    while (true) {
        if (process.stdout.isTTY) console.clear();
        const finalChoice = await _promptChoice(stateHint);
        updateState((s: StateContainer) => {
            s.lastChoice = finalChoice;
        });
        try {
            const shouldExit = await _dispatchAction(finalChoice, m, projectName, names);
            if (shouldExit) return;
        } catch (e) {
            if (e instanceof CancelError) continue;
            printError('Erro na operação', e);
            rootLogger.error('Handler error', { error: String(e) });
            continue;
        }
    }
}

process.on('unhandledRejection', (reason: unknown) => {
    printError('Erro interno não tratado', reason);
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
});

main().catch((err) => {
    printError('Erro inesperado', err);
    printSessionSummary();
    rootLogger.error('Main error', { error: String(err) });
});

export default {
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
    handleFlakinessDashboard,
    handleSetupWizard: _handleSetupWizard,
    tryBatchMode,
    parseBatchArgs,
    buildContextLine,
    _selectProject,
    _promptChoice,
    withErrorHandling,
    _handleExit,
    _dispatchAction,
};
