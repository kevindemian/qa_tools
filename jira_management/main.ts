import Config from '../shared/config-accessor.js';
import type JiraResource from './jira_resource.js';
import type JiraLinkManager from './jira_link_manager.js';
import type CsvResource from './csv_resource.js';
import { showSplash } from '../shared/ui/splash.js';
import type { JiraMode } from '../shared/jira/jira-auth.js';
import { info, title, prompt, printError, warn } from '../shared/ui/prompt.js';
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
import type { SessionContext } from '../shared/session-context.js';
import { ExitCode, type StateSchema } from '../shared/types.js';
import type { CommandContext } from './commands/context.js';
import { ensureDirs, registerCleanup } from '../shared/infra/temp-dir.js';
import { CATEGORY_IDS, CATEGORY_TITLES } from './menu-data.js';
import { dispatchChoice, getAndResolveChoice } from './ui-helpers.js';
import { setCurrentProject, getCurrentProject, loadProjectConfig } from '../shared/project-context.js';
import { parseProjectFlag } from '../shared/parse-project-flag.js';

/** Extract the value of a `--key value` argument from argv. Returns undefined if not present. */
function getArgValue(argv: string[], key: string): string | undefined {
    const idx = argv.indexOf(key);
    if (idx === -1 || idx + 1 >= argv.length) return undefined;
    return argv[idx + 1];
}

/** Type-safe wrapper around `updateState` that provides a `StateSchema` callback. */
function updateStateTyped(fn: (state: StateSchema) => void): void {
    updateState((s) => fn(s));
}

/** Lightweight session resources created at startup — deliberately free of the
 * heavy domain resource graph (jira_resource/csv_resource/link_manager ~4s),
 * which is loaded lazily on first command dispatch so the menu renders instantly. */
export interface SessionResources {
    ctx: SessionContext;
    pushHistory: (op: string, detail: string, status: string) => void;
    printSessionSummary: () => void;
}

/** Full runtime resources incl. the Jira/CSV/link domain clients — assembled on
 * demand for headless CLI paths (runHeadlessCsvImport/runAssociateTe). */
export interface RuntimeResources extends SessionResources {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
}

type DomainResources = Pick<
    RuntimeResources,
    'jiraResource' | 'jiraResourceXray' | 'linkManager' | 'linkManagerXray' | 'csvResource'
