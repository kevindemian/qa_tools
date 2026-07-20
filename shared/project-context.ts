import fs from 'node:fs';
import path from 'node:path';
import Config from './config-accessor.js';
import { getProject, isValidProjectName } from './project-registry.js';
import { applyProjectEnvOverlay } from './env-loader.js';
import { projectEntrySchema } from './types/project.js';
import type { ProjectEntry } from './types/project.js';

/**
 * In-memory self-host entry for the repository currently checked out. Populated by
 * `ensureSelfHostProject` when a `--project X` matches the CWD repo. Lets downstream factory
 * functions (manager creation, provider lookup) resolve without persisting to the registry.
 */
let selfHostEntry: ProjectEntry | undefined;

/** Read the resolved self-host entry, if any. Undefined when the current invocation is not self-host. */
export function getSelfHostEntry(): ProjectEntry | undefined {
    return selfHostEntry;
}

/**
 * Parse a git remote URL into `{ provider, projectId }`.
 * Supports SSH (`git@github.com:owner/repo.git`), HTTPS (`https://github.com/owner/repo.git`),
 * and GitLab equivalents. Returns undefined when the URL cannot be classified.
 *
 * URLs with embedded credentials (`https://user:token@host/owner/repo.git`) are normalized by
 * stripping the `userinfo` component before classification — this is correct URL parsing, not
 * error suppression: an unclassifiable host still returns undefined and `ensureSelfHostProject`
 * still fails loud ("Projeto não registrado").
 */
const SSH_REMOTE_RE = /^git@([^:]+):(.+)$/;
const HTTP_REMOTE_RE = /^https?:\/\/([^/]+)\/(.+)$/;
const USERINFO_RE = /^https?:\/\/[^@]+@/;

function stripUserinfo(url: string): string {
    if (USERINFO_RE.test(url)) {
        return url.replace(USERINFO_RE, 'https://');
    }
    return url;
}

function parseRemoteUrl(url: string): { provider: 'github' | 'gitlab'; projectId: string } | undefined {
    const trimmed = stripUserinfo(url.trim().replace(/\.git$/, ''));
    const sshMatch = SSH_REMOTE_RE.exec(trimmed);
    const httpMatch = HTTP_REMOTE_RE.exec(trimmed);
    const match = sshMatch ?? httpMatch;
    if (!match) return undefined;
    const host = match[1];
    const repo = match[2];
    if (!host || !repo) return undefined;
    if (host.toLowerCase() === 'github.com') return { provider: 'github', projectId: repo };
    if (host.toLowerCase().endsWith('gitlab.com')) return { provider: 'gitlab', projectId: repo };
    return undefined;
}

/**
 * Resolve the `origin` remote URL of a repository by reading `.git/config` directly (PATH-free,
 * no subprocess). Handles both a standard `.git` directory and a `.git` worktree pointer file.
 * Returns undefined when the remote cannot be determined.
 */
function resolveRemoteUrl(cwd: string): string | undefined {
    try {
        const gitPath = path.join(cwd, '.git');
        let configPath = path.join(gitPath, 'config');
        if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) {
            const pointer = fs.readFileSync(gitPath, 'utf8');
            const gitdirLine = pointer
                .split('\n')
                .map((l) => l.trim())
                .find((l) => l.startsWith('gitdir:'));
            if (gitdirLine) {
                const gitdir = gitdirLine.slice('gitdir:'.length).trim();
                const resolvedGitdir = path.isAbsolute(gitdir) ? gitdir : path.resolve(cwd, gitdir);
                configPath = path.join(resolvedGitdir, 'config');
            }
        }
        if (!fs.existsSync(configPath)) return undefined;
        const cfg = fs.readFileSync(configPath, 'utf8');
        return extractOriginUrl(cfg);
    } catch {
        return undefined;
    }
}

/** Parse a git config string and return the `url` of the `[remote "origin"]` section, if any. */
function extractOriginUrl(cfg: string): string | undefined {
    const lines = cfg.split('\n');
    let inOrigin = false;
    for (const raw of lines) {
        const line = raw.trim();
        if (line.startsWith('[remote')) {
            inOrigin = /"origin"/.test(line);
            continue;
        }
        if (!inOrigin) continue;
        if (line.startsWith('url')) {
            const eq = line.indexOf('=');
            if (eq >= 0) return line.slice(eq + 1).trim();
        }
        if (line.startsWith('[')) inOrigin = false;
    }
    return undefined;
}

/** Fields that the per-project `.env` overlay may override (single override source, bounded whitelist). */
type OverridableField = 'provider' | 'projectId' | 'jiraKey' | 'framework';

const OVERRIDE_ENV_MAP: Partial<Record<OverridableField, string>> = {
    provider: 'QA_PROJECT_PROVIDER',
    projectId: 'QA_PROJECT_PROJECT_ID',
    jiraKey: 'QA_PROJECT_JIRA_KEY',
    framework: 'QA_PROJECT_FRAMEWORK',
};

