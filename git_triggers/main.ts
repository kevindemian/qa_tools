/** git_triggers entry point — validates environment, shows splash, and dispatches to sub-handlers. */
import { createValidateEnv, setupSigint } from '../shared/cli_base';
import Config from '../shared/config';
import { showSplash } from '../shared/splash';
import { palette } from '../shared/palette';
import { defaultOutput } from '../shared/output';
import { rootLogger } from '../shared/logger';
import { CancelError, success, error, warn, info, title, prompt, showSelect, printError } from '../shared/prompt';
import { load as loadState, update as updateState } from '../shared/state';
import type { GitProvider, JsonObject, StateContainer } from '../shared/types';
import {
    sessionLog,
    sessionContext,
    isBusy,
    manager,
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

function _selectProject(): { projectName: string; names: string[] } {
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
        error('Projeto inválido.');
        process.exitCode = 1;
        throw new Error('Invalid project');
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
    if (process.stdout.isTTY && !Config.quiet) {
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
    title('Até logo!');
    printSessionSummary();
    if (sessionContext.sessionCounters.some((c: { status: string }) => c.status === 'error')) process.exitCode = 1;
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

async function main(): Promise<void> {
    ensureDirs();
    registerCleanup();

    if (await tryBatchMode()) return;

    const projs = getProjects();
    if (!projs || Object.keys(projs).length === 0) {
        process.exitCode = 1;
        return;
    }
    setupSigint(
        () => isBusy,
        () => printSessionSummary(),
    );
    validateEnv();
    await showSplash();
    sessionLog.info('Sessão iniciada');

    const { projectName, names } = _selectProject();
    setManager(createManagerForProject(projectName, projectId));
    const m = manager!;

    await displayRecentPipelines(m);

    const stateHint =
        loadState().lastChoice && (loadState().lastChoice as string) !== '0'
            ? 'Enter = ' + (loadState().lastChoice as string)
            : '0-9';

    while (true) {
        console.clear();
        const finalChoice = await _promptChoice(stateHint);
        updateState((s: StateContainer) => {
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
    tryBatchMode,
    parseBatchArgs,
    buildContextLine,
    _selectProject,
    _promptChoice,
    withErrorHandling,
    _handleExit,
    _dispatchAction,
};
