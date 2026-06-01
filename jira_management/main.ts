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
    offerEnvSetup,
    setupSigint,
    printSessionSummary as sharedPrintSessionSummary,
} from '../shared/cli_base';
import { rootLogger } from '../shared/logger';
import { pushBreadcrumb, popBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs';
import { loadTypedState, update as updateState, getStatePath } from '../shared/state';
import { loadMetrics } from '../shared/metrics';
import { palette } from '../shared/palette';
import chalk from 'chalk';
import { SessionContext } from '../shared/session-context';
import type { StateSchema } from '../shared/types';
import type { CommandContext } from './commands/context';
import { ensureDirs, registerCleanup } from '../shared/temp-dir';
import { CATEGORY_IDS, CATEGORY_TITLES } from './menu-data';
import { dispatchChoice, getAndResolveChoice } from './ui-helpers';
import { maybeRunFirstRunWizard } from '../shared/first-run';

/** Type-safe wrapper around `updateState` that provides a `StateSchema` callback. */
function updateStateTyped(fn: (state: StateSchema) => void): void {
    updateState((s) => fn(s));
}

interface RuntimeResources {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    ctx: SessionContext;
    pushHistory: (op: string, detail: string, status: string) => void;
    printSessionSummary: () => void;
}

// ─── Gap analysis badge ───────────────────────────────────────────────────────

const _badgeCache = new Map<string, { totalCount: number; timestamp: number }>();
const BADGE_CACHE_TTL_MS = 5 * 60 * 1000;

function _isBatchOrCI(): boolean {
    if (process.env.CI === 'true') return true;
    if (process.env.AUTO_CONFIRM === 'true') return true;
    const args = process.argv.slice(2).join(' ');
    if (args.includes('--batch') || args.includes('--auto')) return true;
    return false;
}

/** Show a compact coverage badge on Jira module entry.
 *  Makes 1 JQL call (total count), reads cached coverage snapshot from metrics.
 *  Skip if Jira is not configured, or in batch/CI mode. Cached 5 min per project.
 *  Fails silently on API errors — badge is cosmetic. */
async function showGapBadge(jiraResource: JiraResource, project: string): Promise<void> {
    if (_isBatchOrCI()) return;
    if (!_isJiraConfigured()) return;
    const cacheKey = 'gap-badge:' + project;
    const cached = _badgeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BADGE_CACHE_TTL_MS) {
        _displayBadge(cached.totalCount, project);
        return;
    }
    try {
        const jql = 'project = ' + project + ' AND issuetype in (Story, Task, Bug, Epic)';
        const response = await jiraResource.searchJiraIssues(jql, 0);
        const totalCount = response.total;
        _badgeCache.set(cacheKey, { totalCount, timestamp: Date.now() });
        _displayBadge(totalCount, project);
    } catch {
        // Fail silently — badge is nice-to-have
    }
}

/** Returns true when Jira base URL and personal token are configured with real values
 *  (non-empty, non-placeholder). Used to skip non-critical startup calls. */
function _isJiraConfigured(): boolean {
    const url = Config.get('jiraBaseUrl');
    const token = Config.get('jiraPersonalToken');
    if (!url || !token) return false;
    if (url.includes('seu-jira-server') || token === 'seu-token-aqui') return false;
    return true;
}

function _displayBadge(totalCount: number, project: string): void {
    const metrics = loadMetrics();
    const snapshot = metrics.coverageHistory?.filter((s) => s.project === project).pop();
    const pct = snapshot?.coveragePct;
    const gapCount = snapshot ? snapshot.totalIssues - snapshot.mappedIssues : null;
    const color =
        pct !== undefined ? (pct >= 70 ? palette.green : pct >= 40 ? palette.yellow : palette.red) : palette.muted;
    const badge =
        pct !== undefined
            ? chalk.bold('📊 Cobertura: ' + color(pct + '%') + ' · ' + gapCount + ' gaps · ' + totalCount + ' issues')
            : chalk.bold('📊 ' + totalCount + ' issues');
    info(badge);
}

const base_url: string = Config.get('jiraBaseUrl');
const personal_token: string = Config.get('jiraPersonalToken');
const xray_url: string = Config.get('xrayBaseUrl');
const default_project = '';

const sessionLog = rootLogger.child({ session: 'jira' });

if (Config.get('debug')) {
    info('Jira Base URL: ' + base_url);
    info('Jira Token: ' + mask(personal_token));
}

const validateEnv = createValidateEnv([
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
        Config.get('jiraProject') || prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
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

    const res: RuntimeResources = {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    };
    return res;
}

function buildCommandContext(res: RuntimeResources): CommandContext {
    const {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    } = res;
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
    if (!Config.get('autoConfirm') && choice !== '0' && longOps.includes(choice) && hasResults) {
        prompt('Pressione Enter para continuar');
    }

    return 'continue';
}

async function _executeChoice(choice: string, res: RuntimeResources): Promise<void> {
    updateStateTyped((s) => {
        s.lastChoice = choice;
    });
    const cmdCtx = buildCommandContext(res);
    await dispatchAndHandleResult(choice, cmdCtx, res.ctx);
}

async function runMainLoop(res: RuntimeResources): Promise<void> {
    const { ctx, printSessionSummary } = res;
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
            return;
        }
        if (choice === '__back__') {
            popBreadcrumb();
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

        await _executeChoice(choice, res);
    }
}

async function main(): Promise<void> {
    if (process.stdout.isTTY) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    const envResult = validateEnv();
    ensureDirs();
    registerCleanup();

    await showSplash(getStatePath());
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    if (offerEnvSetup(envResult)) {
        try {
            await maybeRunFirstRunWizard();
        } catch {
            // wizard failed — continue anyway
        }
    }

    const res = initializeSession();

    setupSigint(
        () => res.ctx.isBusy,
        () => res.printSessionSummary(),
    );

    await showGapBadge(res.jiraResource, res.ctx.project_name);
    if (!_isJiraConfigured()) {
        info('ℹ Jira não configurado. Comandos que dependem de Jira exibirão orientação de configuração.');
    }

    await runMainLoop(res);
}

process.on('unhandledRejection', (reason: unknown) => {
    printError('Erro interno não tratado', reason);
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
});

main().catch((err: unknown) => {
    printError('Erro inesperado', err);
    const state = loadTypedState();
    sharedPrintSessionSummary([], '', state.history || []);
    rootLogger.error('Main error', { error: String(err) });
});

// Re-exports for backward compatibility (tests use require('./main'))
export { resolveAlias, buildMenuChoices, _configHint } from './menu-data';
export { showHelp, showDocs, showHelpLoop, handleSpecialInput } from './ui-helpers';

export { main, showSplash, dispatchChoice, dispatchAndHandleResult, showGapBadge, _isJiraConfigured };