/** Currently selected project name (from Config `qaCurrentProject`), or undefined when none (legado). */
export function getCurrentProject(): string | undefined {
    return Config.get('qaCurrentProject') || undefined;
}

/** Directory of the currently selected project (from Config `qaProjectDir`), or undefined when none. */
export function getCurrentProjectDir(): string | undefined {
    return Config.get('qaProjectDir') || undefined;
}

/** True when a project is selected. */
export function isProjectSelected(): boolean {
    return !!getCurrentProject();
}

/**
 * Select a project: validates it exists in the registry, sets the active Config (qaCurrentProject/qaProjectDir),
 * and applies the per-project `.env` overlay so the project's secrets/overrides take effect immediately.
 * Throws on invalid name (path traversal) or unknown project — never silent.
 */
export function setCurrentProject(name: string): void {
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);
    const entry = getProject(name);
    if (!entry) throw new Error('Projeto não registrado: ' + name);
    Config.set('qaCurrentProject', name);
    Config.set('qaProjectDir', entry.dir);
    applyProjectEnvOverlay(name);
}

/** Clear the active project selection. */
export function clearCurrentProject(): void {
    selfHostEntry = undefined;
    Config.set('qaCurrentProject', '');
    Config.set('qaProjectDir', '');
}

/**
 * Resolve the repository's own project (self-host) without persisting anything to the registry.
 *
 * Used when a command targets `--project X` where X is the repository currently checked out (e.g. the
 * qa_tools repo running its own `pr-report`). The registry is empty in CI and the legacy
 * `config/projects.json` is never read at runtime, so a checked-out repo must be resolvable directly
 * from its working directory.
 *
 * Resolution is strict and fail-loud:
 * - If X is already in the registry, select it normally (writes nothing new).
 * - Otherwise the current working directory MUST be a repository whose `package.json` `name` equals X,
 *   and whose `origin` remote resolves to a known provider (github/gitlab). The derived entry is
 *   injected in-memory only (via Config + module cache). No file under `~/.config/qa-tools` is written,
 *   so CI runners stay isolated and there is no read-modify-write race on the registry.
 * - If the CWD is not the requested project, or has no classifiable remote, throws
 *   (never silent, never falls back to another project).
 *
 * @param name Project name requested via `--project` / `QA_CURRENT_PROJECT`.
 * @param cwd Directory to resolve from (defaults to `process.cwd()`). Injected for hermetic testing.
 */
export function ensureSelfHostProject(name: string, cwd: string = process.cwd()): void {
    selfHostEntry = undefined;
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);
    const existing = getProject(name);
    if (existing) {
        setCurrentProject(name);
        return;
    }

    const resolvedDir = path.resolve(cwd);
    if (!fs.existsSync(resolvedDir)) {
        throw new Error('Projeto não registrado: ' + name);
    }

    let pkgName: unknown;
    try {
        const raw = fs.readFileSync(path.join(resolvedDir, 'package.json'), 'utf8');
        const parsedPkg = JSON.parse(raw) as { name?: unknown };
        pkgName = parsedPkg.name;
    } catch {
        throw new Error('Projeto não registrado: ' + name);
    }
    if (typeof pkgName !== 'string' || pkgName !== name) {
        throw new Error('Projeto não registrado: ' + name);
    }

    const remoteUrl = resolveRemoteUrl(resolvedDir);
    const remote = remoteUrl ? parseRemoteUrl(remoteUrl) : undefined;
    if (!remote) {
        throw new Error('Projeto não registrado: ' + name);
    }

    const entry: ProjectEntry = {
        name,
        dir: resolvedDir,
        provider: remote.provider,
        projectId: remote.projectId,
    };
    const parsed = projectEntrySchema.safeParse(entry);
    if (!parsed.success) {
        throw new Error('Projeto não registrado: ' + name);
    }
    selfHostEntry = parsed.data;
    Config.set('qaCurrentProject', name);
    Config.set('qaProjectDir', resolvedDir);
    applyProjectEnvOverlay(name);
}

/**
 * Resolve a project's effective config: the registry `ProjectEntry` merged (read-only) with any env-var
 * overrides supplied by the per-project `.env` overlay (single override source — no competing write path).
 * `envOverrides` exposes which fields were overridden and from which value.
 */
export function loadProjectConfig(
    name: string,
): ProjectEntry & { envOverrides: Partial<Record<OverridableField, string>> } {
    if (!isValidProjectName(name)) throw new Error('Nome de projeto inválido (path traversal): ' + name);
    const entry = getProject(name);
    if (!entry) throw new Error('Projeto não registrado: ' + name);

    const envOverrides: Partial<Record<OverridableField, string>> = {};
    for (const [field, envVar] of Object.entries(OVERRIDE_ENV_MAP) as [OverridableField, string][]) {
        const v = process.env[envVar];
        if (v !== undefined && v !== '') envOverrides[field] = v;
    }

    return { ...entry, ...envOverrides, envOverrides };
}
