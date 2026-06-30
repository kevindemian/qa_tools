import { palette } from './palette.js';
import { defaultOutput, Output } from './output.js';
import { createJiraAuthHeader } from './jira-auth.js';
import type { JiraMode } from './jira-auth.js';
import { rootLogger } from './logger.js';

type FigletModule = { textSync: (str: string, opts?: Record<string, unknown>) => string };
type GradientModule = { default: (colors: string[]) => (text: string) => string };
type HttpModule = typeof import('http');

interface DepCache {
    figlet?: FigletModule;
    gradient?: GradientModule;
    https?: HttpModule;
    http?: HttpModule;
}

const _cache: DepCache = {};

export function __setFigletDep(mod: unknown): void {
    _cache.figlet = mod as FigletModule;
}

export function __setGradientDep(mod: unknown): void {
    _cache.gradient = mod as GradientModule;
}

export function __setHttpsDep(mod: unknown): void {
    _cache.https = mod as HttpModule;
}

export function __setHttpDep(mod: unknown): void {
    _cache.http = mod as HttpModule;
}

async function ensureDeps(): Promise<void> {
    if (!_cache.figlet) _cache.figlet = (await import('figlet')) as unknown as FigletModule; // structural: dual CJS/ESM — @types/figlet declares `export =` but runtime ESM entry wraps in `{ default: f }`
    if (!_cache.gradient) _cache.gradient = await import('gradient-string');
}

interface StatusCheck {
    label: string;
    status: 'ok' | 'error' | 'info';
    detail: string;
}

export async function checkJiraStatus(baseUrl: string, token: string, mode?: JiraMode): Promise<StatusCheck> {
    if (!baseUrl || !token) return { label: 'Jira API', status: 'info', detail: 'não configurado' };
    try {
        const start = Date.now();
        const https = _cache.https ?? (await import('https'));
        const http = _cache.http ?? (await import('http'));
        const mod = baseUrl.startsWith('https') ? https : http;
        const authHeader = createJiraAuthHeader(token, mode ?? 'server');
        await new Promise<void>((resolve, reject) => {
            const req = mod.get(
                baseUrl + '/rest/api/2/myself',
                { headers: { Authorization: authHeader.Authorization }, timeout: 2000 },
                (res: import('http').IncomingMessage) => {
                    res.resume();
                    resolve();
                },
            );
            req.on('error', reject);
            req.setTimeout(2000, () => {
                req.destroy();
                reject(new Error('timeout'));
            });
        });
        const ms = Date.now() - start;
        return { label: 'Jira API', status: 'ok', detail: '🟢 online (' + ms + 'ms)' };
    } catch (err) {
        rootLogger.debug('Jira status check failed: ' + (err instanceof Error ? err.message : String(err)));
        return { label: 'Jira API', status: 'error', detail: '🔴 offline' };
    }
}

export function buildSplashLines(
    logo: string,
    statePath?: string,
    statusChecks?: StatusCheck[],
    healthScore?: { score: number; grade: string },
): string[] {
    const splash: string[] = [''];
    const logoLines = logo.split('\n');
    for (const line of logoLines) {
        if (line.trim()) splash.push('  ' + palette.muted(line));
    }
    splash.push('');
    splash.push(palette.muted('          Gestão de Testes & Automação de CI/CD'));
    splash.push('');
    if (statusChecks) {
        for (const c of statusChecks) {
            let dot: string;
            if (c.status === 'ok') {
                dot = palette.green('●');
            } else if (c.status === 'error') {
                dot = palette.red('●');
            } else {
                dot = palette.muted('○');
            }
            splash.push('  ' + dot + ' ' + c.label + ': ' + palette.muted(c.detail));
        }
        splash.push('');
    }
    if (healthScore) {
        let healthColor: (s: string) => string;
        if (healthScore.grade === 'excellent' || healthScore.grade === 'good') {
            healthColor = palette.green;
        } else if (healthScore.grade === 'needs_attention') {
            healthColor = palette.yellow;
        } else {
            healthColor = palette.red;
        }
        splash.push(healthColor('  Health: ' + healthScore.score + '/100 (' + healthScore.grade + ')'));
        splash.push('');
    }
    if (statePath) {
        splash.push(palette.muted('  State: ' + statePath));
        splash.push('');
    }
    splash.push(palette.blue('  /help  Ajuda · /docs  Documentação'));
    splash.push(palette.green('  --batch  Modo headless para CI/CD'));
    splash.push(palette.muted('  Categorias: 1-6  ·  /help <tópico>  ·  /exit'));
    splash.push('');
    return splash;
}

export async function showSplash(
    statePath?: string,
    jiraBaseUrl?: string,
    jiraToken?: string,
    jiraMode?: JiraMode,
    healthScore?: { score: number; grade: string },
): Promise<void> {
    const isTTY = Output.isTTY() && !Output.isCI();

    if (!isTTY) {
        defaultOutput.print('🔧 QA Tools  v1.0.0 — Gestão de Testes & Automação de CI/CD');
        if (statePath) defaultOutput.print('  State: ' + statePath);
        return;
    }

    try {
        await ensureDeps();
        const figletInstance = _cache.figlet;
        const gradientModule = _cache.gradient;
        if (!figletInstance || !gradientModule) {
            defaultOutput.print('🔧 QA Tools  v1.0.0 — Gestão de Testes & Automação de CI/CD');
            if (statePath) defaultOutput.print('  State: ' + statePath);
            return;
        }
        const logo = figletInstance.textSync('QA TOOLS', { font: 'ANSI Shadow' });
        const grad = gradientModule.default;
        const colored = grad(['#58a6ff', '#bc8cff'])(logo);

        const checks: StatusCheck[] = [];
        if (jiraBaseUrl) {
            checks.push(await checkJiraStatus(jiraBaseUrl, jiraToken || '', jiraMode));
        }
        checks.push({
            label: 'Token',
            status: jiraToken ? 'ok' : 'info',
            detail: jiraToken ? '✓ configurado' : 'não configurado',
        });

        const splash = buildSplashLines(colored, statePath, checks.length > 0 ? checks : undefined, healthScore);
        defaultOutput.box(splash, { border: 'double', padding: 1 });
    } catch (err) {
        rootLogger.debug('Splash rendering failed: ' + (err instanceof Error ? err.message : String(err)));
        defaultOutput.print('🔧 QA Tools  v1.0.0 — Gestão de Testes & Automação de CI/CD');
        if (statePath) defaultOutput.print('  State: ' + statePath);
    }
}
