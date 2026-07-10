/** Session state — persist/load session context as JSON for the git_triggers lifecycle. */
import { formatErr } from '../shared/errors.js';
import fs from 'fs';
import path from 'path';
import Config from '../shared/config.js';
import { rootLogger } from '../shared/logger.js';
import { SessionContext } from '../shared/session-context.js';
import { load as loadState, update as updateState } from '../shared/state.js';
import { printSessionSummary as sharedPrintSessionSummary } from '../shared/cli_base.js';
import { providerLabel as _providerLabel } from './ui-helpers.js';
import { error, print, title, warn } from '../shared/prompt.js';
import { palette } from '../shared/palette.js';
import type { GitProvider, JsonObject, StateContainer } from '../shared/types.js';
import type { DataHub } from '../shared/types/data-hub.js';
import {
    getDataHub as _getGlobalHub,
    setDataHub as _setGlobalHub,
    ensureDataHub as _ensureGlobalHub,
    isDataHubInitialized as _isGlobalHubInitialized,
} from '../shared/data-hub/global-hub.js';
import GitLabManager from './gitlab_manager.js';
import GitHubManager from './github_manager.js';

interface ProviderConfig {
    provider: string;
    repo: string;
}

export const sessionLog = rootLogger.child({ session: 'gitlab' });
export const sessionContext = new SessionContext();

export let projectId: string;
export let currentProjectName = '';
export let currentProvider: 'gitlab' | 'github' = 'gitlab';
export let isBusy = false;
export let manager: GitProvider | null = null;

/** Central DataHub — delegated to global-hub.ts (SSOT). */
export function setDataHub(hub: DataHub | undefined): void {
    _setGlobalHub(hub);
}

export function getDataHub(): DataHub | undefined {
    return _getGlobalHub();
}

/**
 * Lazy-init: creates DataHub on first call, caches for session lifetime.
 * Returns undefined if provider is unavailable or creation fails.
 * Delegates to global-hub.ensureDataHub with freshness checking.
 */
export async function ensureDataHub(): Promise<DataHub | undefined> {
    // Check global-hub cache first (setDataHub may have been called directly)
    if (_isGlobalHubInitialized()) {
        const cached = _getGlobalHub();
        return cached;
    }
    if (!manager || !currentProjectName) return undefined;
    const activeManager = manager;
    const activeProject = currentProjectName;
    return _ensureGlobalHub(async () => {
        const { getOrFetchDataHub } = await import('../shared/ci-data.js');
        return getOrFetchDataHub(activeManager, activeProject);
    });
}

/**
 * Prefetch DataHub for all configured projects in parallel.
 *
 * Fire-and-forget pattern: runs in background, does not block startup.
 * getOrFetchDataHub handles cache internally — no need for duplicate cache checks.
 * Failures are isolated per project — one failing project does not affect others.
 */
