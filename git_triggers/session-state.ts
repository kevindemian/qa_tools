/** Session state — persist/load session context as JSON for the git_triggers lifecycle. */
import fs from 'fs';
import path from 'path';
import Config from '../shared/config';
import { rootLogger } from '../shared/logger';
import { SessionContext } from '../shared/session-context';
import { update as updateState } from '../shared/state';
import { printSessionSummary as sharedPrintSessionSummary } from '../shared/cli_base';
import { providerLabel as _providerLabel } from './ui-helpers';
import { error, print, title, warn } from '../shared/prompt';
import { loadMetrics, calculateFlakiness } from '../shared/metrics';
import type { GitProvider, JsonObject, StateContainer } from '../shared/types';
import GitLabManager from './gitlab_manager';
import GitHubManager from './github_manager';

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

export const apiToken: string = Config.gitToken || '';
export const gitlabBaseUrl: string = Config.gitBaseUrl || '';

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

export const MSG_OPERATION_CANCELED = 'Operação cancelada.';

const PROVIDERS_PATH = path.resolve(__dirname, '../config/providers.json');
const PROJECTS_PATH = path.resolve(__dirname, '../config/projects.json');

let _providersConfig: Record<string, ProviderConfig> | undefined;
let _projects: Record<string, string> | undefined;

function loadProvidersConfig(): Record<string, ProviderConfig> {
    if (_providersConfig) return _providersConfig;
    try {
        _providersConfig = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
    } catch {
        rootLogger.warn('Falha ao carregar providers.json. Usando GitLab como padrao.');
        _providersConfig = {};
    }
    return _providersConfig!;
}

function loadProjects(): Record<string, string> {
    if (_projects) return _projects;
    try {
        _projects = JSON.parse(fs.readFileSync(PROJECTS_PATH, 'utf8'));
        const projectOverrides = Config.getAllPrefixed('PROJECT_ID_');
        for (const key of Object.keys(_projects!)) {
            const envKey = 'PROJECT_ID_' + key.toUpperCase();
            if (projectOverrides[envKey]) {
                _projects![key] = projectOverrides[envKey];
            }
        }
    } catch (err: unknown) {
        rootLogger.error(
            `Falha ao carregar configuração de projetos de "${PROJECTS_PATH}": ${(err as Error).message}`,
            {
                configPath: PROJECTS_PATH,
            },
        );
        error(`Configuração inválida em "${PROJECTS_PATH}". Verifique o JSON.`);
        process.exitCode = 1;
        _projects = {};
    }
    return _projects!;
}

export function getProjects(): Record<string, string> {
    return loadProjects();
}

export function getProviderForProject(projectName: string): 'gitlab' | 'github' {
    const cfg = loadProvidersConfig()[projectName];
    return cfg?.provider === 'github' ? 'github' : 'gitlab';
}

export function createManagerForProject(projectName: string, id: string): GitProvider {
    const provider = getProviderForProject(projectName);
    currentProvider = provider;
    if (provider === 'github') {
        const cfg = loadProvidersConfig()[projectName];
        const repo = cfg?.repo ?? id;
        const ghToken = Config.githubToken || Config.gitToken || '';
        const ghApiUrl = Config.githubApiUrl || 'https://api.github.com';
        return new GitHubManager(repo, ghToken, ghApiUrl);
    }
    return new GitLabManager(id, apiToken, gitlabBaseUrl);
}

export function pushHistory(op: string, detail: string, status: string): void {
    sessionContext.pushHistory(op, detail, status);
    updateState((state: StateContainer) => {
        let history: Array<{ op: string; detail: string; status: string; ts: string }>;
        if (Array.isArray(state.history)) {
            history = state.history;
        } else {
            history = [];
            state.history = history;
        }
        history.push({ op, detail, status, ts: new Date().toISOString() });
        if (history.length > 50) {
            state.history = history.slice(-50);
        }
    });
}

export function printSessionSummary(): void {
    sharedPrintSessionSummary(sessionContext.sessionCounters, sessionContext.lastOperation);
}

export function providerLabel(): string {
    return _providerLabel(currentProvider);
}

export function displayProjects(): void {
    const projs = loadProjects();
    title('Projetos');
    const names = Object.keys(projs);
    names.forEach((name, i) => {
        const p = getProviderForProject(name);
        const tag = p === 'github' ? ' [GH]' : ' [GL]';
        print('  ' + (i + 1) + '  ' + name + tag);
    });
    print('  ' + (names.length + 1) + '  Sair');
}

export async function displayRecentPipelines(m: GitProvider): Promise<void> {
    try {
        const pipelines = await m.getRecentPipelines(5);
        if (pipelines && pipelines.length > 0) {
            print('  Últimas pipelines:');
            pipelines.slice(0, 3).forEach((p) => {
                const id = p.id ?? p.run_number ?? '?';
                const ref = p.ref ?? p.head_branch ?? '';
                const s = String(p.status ?? p.conclusion ?? '?');
                const icon = s === 'success' ? '\u2713' : s === 'failed' ? '\u2717' : '~';
                print('    #' + id + ' ' + ref + ' — ' + icon + ' ' + s);
            });
            print('');
        }
        if (currentProjectName) {
            const store = loadMetrics();
            const projectRuns = store.runs.filter((r) => r.project === currentProjectName);
            if (projectRuns.length >= 2) {
                const flaky = calculateFlakiness({ runs: projectRuns }, 2);
                const highFlakiness = flaky.filter((f: { rate: number }) => f.rate > 0.3);
                if (highFlakiness.length > 0) {
                    warn('  ⚠ ' + highFlakiness.length + ' teste(s) com flakiness >30% em ' + currentProjectName);
                }
            }
        }
    } catch (err) {
        rootLogger.warn('Flakiness check failed: ' + (err as Error).message);
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
        { name: '      Exportar variáveis CI/CD', value: '8' },
        { name: '      Trocar de projeto', value: '9' },
        { name: '      Dashboard flakiness (HTML)', value: 'a' },
        { name: '      Voltar ao menu principal', value: '0' },
        { type: 'separator', line: '        ' },
        { name: '      /help  Ajuda', value: '/help' },
        { name: '      /history  Histórico', value: '/history' },
    );
    return choices;
}