>;

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
        const [{ default: createTests }, { parseLinkedIssuesString }] = await Promise.all([
            import('./create_tests.js'),
            import('../shared/issue-link-utils.js'),
        ]);
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
            importMode: (Config.get<string>('importMode') || 'create') as 'create' | 'update' | 'hybrid',
        });

        if (!outcome.ok) {
            const detail = describeCsvFailure(outcome.reason, csvPath, outcome.error);
            printError('Importação CSV falhou', outcome.error ? new Error(outcome.error) : new Error(detail));
            res.pushHistory('csv-import', detail, 'error');
            return ExitCode.ERROR;
        }

        const { summary, status, failedLinks, inMemoryTasksId, parentIssues } = outcome.result;
        if (failedLinks && failedLinks.length) {
            printError(summary, undefined);
        } else {
            info(summary);
        }

        if ((process.argv.includes('--create-te') || outcome.testExecution) && inMemoryTasksId.length > 0) {
            info('Criando Test Execution...');
            const { default: TestExecutionCreator } = await import('./test-execution-creator.js');
            const executor = new TestExecutionCreator(res.jiraResource, res.linkManager);
            const csvName = csvPath.split('/').pop() ?? csvPath;
            const teParentArg = getArgValue(process.argv, '--te-parent');
            const teParentIssues = teParentArg ? parseLinkedIssuesString(teParentArg) : parentIssues;
            const teResult = await createTests.createTestExecutionWithLinks({
                testExecutionCreator: executor,
                projectName: res.ctx.project_name,
                testKeys: inMemoryTasksId,
                csvName,
                parentIssues: teParentIssues,
                ...(outcome.testExecution
                    ? {
                          execOpts: {
                              ...(outcome.testExecution.title ? { title: outcome.testExecution.title } : {}),
                              ...(outcome.testExecution.description
                                  ? { description: outcome.testExecution.description }
                                  : {}),
                              ...(outcome.testExecution.labels ? { labels: outcome.testExecution.labels } : {}),
                          },
                      }
                    : {}),
            });
            if (teResult) {
                info('Test Execution criada: ' + teResult.key + ' — ' + teResult.summary);
                if (teResult.linkedParentCount > 0) {
                    info('Issues pai vinculadas: ' + teResult.linkedParentCount);
                }
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
        const { default: TestExecutionCreator } = await import('./test-execution-creator.js');
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

/** Returns true when Jira base URL and personal token are configured with real values
 *  (non-empty, non-placeholder). Used to skip non-critical startup calls. */
function _isJiraConfigured(): boolean {
    const url = Config.get('jiraBaseUrl');
    const token = Config.get('jiraPersonalToken');
    if (!url || !token) return false;
    if (url.includes('seu-jira-server') || token === 'seu-token-aqui') return false;
    return true;
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

let _domainResourcesPromise: Promise<DomainResources> | null = null;
/** Lazily instantiate the domain resource clients (jira_resource, jira_link_manager,
 * csv_resource — ~4s combined import+construct) on first command dispatch instead of
 * blocking the menu render. Memoized for the process lifetime; on rejection the cache
 * is cleared so a later dispatch may retry (no silent swallowing). */
function getDomainResources(): Promise<DomainResources> {
    if (!_domainResourcesPromise) {
        _domainResourcesPromise = (async () => {
            const [{ default: JiraResource }, { default: JiraLinkManager }, { default: CsvResource }] =
                await Promise.all([
                    import('./jira_resource.js'),
                    import('./jira_link_manager.js'),
                    import('./csv_resource.js'),
                ]);

            const jiraResource = new JiraResource(personal_token, base_url, jira_mode);
            const jiraResourceXray = new JiraResource(personal_token, xray_url, jira_mode);
            const linkManager = new JiraLinkManager(jiraResource);
            const linkManagerXray = new JiraLinkManager(jiraResourceXray);
            const csvResource = new CsvResource();
            return { jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource };
        })().catch((err: unknown) => {
            _domainResourcesPromise = null;
            throw err;
        });
    }
    return _domainResourcesPromise;
}

async function initializeSession(): Promise<SessionResources> {
    if (!_isJiraConfigured()) {
        info('ℹ Jira não configurado. Comandos que dependem de Jira exibirão orientação de configuração.');
    }

    const { SessionContext } = await import('../shared/session-context.js');
    const ctx = new SessionContext();
    const { default: PackageVersionManager } = await import('./package_version_manager.js');
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
        // Project validation is intentionally deferred to command execution:
        // a startup network call here delays menu render and, on a bad project
        // key, prints an ERR line before the menu appears.
        rootLogger.debug('[init] project validation deferred to command execution');
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

    const res: SessionResources = {
        ctx,
        pushHistory,
        printSessionSummary,
    };
    return res;
}

async function buildCommandContext(res: SessionResources): Promise<CommandContext> {
    const { jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource } = await getDomainResources();
    return {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx: res.ctx,
        pushHistory: res.pushHistory,
        printSessionSummary: res.printSessionSummary,
        base_url,
        sessionLog,
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

async function _executeChoice(choice: string, res: SessionResources): Promise<void> {
    updateStateTyped((s) => {
        s.lastChoice = choice;
    });
    const cmdCtx = await buildCommandContext(res);
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

async function runMainLoop(res: SessionResources): Promise<void> {
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
        if (classified.action === 'skip') {
            if (!process.stdin.isTTY) {
                printSessionSummary();
                return;
            }
            continue;
        }

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

function showHelp(): void {
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
    rootLogger.info('  --mode <create|update|hybrid>');
    rootLogger.info('                 create: sempre cria novos (default interativo)');
    rootLogger.info('                 update: atualiza existentes por targetKeys, não cria');
    rootLogger.info('                 hybrid: atualiza existentes, cria novos');
    rootLogger.info('  --dry-run      Simula a importacao sem criar ou atualizar issues');
    rootLogger.info('  --create-te    Cria Test Execution e associa todos os testes ao final');
    rootLogger.info('  --te-parent <KEY1,KEY2,...>');
    rootLogger.info('                 issues pai para vincular à Test Execution');
    rootLogger.info('  --associate-te <TE_KEY>');
    rootLogger.info('                 associa testes a uma Test Execution existente');
    rootLogger.info('  --tests <KEY1,KEY2,...>');
    rootLogger.info('                 lista de keys dos testes para associar (usado com --associate-te)');
    rootLogger.info('');
    rootLogger.info('Exemplos:');
    rootLogger.info(
        '  npx tsx jira_management/main.ts --associate-te ECSPOL-1624 --tests ECSPOL-1605,ECSPOL-1606,ECSPOL-1607',
    );
}

function getFlagValue(flag: string): string | undefined {
    const idx = process.argv.indexOf(flag);
    return idx !== -1 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined;
}

function parseUpdatePolicy(): void {
    const val = getFlagValue('--update-policy');
    if (!val) return;
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

function parseTargetKeys(): void {
    const raw = getFlagValue('--target-keys');
    if (!raw) return;
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

function parseAssociateTe(): void {
    const val = getFlagValue('--associate-te');
    if (!val) return;
    const teKey = val.trim().toUpperCase();
    if (!teKey) {
        rootLogger.error('--associate-te requer uma key de Test Execution (ex: ECSPOL-1624)');
        process.exit(ExitCode.ERROR);
    }
    Config.set('associateTeKey', teKey);
}

function parseTestKeys(): void {
    const raw = getFlagValue('--tests');
    if (!raw) return;
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

function parseImportMode(): void {
    const val = getFlagValue('--mode');
    if (!val) return;
    const mode = val.trim().toLowerCase();
    if (!['create', 'update', 'hybrid'].includes(mode)) {
        rootLogger.error('--mode deve ser create, update ou hybrid');
        process.exit(ExitCode.ERROR);
    }
    Config.set('importMode', mode);
}

function parseArgs(): void {
    if (process.argv.includes('--auto')) Config.setAutoConfirm(true);
    if (process.argv.includes('--dry-run')) Config.set('dryRun', true);
    parseUpdatePolicy();
    parseTargetKeys();
    parseImportMode();
    parseAssociateTe();
    parseTestKeys();
}

async function initStartup(): Promise<void> {
    if (process.stdout.isTTY && !_shouldNoClear()) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    const projectName = parseProjectFlag(process.argv);
    if (projectName) {
        try {
            setCurrentProject(projectName);
        } catch (err) {
            const csvPath = parseCsvArg(process.argv);
            if (csvPath) {
                rootLogger.debug('Project "' + projectName + '" not in registry; setting jiraProject for CSV import');
                Config.set('jiraProject', projectName);
            } else {
                throw err;
            }
        }
    }
    const envResult = validateEnv();
    ensureDirs();
    registerCleanup();

    await showSplash(getStatePath());
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    if (offerEnvSetup(envResult)) {
        /* env setup offered */
    }
}

async function main(): Promise<void> {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        showHelp();
        gracefulExit(ExitCode.OK);
        return;
    }
    if (process.argv.includes('--version')) {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
        rootLogger.info(pkg.version);
        gracefulExit(ExitCode.OK);
        return;
    }
    parseArgs();
    await initStartup();

    const res = await initializeSession();
    setupSigint(
        () => res.ctx.isBusy,
        () => res.printSessionSummary(),
    );

    const associateTeKey = Config.get<string | undefined>('associateTeKey');
    const associateTestKeysStr = Config.get<string | undefined>('associateTestKeys');
    const associateTestKeys = associateTestKeysStr ? associateTestKeysStr.split(',').filter(Boolean) : [];
    if (associateTeKey && associateTestKeys.length > 0) {
        const fullRes: RuntimeResources = { ...res, ...(await getDomainResources()) };
        const code = await runAssociateTe(fullRes, associateTeKey, associateTestKeys);
        gracefulExit(code);
        return;
    }

    const headlessCsvPath = parseCsvArg(process.argv);
    if (headlessCsvPath) {
        const fullRes: RuntimeResources = { ...res, ...(await getDomainResources()) };
        const code = await runHeadlessCsvImport(fullRes, headlessCsvPath);
        gracefulExit(code);
        return;
    }

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

export { main, showSplash, dispatchChoice, dispatchAndHandleResult, _isJiraConfigured };