export async function prefetchAllProjects(): Promise<void> {
    const projects = getProjects();
    const projectEntries = Object.entries(projects);

    if (projectEntries.length === 0) {
        rootLogger.debug('prefetchAllProjects: no projects configured');
        return;
    }

    const { getOrFetchDataHub } = await import('../shared/ci-data.js');

    const results = await Promise.allSettled(
        projectEntries.map(async ([name, id]) => {
            try {
                const projectManager = createManagerForProject(name, id);
                const hub = await getOrFetchDataHub(projectManager, name);
                if (hub) {
                    rootLogger.debug(`prefetch: ${name} — fetched and cached`);
                } else {
                    rootLogger.debug(`prefetch: ${name} — no data available`);
                }
            } catch (err) {
                rootLogger.debug(`prefetch: ${name} — failed: ${String(err)}`);
            }
        }),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    rootLogger.debug(`prefetchAllProjects: ${succeeded} succeeded, ${failed} failed`);
}

/**
 * Synchronous DataHub fetch for CI environments.
 *
 * When CI=true, data must be fresh and available immediately.
 * Blocks until DataHub is ready.
 */
export async function ensureDataHubSync(): Promise<DataHub | undefined> {
    if (process.env['CI'] !== 'true') return undefined;
    return ensureDataHub();
}

export const apiToken: string = Config.get('gitToken') || '';
export const gitlabBaseUrl: string = Config.get('gitBaseUrl') || '';

export function setCurrentProvider(v: 'gitlab' | 'github'): void {
    currentProvider = v;
}
export function setCurrentProjectName(v: string): void {
    currentProjectName = v;
}
export function setProjectId(v: string): void {
    projectId = v;
}
export function setIsBusy(v: boolean): void {
    isBusy = v;
}
export function setManager(v: GitProvider | null): void {
    manager = v;
}

export function getManager(): GitProvider | null {
    return manager;
}

export const MSG_OPERATION_CANCELED = 'Operação cancelada.';

/** Thrown when a required token/env var is missing for the provider. */
export class MissingTokenError extends Error {
    constructor(provider: string, missingVar: string) {
        super(`Token de autenticação não configurado para ${provider}. Configure ${missingVar} no .env`);
        this.name = 'MissingTokenError';
    }
}

const PROVIDERS_PATH = path.resolve(import.meta.dirname, '../config/providers.json');
const PROJECTS_PATH = path.resolve(import.meta.dirname, '../config/projects.json');

let _providersConfig: Record<string, ProviderConfig> | undefined;
let _projects: Record<string, string> | undefined;

function loadProvidersConfig(): Record<string, ProviderConfig> {
    if (_providersConfig) return _providersConfig;
    try {
        const parsed: Record<string, ProviderConfig> = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8')) as Record<
            string,
            ProviderConfig
        >;
        _providersConfig = parsed;
    } catch (err: unknown) {
        rootLogger.warn('Falha ao carregar providers.json: ' + formatErr(err) + '. Usando GitLab como padrao.');
        _providersConfig = {};
    }
    return _providersConfig;
}

function loadProjects(): Record<string, string> {
    if (_projects) return _projects;
    try {
        _projects = JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf8')) as Record<string, string>;
        const projectOverrides = Config.getAllPrefixed('PROJECT_ID_');
        const overrideEntries = Object.entries(projectOverrides);
        for (const key of Object.keys(_projects)) {
            const envKey = 'PROJECT_ID_' + key.toUpperCase();
            const overrideEntry = overrideEntries.find(([k]) => k === envKey);
            if (overrideEntry) {
                Reflect.set(_projects, key, overrideEntry[1]);
            }
        }
    } catch (err: unknown) {
        rootLogger.error(`Falha ao carregar configuração de projetos de "${PROJECTS_PATH}": ${formatErr(err)}`, {
            configPath: PROJECTS_PATH,
        });
        error(`Configuração inválida em "${PROJECTS_PATH}". Verifique o JSON.`);
        _projects = {};
    }
    return _projects;
}

export function getProjects(): Record<string, string> {
    return loadProjects();
}

export function getProviderForProject(projectName: string): 'gitlab' | 'github' {
    const providers = loadProvidersConfig();
    const entries = Object.entries(providers);
    const entry = entries.find(([k]) => k === projectName);
    const cfg = entry?.[1];
    return cfg?.provider === 'github' ? 'github' : 'gitlab';
}

export function createManagerForProject(projectName: string, id: string): GitProvider {
    const provider = getProviderForProject(projectName);
    currentProvider = provider;
    if (provider === 'github') {
        const providers = loadProvidersConfig();
        const entries = Object.entries(providers);
        const entry = entries.find(([k]) => k === projectName);
        const cfg = entry?.[1];
        const repo = cfg?.repo ?? id;
        const ghToken = Config.get('githubToken') || Config.get('gitToken') || '';
        if (!ghToken) throw new MissingTokenError('GitHub', 'GITHUB_TOKEN ou GIT_TOKEN');
        const ghApiUrl = Config.get('githubApiUrl') || 'https://api.github.com';
        return new GitHubManager(repo, ghToken, ghApiUrl);
    }
    if (!apiToken) throw new MissingTokenError('GitLab', 'GIT_TOKEN');
    return new GitLabManager(id, apiToken, gitlabBaseUrl);
}

export function pushHistory(op: string, detail: string, status: string): void {
    sessionContext.pushHistory(op, detail, status);
    updateState((state: StateContainer) => {
        let history: Array<{ op: string; detail: string; status: string; ts: string }>;
        if (Array.isArray(state['history'])) {
            history = state['history'] as Array<{ op: string; detail: string; status: string; ts: string }>;
        } else {
            history = [];
            state['history'] = history;
        }
        history.push({ op, detail, status, ts: new Date().toISOString() });
        if (history.length > 50) {
            state['history'] = history.slice(-50);
        }
    });
}

export function printSessionSummary(): void {
    const state = (() => {
        try {
            return loadState() as { history?: Array<{ status: string; op: string; detail: string }> };
        } catch (err) {
            rootLogger.debug('Failed to load session state: ' + (err instanceof Error ? err.message : String(err)));
            return {};
        }
    })();
    sharedPrintSessionSummary(sessionContext.sessionCounters, sessionContext.lastOperation, state.history);
}

export function providerLabel(): string {
    return _providerLabel(currentProvider);
}

/** Clear the cached projects/config so the next `getProjects()` call re-reads from disk.
 *  Used after the setup wizard creates new projects. */
export function clearProjectCache(): void {
    _providersConfig = undefined;
    _projects = undefined;
}

/** Reset internal caches and mutable state for test isolation. @internal */
export function _resetForTest(): void {
    clearProjectCache();
    currentProjectName = '';
    currentProvider = 'gitlab';
    isBusy = false;
    manager = null;
    _setGlobalHub(undefined);
    sessionContext.sessionCounters = [];
}

export function displayProjects(names?: string[], lastProject?: string): void {
    const projs = loadProjects();
    title('Projetos');
    const keys = names ?? Object.keys(projs).sort((a, b) => a.localeCompare(b));
    keys.forEach((name, i) => {
        const p = getProviderForProject(name);
        const tag = p === 'github' ? ' [GH]' : ' [GL]';
        const marker = name === lastProject ? palette.muted(' *') : '';
        print('  ' + (i + 1) + '  ' + name + tag + marker);
    });
    print('  ' + (keys.length + 1) + '  Sair');
}

export async function displayRecentPipelines(m: GitProvider): Promise<void> {
    try {
        const pipelines = await m.getRecentPipelines(5);
        if (pipelines.length > 0) {
            print('  Últimas pipelines:');
            pipelines.slice(0, 3).forEach((p) => {
                const id = p.id ?? p.run_number ?? '?';
                const ref = p.ref ?? p.head_branch ?? '';
                const s = String(p.status ?? p.conclusion ?? '?');
                let icon: string;
                if (s === 'success') {
                    icon = '\u2713';
                } else if (s === 'failed') {
                    icon = '\u2717';
                } else {
                    icon = '~';
                }
                print('    #' + id + ' ' + ref + ' — ' + icon + ' ' + s);
            });
            print('');
        }
        if (currentProjectName) {
            const hub = getDataHub();
            const flakinessEntries = hub?.computed.flakinessEntries ?? [];
            const highFlakiness = flakinessEntries.filter((f) => f.project === currentProjectName && f.rate > 0.3);
            if (highFlakiness.length > 0) {
                warn('  ⚠ ' + highFlakiness.length + ' teste(s) com flakiness >30% em ' + currentProjectName);
            }
        }
    } catch (err) {
        rootLogger.warn('Flakiness check failed: ' + formatErr(err));
    }
}

export function buildActionChoices(): JsonObject[] {
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    const choices: JsonObject[] = [
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
        { name: '      Setup wizard CI/CD (w)', value: 'w' },
        { name: '      Exportar variáveis CI/CD', value: '8' },
        { name: '      Trocar de projeto', value: '9' },
        { name: '      Dashboard flakiness (HTML)', value: 'a' },
        { name: '      Comparar execuções (HTML)', value: 'c' },
        { name: '      Dashboards individuais', value: 'd' },
        { name: '      CI Data Hub (resumo)', value: 'h' },
        { name: '      Git Metrics Adapter (doc)', value: 'e' },
        { name: '      Bug Report Interativo', value: 'g' },
        { name: '      AI PR Description', value: 'i' },
        { name: '      Configurar PR Report', value: 'f' },
        { name: '      Pipeline health (HTML)', value: 'p' },
        { name: '      Quality Gate (HTML)', value: 'q' },
        { name: '      Relatório completo de qualidade', value: 'r' },
        { name: '      Toggle: Bug automático', value: 't' },
        { name: '      Executar batch', value: 'b' },
        { name: '      Voltar ao menu principal', value: '0' },
        { type: 'separator', line: '        ' },
        { name: '      /help  Ajuda', value: '/help' },
        { name: '      /history  Histórico', value: '/history' },
    );
    return choices;
}
