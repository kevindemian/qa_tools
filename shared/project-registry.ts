import fs from 'node:fs';
import path from 'node:path';
import { rootLogger } from './logger.js';
import { projectEntrySchema, projectRegistrySchema } from './types/project.js';
import type { ProjectEntry, ProjectRegistry } from './types/project.js';
import { isValidProjectName, projectConfigDir, projectEnvPath, registryDir } from './project-paths.js';

export { isValidProjectName, projectConfigDir, projectEnvPath };

/** A project as listed, augmented with a computed `valid` flag (dir exists on disk). */
export type ListedProject = ProjectEntry & { valid: boolean };

function hasOwn(reg: object, name: string): boolean {
    return Object.prototype.hasOwnProperty.call(reg, name);
}

function registryPath(): string {
    return path.join(registryDir(), 'projects.json');
}

function backupPath(): string {
    return path.join(registryDir(), 'projects.json.bak');
}

function dirExists(dir: string | undefined): boolean {
    if (!dir) return false;
    return fs.existsSync(path.resolve(dir));
}

/**
 * Build a null-prototype registry so arbitrary keys (e.g. "__proto__", "valueOf") are own properties.
 * Validation uses the record schema, but the registry is built from the original object (not the
 * Zod-reconstructed plain object) to avoid prototype-pollution when serializing/reading "__proto__".
 */
function toRegistry(data: unknown): ProjectRegistry | null {
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (err) {
            rootLogger.warn('project-registry: Failed to parse JSON: ' + (err instanceof Error ? err.message : String(err)));
            return null;
        }
    }
    const validated = projectRegistrySchema.safeParse(data);
    if (!validated.success) return null;
    const reg = Object.create(null) as ProjectRegistry;
    for (const [k, v] of Object.entries(data as Record<string, ProjectEntry>)) reg[k] = v;
    return reg;
}

/** Load the registry. Returns an empty registry when no file exists. Corrupt files are restored from backup. */
export function loadRegistry(): ProjectRegistry {
    const file = registryPath();
    if (!fs.existsSync(file)) return Object.create(null) as ProjectRegistry;
    const parsed = toRegistry(fs.readFileSync(file, 'utf8'));
    if (parsed) return parsed;

    const bak = backupPath();
    if (fs.existsSync(bak)) {
        const bakParsed = toRegistry(fs.readFileSync(bak, 'utf8'));
        if (bakParsed) {
            rootLogger.warn('projects.json corrompido; restaurando de backup ' + bak);
            return bakParsed;
        }
    }
    throw new Error('Registry corrompido e sem backup válido: ' + file);
}

/** Persist the registry. Validates every entry, then writes atomically and copies to backup (last-good state). */
export function saveRegistry(registry: ProjectRegistry): void {
    for (const e of Object.values(registry)) {
        const r = projectEntrySchema.safeParse(e);
        if (!r.success) {
            throw new Error('Registry inválido, abortando save: ' + r.error.message);
        }
    }
    fs.mkdirSync(registryDir(), { recursive: true });
    const file = registryPath();
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    fs.copyFileSync(file, backupPath());
}

/** Add or update a project (idempotent by name). */
export function addProject(entry: ProjectEntry): void {
    const result = projectEntrySchema.safeParse(entry);
    if (!result.success) {
        throw new Error('ProjectEntry inválido: ' + result.error.message);
    }
    const reg = loadRegistry();
    reg[result.data.name] = result.data;
    saveRegistry(reg);
}

/** Patch an existing project. Throws if the project does not exist or the merge is invalid. */
export function updateProject(name: string, patch: Partial<ProjectEntry>): void {
    if (!name) throw new Error('updateProject requer name não-vazio');
    const reg = loadRegistry();
    if (!hasOwn(reg, name)) throw new Error('Projeto não encontrado para atualização: ' + name);
    const existing = reg[name];
    const merged = projectEntrySchema.safeParse({ ...existing, ...patch, name });
    if (!merged.success) {
        throw new Error('ProjectEntry resultante inválido: ' + merged.error.message);
    }
    reg[name] = merged.data;
    saveRegistry(reg);
}

/** Remove a project. Returns false if it was not present. */
export function removeProject(name: string): boolean {
    if (!name) return false;
    const reg = loadRegistry();
    if (!hasOwn(reg, name)) return false;
    delete reg[name];
    saveRegistry(reg);
    return true;
}

/** List all projects with a computed `valid` flag (true when `dir` exists on disk). */
export function listProjects(): ListedProject[] {
    const reg = loadRegistry();
    return Object.values(reg).map((e) => ({ ...e, valid: dirExists(e.dir) }));
}

/** Get a single project (with `valid` flag) or undefined. */
export function getProject(name: string): ListedProject | undefined {
    if (!name) return undefined;
    const reg = loadRegistry();
    if (!hasOwn(reg, name)) return undefined;
    const e = reg[name];
    if (!e) return undefined;
    return { ...e, valid: dirExists(e.dir) };
}
