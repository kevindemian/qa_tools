import Config from '../shared/config.js';
import JiraResource from './jira_resource.js';
import JiraLinkManager from './jira_link_manager.js';
import CsvResource from './csv_resource.js';
import PackageVersionManager from './package_version_manager.js';
import { showSplash } from '../shared/splash.js';
import type { JiraMode } from '../shared/jira-auth.js';
import { calculateHealthScore } from '../shared/health-score.js';
import pkg from '../package.json';
import { info, title, prompt, printError, warn } from '../shared/prompt.js';
import { withSpinner } from '../shared/spinner.js';
import {
    mask,
    createValidateEnv,
    offerEnvSetup,
    setupSigint,
    gracefulExit,
    printSessionSummary as sharedPrintSessionSummary,
} from '../shared/cli_base.js';
import { rootLogger } from '../shared/logger.js';
import { pushBreadcrumb, popBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs.js';
import { loadTypedState, update as updateState, getStatePath } from '../shared/state.js';
import { getDataHub } from '../shared/data-hub/global-hub.js';
import { palette, applyPalette } from '../shared/palette.js';
import { SessionContext } from '../shared/session-context.js';
import { ExitCode, type StateSchema } from '../shared/types.js';
import type { CommandContext } from './commands/context.js';
import { ensureDirs, registerCleanup } from '../shared/temp-dir.js';
import { CATEGORY_IDS, CATEGORY_TITLES } from './menu-data.js';
import { dispatchChoice, getAndResolveChoice } from './ui-helpers.js';
import { maybeRunFirstRunWizard } from '../shared/first-run.js';
import { setCurrentProject, getCurrentProject, loadProjectConfig } from '../shared/project-context.js';
import { parseProjectFlag } from '../shared/parse-project-flag.js';

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
    if (process.env['CI'] === 'true') return true;
    if (process.env['AUTO_CONFIRM'] === 'true') return true;
    const args = process.argv.slice(2).join(' ');
    if (args.includes('--batch') || args.includes('--auto')) return true;
    return false;
}

/** Show a compact coverage badge on Jira module entry.
 *  Makes 1 JQL call (total count), reads cached coverage snapshot from metrics.
 *  Skip if Jira is not configured, or in batch/CI mode. Cached 5 min per project.
 *  Uses withSpinner to give visual feedback during the API call. */
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
        const response = await withSpinner('Verificando métricas do projeto...', () =>
            jiraResource.searchJiraIssues(jql, 0),
        );
        const totalCount = response.total;
        _badgeCache.set(cacheKey, { totalCount, timestamp: Date.now() });
        _displayBadge(totalCount, project);
    } catch (err) {
        rootLogger.debug('Gap badge fetch failed: ' + String(err));
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
    const dataHub = getDataHub();
    const snapshot = dataHub.raw.coverageHistory?.filter((s) => s.project === project).pop();
    const pct = snapshot?.coveragePct;
    const gapCount = snapshot ? snapshot.totalIssues - snapshot.mappedIssues : null;
    let color: (s: string) => string;
    if (pct !== undefined) {
        if (pct >= 70) {
            color = palette.green;
        } else if (pct >= 40) {
            color = palette.yellow;
        } else {
            color = palette.red;
        }
    } else {
        color = palette.muted;
    }
    const badge =
        pct !== undefined
            ? applyPalette('bold')(
                  '📊 Cobertura: ' + color(pct + '%') + ' · ' + gapCount + ' gaps · ' + totalCount + ' issues',
              )
            : applyPalette('bold')('📊 ' + totalCount + ' issues');
    info(badge);
}

const base_url: string = Config.get('jiraBaseUrl');
const personal_token: string = Config.get('jiraPersonalToken');
const xray_url: string = Config.get('xrayBaseUrl');
const jira_mode = Config.get<JiraMode>('jiraMode');
const default_project = getCurrentProject() ?? '';

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

async function initializeSession() {
    if (!_isJiraConfigured()) {
        info('ℹ Jira não configurado. Comandos que dependem de Jira exibirão orientação de configuração.');
    }

    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2', jira_mode);
    const jiraResourceXray = new JiraResource(personal_token, xray_url, jira_mode);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();
    const ctx = new SessionContext();
    ctx.createPackageManager = (dir: string) => new PackageVersionManager(dir);

    const state = loadTypedState();
    try {
        ctx.project_name = (
            Config.get('jiraProject') ||
            (getCurrentProject() ? loadProjectConfig(getCurrentProject() as string).jiraKey : undefined) ||
            prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
        ).toUpperCase();
    } catch (err) {
        rootLogger.debug('Prompt de projeto falhou: ' + String(err));
        warn('Não foi possível obter o nome do projeto. Usando o último projeto da sessão anterior.');
        ctx.project_name = (state.lastProject || default_project).toUpperCase();
    }

    if (_isJiraConfigured() && ctx.project_name) {
        const jql = 'project=' + ctx.project_name;
        try {
            await jiraResource.searchJiraIssues(jql, 1);
        } catch (err) {
            rootLogger.debug('Jira project validation failed: ' + String(err));
            warn('Projeto "' + ctx.project_name + '" não encontrado no Jira. Verifique se o nome está correto.');
        }
    }

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
        dataHub: getDataHub(),
    };
}

