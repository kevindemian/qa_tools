import Config from './config-accessor.js';
import { getProject, isValidProjectName } from './project-registry.js';
import { applyProjectEnvOverlay } from './env-loader.js';
import type { ProjectEntry } from './types/project.js';

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
    Config.set('qaCurrentProject', '');
    Config.set('qaProjectDir', '');
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
