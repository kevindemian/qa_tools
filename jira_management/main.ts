import Config from '../shared/config';
import JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import CsvResource from './csv_resource';
import PackageVersionManager from './package_version_manager';
import { showSplash } from '../shared/splash';
import { info, title, prompt, printError } from '../shared/prompt';
import {
    mask,
    createValidateEnv,
    setupSigint,
    printSessionSummary as sharedPrintSessionSummary,
} from '../shared/cli_base';
import { rootLogger } from '../shared/logger';
import { pushBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs';
import { loadTypedState, update as updateState, getStatePath } from '../shared/state';
import { SessionContext } from '../shared/session-context';
import type { StateSchema } from '../shared/types';
import type { CommandContext } from './commands/context';
import { ensureDirs, registerCleanup } from '../shared/temp-dir';
import { CATEGORY_IDS, CATEGORY_TITLES } from './menu-data';
import { dispatchChoice, getAndResolveChoice } from './ui-helpers';

/** Type-safe wrapper around `updateState` that provides a `StateSchema` callback. */
function updateStateTyped(fn: (state: StateSchema) => void): void {
    updateState((s) => fn(s));
}

const base_url: string = Config.jiraBaseUrl;
const personal_token: string = Config.jiraPersonalToken;
const xray_url: string = Config.xrayBaseUrl;
const default_project = 'ECSPOL';

const sessionLog = rootLogger.child({ session: 'jira' });

if (Config.debug) {
    info('Jira Base URL: ' + base_url);
    info('Jira Token: ' + mask(personal_token));
}

const validateEnv: () => void = createValidateEnv([
    { key: 'JIRA_BASE_URL', label: 'JIRA_BASE_URL', example: 'JIRA_BASE_URL=https://seu-jira-server' },
    {
        key: 'JIRA_PERSONAL_TOKEN',
        label: 'JIRA_PERSONAL_TOKEN (token de autenticação)',
        example: 'JIRA_PERSONAL_TOKEN=seu-token-aqui',
    },
    {
        key: 'XRAY_BASE_URL',
        label: 'XRAY_BASE_URL (obrigatorio para criar testes)',
        example: 'XRAY_BASE_URL=https://seu-xray-server',
    },
]);

function initializeSession() {
    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();
    const ctx = new SessionContext();
    ctx.createPackageManager = (dir: string) => new PackageVersionManager(dir);

    const state = loadTypedState();
    ctx.project_name = (
        Config.jiraProject || prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    function printSessionSummary(): void {
        const history = loadTypedState().history || [];
        sharedPrintSessionSummary(ctx.sessionCounters, ctx.lastOperation, history);
    }

    function pushHistory(op: string, detail: string, status: string): void {
        ctx.sessionCounters.push({ op, detail, status });
        updateStateTyped((st) => {
            if (!st.history) st.history = [];
            st.history.push({ op, detail, status, ts: new Date().toISOString() });
            if (st.history.length > 50) st.history = st.history.slice(-50);
        });
    }

    return {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    };
}

function buildCommandContext(
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    ctx: SessionContext,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): CommandContext {
    return {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
        base_url,
        sessionLog,
    };
}

async function dispatchAndHandleResult(
    choice: string,
    cmdCtx: CommandContext,
    ctx: SessionContext,
): Promise<'continue'> {
    await dispatchChoice(choice, cmdCtx);

    const longOps = ['1', '15', '4', '5', '7', '8'];
    const hasResults = ctx.results.length > 0 && ctx.results.some((r) => r.status === 'error');
    if (!Config.autoConfirm && choice !== '0' && longOps.includes(choice) && hasResults) {
        prompt('Pressione Enter para continuar');
    }

    return 'continue';
}

async function _executeChoice(
    choice: string,
    ctx: SessionContext,
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): Promise<void> {
    updateStateTyped((s) => {
        s.lastChoice = choice;
    });

    const cmdCtx = buildCommandContext(
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    );

    await dispatchAndHandleResult(choice, cmdCtx, ctx);
}

async function runMainLoop(
    ctx: SessionContext,
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): Promise<void> {
    let currentLevel = 'main';
    clearBreadcrumbs();
    while (true) {
        if (process.stdout.isTTY) {
            process.stdout.write('\x1b[2J\x1b[H');
        }
        const choice = await getAndResolveChoice(currentLevel, ctx);
        if (choice === '__exit__') {
            clearBreadcrumbs();
            title('Até logo!');
            printSessionSummary();
            if (ctx.sessionCounters.some((c) => c.status === 'error')) process.exitCode = 1;
            return;
        }
        if (choice === '__back__') {
            clearBreadcrumbs();
            currentLevel = 'main';
            continue;
        }
        if (choice === '__skip__') continue;
        if (!choice) continue;

        if (CATEGORY_IDS.has(choice)) {
            pushBreadcrumb(CATEGORY_TITLES[choice] || choice);
            currentLevel = choice;
            continue;
        }

        await _executeChoice(
            choice,
            ctx,
            jiraResource,
            jiraResourceXray,
            linkManager,
            linkManagerXray,
            csvResource,
            pushHistory,
            printSessionSummary,
        );
    }
}

async function main(): Promise<void> {
    if (process.stdout.isTTY) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    validateEnv();
    ensureDirs();
    registerCleanup();

    await showSplash(getStatePath());
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    const {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    } = initializeSession();

    setupSigint(
        () => ctx.isBusy,
        () => printSessionSummary(),
    );

    await runMainLoop(
        ctx,
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        pushHistory,
        printSessionSummary,
    );
}

process.on('unhandledRejection', (reason: unknown) => {
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
    process.exitCode = 1;
});

main().catch((err: unknown) => {
    printError('Erro inesperado', err);
    const state = loadTypedState();
    sharedPrintSessionSummary([], '', state.history || []);
    process.exitCode = 1;
});

// Re-exports for backward compatibility (tests use require('./main'))
export { resolveAlias, buildMenuChoices, _configHint } from './menu-data';
export { showHelp, showDocs, showHelpLoop, handleSpecialInput } from './ui-helpers';

export { main, showSplash, dispatchChoice };
