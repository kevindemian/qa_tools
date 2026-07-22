import Config from '../shared/config-accessor.js';
import JiraResource from './jira_resource.js';
import JiraLinkManager from './jira_link_manager.js';
import CsvResource from './csv_resource.js';
import TestExecutionCreator from './test-execution-creator.js';
import PackageVersionManager from './package_version_manager.js';
import { showSplash } from '../shared/ui/splash.js';
import type { JiraMode } from '../shared/jira/jira-auth.js';
import { calculateHealthScore } from '../shared/quality/health-score.js';
import pkg from '../package.json';
import { info, title, prompt, printError, warn } from '../shared/ui/prompt.js';
import { withSpinner } from '../shared/ui/spinner.js';
import {
    mask,
    createValidateEnv,
    offerEnvSetup,
    setupSigint,
    gracefulExit,
    printSessionSummary as sharedPrintSessionSummary,
} from '../shared/ui/cli_base.js';
import { rootLogger } from '../shared/logger.js';
import { pushBreadcrumb, popBreadcrumb, clearBreadcrumbs } from '../shared/ui/breadcrumbs.js';
import { loadTypedState, update as updateState, getStatePath } from '../shared/state.js';
import { getDataHub } from '../shared/data-hub/global-hub.js';
import { palette, applyPalette } from '../shared/ui/palette.js';
import { SessionContext } from '../shared/session-context.js';
import { ExitCode, type StateSchema } from '../shared/types.js';
import type { CommandContext } from './commands/context.js';
import createTests from './create_tests.js';
import { ensureDirs, registerCleanup } from '../shared/infra/temp-dir.js';
import { CATEGORY_IDS, CATEGORY_TITLES } from './menu-data.js';
import { dispatchChoice, getAndResolveChoice } from './ui-helpers.js';
import { maybeRunFirstRunWizard } from '../shared/ui/first-run.js';
import { setCurrentProject, getCurrentProject, loadProjectConfig } from '../shared/project-context.js';
import { parseProjectFlag } from '../shared/parse-project-flag.js';

/** Type-safe wrapper around `updateState` that provides a `StateSchema` callback. */
function updateStateTyped(fn: (state: StateSchema) => void): void {
    updateState((s) => fn(s));
}

