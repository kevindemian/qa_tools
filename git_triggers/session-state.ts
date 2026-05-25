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
import type { GitProvider } from '../shared/types';
import GitLabManager from './gitlab_manager';
import GitHubManager from './github_manager';

export const sessionLog = rootLogger.child({ session: 'gitlab' });
export const sessionContext = new SessionContext();

export let projectId: string;
export let currentProjectName = '';
export let currentProvider: 'gitlab' | 'github' = 'gitlab';
export let isBusy = false;
export let manager: GitProvider | null = null;

export const apiToken: string = Config.gitToken || '';
export const gitlabBaseUrl: string = Config.gitBaseUrl || '';

export function setCurrentProvider(v: 'gitlab' | 'github') {
    currentProvider = v;
}
export function setCurrentProjectName(v: string) {
    currentProjectName = v;
}
export function setProjectId(v: string) {
    projectId = v;
}
export function setIsBusy(v: boolean) {
    isBusy = v;
}
export function setManager(v: GitProvider | null) {
    manager = v;
}

export const MSG_OPERATION_CANCELED = 'Operação cancelada.';

export const PROVIDERS_PATH = path.resolve(__dirname, '../config/providers.json');
export let providersConfig: Record<string, unknown> = {};
try {
    providersConfig = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
} catch {
    rootLogger.warn('Falha ao carregar providers.json. Usando GitLab como padrao.');
}

export const projectsPath = path.resolve(__dirname, '../config/projects.json');
export let projects: Record<string, string>;
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

export function getProviderForProject(projectName: string): 'gitlab' | 'github' {
    const cfg = providersConfig[projectName] as Record<string, unknown> | undefined;
    return cfg?.provider === 'github' ? 'github' : 'gitlab';
}

export function createManagerForProject(projectName: string, id: string): GitProvider {
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

export function pushHistory(op: string, detail: string, status: string) {
    sessionContext.pushHistory(op, detail, status);
    updateState((state: Record<string, unknown>) => {
        if (!state.history) state.history = [];
        (state.history as Array<unknown>).push({ op, detail, status, ts: new Date().toISOString() });
        if ((state.history as Array<unknown>).length > 50)
            (state.history as Array<unknown>) = (state.history as Array<unknown>).slice(-50);
    });
}

export function printSessionSummary() {
    sharedPrintSessionSummary(sessionContext.sessionCounters, sessionContext.lastOperation);
}

export function providerLabel(): string {
    return _providerLabel(currentProvider);
}

export function displayProjects() {
    title('Projetos');
    const names = Object.keys(projects);
    names.forEach((name, i) => {
        const p = getProviderForProject(name);
        const tag = p === 'github' ? ' [GH]' : ' [GL]';
        print('  ' + (i + 1) + '  ' + name + tag);
    });
    print('  ' + (names.length + 1) + '  Sair');
}

export async function displayRecentPipelines(m: GitProvider) {
    try {
        const pipelines = await m.getRecentPipelines(5);
        if (pipelines && pipelines.length > 0) {
            print('  Últimas pipelines:');
            pipelines.slice(0, 3).forEach((p) => {
                const id = (p.id as string) || (p.run_number as string) || '?';
                const ref = (p.ref as string) || (p.head_branch as string) || '';
                const s = (p.status as string) || (p.conclusion as string) || '?';
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
    } catch {}
}

export function buildActionChoices(): Array<Record<string, unknown>> {
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
        { name: '      Dashboard flakiness (HTML)', value: 'a' },
        { name: '      Voltar ao menu principal', value: '0' },
        { type: 'separator', line: '        ' },
        { name: '      /help  Ajuda', value: '/help' },
        { name: '      /history  Histórico', value: '/history' },
    );
    return choices;
}