async function dispatchAndHandleResult(
    choice: string,
    cmdCtx: CommandContext,
    _ctx: SessionContext,
): Promise<'continue'> {
    await dispatchChoice(choice, cmdCtx);

    const longOps = ['1', '15', '4', '5', '7', '8'];
    if (!Config.get('autoConfirm') && choice !== '0' && longOps.includes(choice)) {
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

function _shouldNoClear(): boolean {
    return process.argv.includes('--no-clear') || Config.get<boolean>('qaToolsNoClear') === true;
}

function _clearScreenIfNeeded(): void {
    if (process.stdout.isTTY && !_shouldNoClear()) {
        process.stdout.write('\x1b[2J\x1b[H');
    }
}

function _classifyChoice(choice: string | null): { action: string; category?: string } {
    if (choice === null) return { action: 'skip' };
    if (choice === '__exit__') return { action: 'exit' };
    if (choice === '__back__') return { action: 'back' };
    if (choice === '__skip__' || choice === '') return { action: 'skip' };
    if (CATEGORY_IDS.has(choice)) return { action: 'category', category: choice };
    return { action: 'continue' };
}

async function runMainLoop(res: RuntimeResources): Promise<void> {
    const { ctx, printSessionSummary } = res;
    let currentLevel = 'main';
    clearBreadcrumbs();
    for (;;) {
        _clearScreenIfNeeded();
        const choice = await getAndResolveChoice(currentLevel, ctx);
        const classified = _classifyChoice(choice);

        if (classified.action === 'exit') {
            clearBreadcrumbs();
            title('Até logo!');
            printSessionSummary();
            return;
        }
        if (classified.action === 'back') {
            popBreadcrumb();
            currentLevel = 'main';
            info('Voltando ao menu principal...');
            continue;
        }
        if (classified.action === 'skip') continue;

        if (classified.action === 'category' && classified.category) {
            const catTitle: unknown = Reflect.get(CATEGORY_TITLES, classified.category);
            pushBreadcrumb((typeof catTitle === 'string' ? catTitle : undefined) || classified.category);
            currentLevel = classified.category;
            continue;
        }

        if (choice !== null) {
            await _executeChoice(choice, res);
        }
    }
}

async function main(): Promise<void> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        rootLogger.info('QA Tools — Jira Management');
        rootLogger.info('');
        rootLogger.info('Uso: npx tsx jira_management/main.ts [opcoes]');
        rootLogger.info('');
        rootLogger.info('Opcoes:');
        rootLogger.info('  --help, -h     Exibe esta ajuda');
        rootLogger.info('  --version      Exibe a versao');
        gracefulExit(ExitCode.OK);
        return;
    }
    if (process.argv.includes('--version')) {
        rootLogger.info(pkg.version);
        gracefulExit(ExitCode.OK);
        return;
    }
    if (process.stdout.isTTY && !_shouldNoClear()) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    const projectName = parseProjectFlag(process.argv);
    if (projectName) setCurrentProject(projectName);
    const envResult = validateEnv();
    ensureDirs();
    registerCleanup();

    let healthScore: { score: number; grade: string } | undefined;
    try {
        const hub = getDataHub();
        const health = calculateHealthScore({ dataHub: hub });
        healthScore = { score: health.overall, grade: health.grade };
    } catch (err) {
        rootLogger.debug('Health score failed: ' + String(err));
    }
    await showSplash(getStatePath(), undefined, undefined, undefined, healthScore);
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    if (offerEnvSetup(envResult)) {
        // env setup offered
    }
    try {
        await maybeRunFirstRunWizard();
    } catch (err) {
        rootLogger.debug('Setup wizard failed: ' + String(err));
    }

    // Early SIGINT handler: protege contra crash durante prompts síncronos
    // (readline-sync) que ocorrem dentro de initializeSession.
    // Removido após initializeSession e substituído pelo handler definitivo.
    const _earlyHandler = () => {};
    process.on('SIGINT', _earlyHandler);

    const res = await initializeSession();

    process.removeListener('SIGINT', _earlyHandler);
    setupSigint(
        () => res.ctx.isBusy,
        () => res.printSessionSummary(),
    );

    await showGapBadge(res.jiraResource, res.ctx.project_name);

    await runMainLoop(res);
}

process.on('unhandledRejection', (reason: unknown) => {
    printError('Erro interno não tratado (async)', reason);
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
    gracefulExit(ExitCode.ERROR);
});

process.on('uncaughtException', (err: Error) => {
    printError('Erro interno não tratado (sync)', err);
    rootLogger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    const state = loadTypedState();
    sharedPrintSessionSummary([], '', state.history || []);
    gracefulExit(ExitCode.ERROR);
});

main().catch((err: unknown) => {
    printError('Erro inesperado', err);
    const state = loadTypedState();
    sharedPrintSessionSummary([], '', state.history || []);
    rootLogger.error('Main error', { error: String(err) });
});

// Re-exports for backward compatibility (tests use require('./main'))
export { resolveAlias, buildMenuChoices, _configHint } from './menu-data.js';
export { showHelp, showDocs, showHelpLoop, handleSpecialInput } from './ui-helpers.js';

export { main, showSplash, dispatchChoice, dispatchAndHandleResult, showGapBadge, _isJiraConfigured };