export interface RuntimeResources {
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

/** Extract the CSV path from `--csv <path>`; falls back to CSV_PATH env (used with --auto). */
export function parseCsvArg(argv: string[]): string | undefined {
    const idx = argv.indexOf('--csv');
    if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
    if (argv.includes('--auto') && process.env['CSV_PATH']) return process.env['CSV_PATH'];
    return undefined;
}

/** Human-readable message for each distinguishable CSV read failure (never generic). */
export function describeCsvFailure(
    reason: 'empty' | 'missing' | 'read-error',
    csvPath: string,
    error?: string,
): string {
    switch (reason) {
        case 'missing':
            return 'Arquivo CSV nao encontrado: ' + csvPath;
        case 'empty':
            return 'O CSV nao contem nenhum teste valido.';
        default:
            return error ? error : 'Falha ao ler o CSV.';
    }
}

/** Headless CSV import: runs the real pipeline without the interactive menu.
 *  Exits non-zero on any explicit failure so CI/automation can detect it. */
export async function runHeadlessCsvImport(res: RuntimeResources, csvPath: string): Promise<ExitCode> {
    const sessionLog = rootLogger.child({ session: 'csv-import-headless' });
    const onBusy = (busy: boolean) => {
        res.ctx.isBusy = busy;
    };
    try {
        const outcome = await createTests.createTestsFromCsv({
            jiraResource: res.jiraResource,
            jiraResourceXray: res.jiraResourceXray,
            linkManager: res.linkManager,
            linkManagerXray: res.linkManagerXray,
            csvResource: res.csvResource,
            project_name: res.ctx.project_name,
            base_url,
            sessionLog,
            onBusy,
            csvPath,
        });

        if (!outcome.ok) {
            const detail = describeCsvFailure(outcome.reason, csvPath, outcome.error);
            printError('Importação CSV falhou', outcome.error ? new Error(outcome.error) : new Error(detail));
            res.pushHistory('csv-import', detail, 'error');
            return ExitCode.ERROR;
        }

        const { summary, status, failedLinks, inMemoryTasksId } = outcome.result;
        if (failedLinks.length) {
            printError(summary, undefined);
        } else {
            info(summary);
        }

        if (process.argv.includes('--create-te') && inMemoryTasksId.length > 0) {
            info('Criando Test Execution...');
            const executor = new TestExecutionCreator(res.jiraResource, res.linkManager);
            const csvName = csvPath.split('/').pop() ?? csvPath;
            const teResult = await createTests.createTestExecutionWithLinks({
                testExecutionCreator: executor,
                projectName: res.ctx.project_name,
                testKeys: inMemoryTasksId,
                csvName,
            });
            if (teResult) {
                info('Test Execution criada: ' + teResult.key + ' — ' + teResult.summary);
            } else {
                warn('Falha ao criar Test Execution');
            }
        }

        res.pushHistory('csv-import', summary, status);
        return status === 'ok' ? ExitCode.OK : ExitCode.ERROR;
    } catch (err) {
        printError('Erro inesperado na importacao CSV', err);
        res.pushHistory('csv-import', 'erro', 'error');
        return ExitCode.ERROR;
    }
}

/** Headless associate: links existing test issues to an existing Test Execution.
 *  Validates all keys before attempting association. Returns ExitCode.ERROR with
 *  explicit per-key error messages on failure. */
export async function runAssociateTe(res: RuntimeResources, teKey: string, testKeys: string[]): Promise<ExitCode> {
    const opLog = rootLogger.child({ session: 'associate-te-headless' });
    info('Associando testes à Test Execution ' + teKey + '...');

    // ── Validate TE key ──────────────────────────────────────────────────
    let teIssue: { key: string; fields: { summary?: string; issuetype?: { name: string } } };
    try {
        teIssue = await res.jiraResource.getJiraResource<{
            key: string;
            fields: { summary?: string; issuetype?: { name: string } };
        }>('issue/' + teKey);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Test Execution não encontrada: ' + teKey + ' — ' + msg);
        opLog.error('TE lookup failed', { teKey, error: msg });
        res.pushHistory('associate-te', 'TE não encontrada: ' + teKey, 'error');
        return ExitCode.ERROR;
    }
    if (teIssue.fields.issuetype?.name !== 'Test Execution') {
        const actualType = teIssue.fields.issuetype?.name || 'desconhecido';
        rootLogger.error('"' + teKey + '" não é uma Test Execution (tipo: ' + actualType + ')');
        res.pushHistory('associate-te', teKey + ' não é TE (tipo: ' + actualType + ')', 'error');
        return ExitCode.ERROR;
    }
    info('  TE validada: ' + teKey + ' — ' + (teIssue.fields.summary || '(sem título)'));

    // ── Validate each test key ───────────────────────────────────────────
    const invalidKeys: string[] = [];
    const validKeys: string[] = [];
    for (const key of testKeys) {
        try {
            await res.jiraResource.getJiraResource<{ key: string }>('issue/' + key);
            validKeys.push(key);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            rootLogger.error('Issue não encontrada: ' + key + ' — ' + msg);
            invalidKeys.push(key);
        }
    }

    if (invalidKeys.length > 0) {
        rootLogger.error(
            invalidKeys.length + ' issue(s) inválida(s): ' + invalidKeys.join(', ') + '. Nenhuma associação realizada.',
        );
        res.pushHistory('associate-te', 'issues inválidas: ' + invalidKeys.join(', '), 'error');
        return ExitCode.ERROR;
    }

    info('  ' + validKeys.length + ' teste(s) validado(s). Associando...');

    // ── Associate ────────────────────────────────────────────────────────
    try {
        const executor = new TestExecutionCreator(res.jiraResource, res.linkManager);
        const result = await executor.addTestsToExistingExecution(teKey, validKeys);
        if (!result) {
            rootLogger.error('Falha ao associar testes à ' + teKey);
            res.pushHistory('associate-te', 'falha na associação: ' + teKey, 'error');
            return ExitCode.ERROR;
        }
        info('OK  ' + validKeys.length + ' teste(s) associado(s) à ' + result.key + ' — ' + result.summary);
        res.pushHistory('associate-te', result.key + ' (' + validKeys.length + ' testes)', 'ok');
        return ExitCode.OK;
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('Erro ao associar testes à ' + teKey + ': ' + msg);
        res.pushHistory('associate-te', 'erro: ' + msg, 'error');
        return ExitCode.ERROR;
    }
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

const _validateEnvConfigs = (): Array<{ key: string; label: string; example: string }> => {
    const configs: Array<{ key: string; label: string; example: string }> = [
        { key: 'JIRA_BASE_URL', label: 'JIRA_BASE_URL', example: 'JIRA_BASE_URL=https://seu-jira-server' },
        {
            key: 'JIRA_PERSONAL_TOKEN',
            label: 'JIRA_PERSONAL_TOKEN (token de autenticação)',
            example: 'JIRA_PERSONAL_TOKEN=seu-token-aqui',
        },
    ];
    const xrayMode = Config.get('xrayMode');
    if (xrayMode !== 'cloud') {
        configs.push({
            key: 'XRAY_BASE_URL',
            label: 'XRAY_BASE_URL (obrigatorio para criar testes)',
            example: 'XRAY_BASE_URL=https://seu-xray-server',
        });
    } else {
        configs.push(
            {
                key: 'xrayClientId',
                label: 'XRAY_CLIENT_ID (obrigatorio Xray Cloud)',
                example: 'XRAY_CLIENT_ID=seu-client-id',
            },
            {
                key: 'xrayClientSecret',
                label: 'XRAY_CLIENT_SECRET (obrigatorio Xray Cloud)',
                example: 'XRAY_CLIENT_SECRET=seu-client-secret',
            },
        );
    }
    return configs;
};

const validateEnv = createValidateEnv(_validateEnvConfigs());

async function initializeSession() {
    if (!_isJiraConfigured()) {
        info('ℹ Jira não configurado. Comandos que dependem de Jira exibirão orientação de configuração.');
    }

    const jiraResource = new JiraResource(personal_token, base_url, jira_mode);
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
        // eslint-disable-next-line no-console
        console.error('[init] Validating project: getJiraResource(project/' + ctx.project_name + ')');
        try {
            await jiraResource.getJiraResource('project/' + ctx.project_name);
            // eslint-disable-next-line no-console
            console.error('[init] project lookup OK');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[init] project lookup FAILED: ' + String(err));
            rootLogger.error('[init] Jira project validation failed: ' + String(err));
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

// eslint-disable-next-line sonarjs/cognitive-complexity
async function main(): Promise<void> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        rootLogger.info('QA Tools — Jira Management');
        rootLogger.info('');
        rootLogger.info('Uso: npx tsx jira_management/main.ts [opcoes]');
        rootLogger.info('');
        rootLogger.info('Opcoes:');
        rootLogger.info('  --help, -h     Exibe esta ajuda');
        rootLogger.info('  --version      Exibe a versao');
        rootLogger.info('  --csv <path>   Importa um CSV de testes sem menu interativo (headless)');
        rootLogger.info('  --auto         Forca AUTO_CONFIRM (usado com --csv em automacao/CI)');
        rootLogger.info('  --update-policy <auto|skip|prompt>');
        rootLogger.info('                 auto: atualiza automaticamente');
        rootLogger.info('                 skip: pula issues existentes');
        rootLogger.info('                 prompt: pergunta o que fazer');
        rootLogger.info('  --target-keys <KEY1,KEY2,...>');
        rootLogger.info('                 atualiza issues por chave, na ordem do CSV');
        rootLogger.info('  --create-te    Cria Test Execution e associa todos os testes ao final');
        rootLogger.info('  --associate-te <TE_KEY>');
        rootLogger.info('                 associa testes a uma Test Execution existente');
        rootLogger.info('  --tests <KEY1,KEY2,...>');
        rootLogger.info('                 lista de keys dos testes para associar (usado com --associate-te)');
        rootLogger.info('');
        rootLogger.info('Exemplos:');
        rootLogger.info(
            '  npx tsx jira_management/main.ts --associate-te ECSPOL-1624 --tests ECSPOL-1605,ECSPOL-1606,ECSPOL-1607',
        );
        gracefulExit(ExitCode.OK);
        return;
    }
    if (process.argv.includes('--version')) {
        rootLogger.info(pkg.version);
        gracefulExit(ExitCode.OK);
        return;
    }
    if (process.argv.includes('--auto')) {
        Config.setAutoConfirm(true);
    }
    const upIdx = process.argv.indexOf('--update-policy');
    if (upIdx !== -1 && upIdx + 1 < process.argv.length) {
        const val: string = process.argv[upIdx + 1] ?? '';
        if (!['auto', 'skip', 'prompt'].includes(val)) {
            rootLogger.error('--update-policy deve ser auto, skip ou prompt');
            process.exit(ExitCode.ERROR);
        }
        if (Config.get<boolean>('autoConfirm') && val === 'prompt') {
            rootLogger.warn('--auto ativo, --update-policy=prompt ignorado; usando auto');
            Config.set('updatePolicy', 'auto');
        } else {
            Config.set('updatePolicy', val);
        }
    }
    const tkIdx = process.argv.indexOf('--target-keys');
    if (tkIdx !== -1 && tkIdx + 1 < process.argv.length) {
        const raw: string = process.argv[tkIdx + 1] ?? '';
        const keys = raw
            .split(',')
            .map((k) => k.trim())
            .filter(Boolean);
        if (keys.length === 0) {
            rootLogger.error('--target-keys requer pelo menos uma chave separada por vírgula');
            process.exit(ExitCode.ERROR);
        }
        Config.set('targetKeys', keys.join(','));
    }
    const atIdx = process.argv.indexOf('--associate-te');
    if (atIdx !== -1 && atIdx + 1 < process.argv.length) {
        const teKey = (process.argv[atIdx + 1] ?? '').trim().toUpperCase();
        if (!teKey) {
            rootLogger.error('--associate-te requer uma key de Test Execution (ex: ECSPOL-1624)');
            process.exit(ExitCode.ERROR);
        }
        Config.set('associateTeKey', teKey);
    }
    const testsIdx = process.argv.indexOf('--tests');
    if (testsIdx !== -1 && testsIdx + 1 < process.argv.length) {
        const raw: string = process.argv[testsIdx + 1] ?? '';
        const keys = raw
            .split(',')
            .map((k) => k.trim().toUpperCase())
            .filter(Boolean);
        if (keys.length === 0) {
            rootLogger.error('--tests requer pelo menos uma chave separada por vírgula (ex: ECSPOL-1605,ECSPOL-1606)');
            process.exit(ExitCode.ERROR);
        }
        Config.set('associateTestKeys', keys.join(','));
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
        // DataHub may not be initialized in headless mode — this is expected.
        rootLogger.debug('[startup] Health score unavailable: ' + String(err));
    }
    // eslint-disable-next-line no-console
    console.error('[startup] Calling showSplash...');
    await showSplash(getStatePath(), undefined, undefined, undefined, healthScore);
    // eslint-disable-next-line no-console
    console.error('[startup] showSplash done');
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    if (offerEnvSetup(envResult)) {
        // env setup offered
    }
    // eslint-disable-next-line no-console
    console.error('[startup] Calling maybeRunFirstRunWizard...');
    try {
        await maybeRunFirstRunWizard();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[startup] Setup wizard failed:', err);
        rootLogger.error('Setup wizard failed: ' + String(err));
    }
    // eslint-disable-next-line no-console
    console.error('[startup] maybeRunFirstRunWizard done');

    // Early SIGINT handler: protege contra crash durante prompts síncronos
    // (readline-sync) que ocorrem dentro de initializeSession.
    // Removido após initializeSession e substituído pelo handler definitivo.
    const _earlyHandler = () => {};
    process.on('SIGINT', _earlyHandler);
    // eslint-disable-next-line no-console
    console.error('[startup] Calling initializeSession (Jira API)...');
    const res = await initializeSession();
    // eslint-disable-next-line no-console
    console.error('[startup] initializeSession done');

    process.removeListener('SIGINT', _earlyHandler);
    setupSigint(
        () => res.ctx.isBusy,
        () => res.printSessionSummary(),
    );

    const associateTeKey = Config.get<string | undefined>('associateTeKey');
    const associateTestKeysStr = Config.get<string | undefined>('associateTestKeys');
    const associateTestKeys = associateTestKeysStr ? associateTestKeysStr.split(',').filter(Boolean) : [];
    if (associateTeKey && associateTestKeys.length > 0) {
        // eslint-disable-next-line no-console
        console.error('[startup] Calling runAssociateTe...');
        const code = await runAssociateTe(res, associateTeKey, associateTestKeys);
        // eslint-disable-next-line no-console
        console.error('[startup] runAssociateTe done, code:', code);
        gracefulExit(code);
        return;
    }

    const headlessCsvPath = parseCsvArg(process.argv);
    if (headlessCsvPath) {
        // eslint-disable-next-line no-console
        console.error('[startup] Calling runHeadlessCsvImport...');
        const code = await runHeadlessCsvImport(res, headlessCsvPath);
        // eslint-disable-next-line no-console
        console.error('[startup] runHeadlessCsvImport done, code:', code);
        gracefulExit(code);
        return;
    }

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

export { main, showSplash, dispatchChoice, dispatchAndHandleResult, showGapBadge, _isJiraConfigured };
