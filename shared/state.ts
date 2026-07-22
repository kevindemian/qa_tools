/** Persisted session state (JSON file + backup).
 * Stores user preferences like last project, CSV path, and Cypress dir.
 * Resilient to corruption: recovers from `.bak` on parse failure.
 *
 * Multi-project (Fase 3): operational keys are stored per project under
 * `<xdgStateHome>/qa-tools/<project>/state.json`; global keys (`lastProject`,
 * `_llm*`) are stored in `<xdgStateHome>/qa-tools/global.json` and shared
 * across projects. When no project is selected, operational keys fall back to
 * the legacy `<xdgStateHome>/qa-tools/state.json`. */
import fs from 'fs';
import path from 'path';
import Config from './config-accessor.js';
import { rootLogger } from './logger.js';
import { warn } from './ui/prompt.js';
import { isValidProjectName } from './project-paths.js';
import type { StateSchema } from './types.js';

const UTF8 = 'utf8';

/** Keys persisted in the shared `global.json` (independent of the active project). Typed against StateSchema. */
const GLOBAL_STATE_KEYS: ReadonlyArray<keyof StateSchema> = [
    'lastProject',
    '_llmConfigured',
    '_llmConfigAttempts',
    '_llmConfigLastAttempt',
    '_llmConfigSuggestions',
    '_llmConfigError',
];

function isGlobalStateKey(key: string): boolean {
    return (GLOBAL_STATE_KEYS as readonly string[]).includes(key);
}

/** Validate that a resolved path is within the given base directory. */
function isPathWithinBase(resolvedPath: string, baseDir: string): boolean {
    const normalized = path.resolve(resolvedPath);
    const normalizedBase = path.resolve(baseDir);
    return normalized.startsWith(normalizedBase + path.sep) || normalized === normalizedBase;
}

function getStateDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    return xdg ? path.join(xdg, 'qa-tools') : path.join(import.meta.dirname, '.local', 'state', 'qa-tools');
}

function ensureStateDir(config?: Config): boolean {
    const dir = getStateDir(config);
    try {
        const resolved = path.resolve(dir);
        if (!isPathWithinBase(resolved, dir)) {
            rootLogger.warn('State dir: path traversal blocked');
            return false;
        }
        fs.mkdirSync(resolved, { recursive: true });
        return true;
    } catch (err) {
        rootLogger.warn('Failed to ensure state dir. Check write permissions and disk space: ' + String(err));
        return false;
    }
}

/** Resolve which project's state file to use.
 * - explicit `projectName` (valid) takes precedence
 * - else the currently-selected project (`qaCurrentProject`) when valid
 * - else `undefined` → legacy `state.json`
 * Invalid names throw (path-traversal guard / corrupt state — never silent). */
function resolveProjectName(projectName: string | undefined, config?: Config): string | undefined {
    if (projectName !== undefined) {
        if (!isValidProjectName(projectName)) {
            throw new Error('Nome de projeto inválido para state (path traversal): ' + projectName);
        }
        return projectName;
    }
    const current = config ? config.get('qaCurrentProject') : Config.get('qaCurrentProject');
    if (typeof current === 'string' && current.length > 0) {
        if (!isValidProjectName(current)) {
            throw new Error('qaCurrentProject inválido em state (estado corrupto): ' + current);
        }
        return current;
    }
    return undefined;
}

function statePath(projectName?: string, config?: Config): string {
    const resolved = resolveProjectName(projectName, config);
    const base = getStateDir(config);
    return resolved ? path.join(base, resolved, 'state.json') : path.join(base, 'state.json');
}

function globalPath(config?: Config): string {
    return path.join(getStateDir(config), 'global.json');
}

function tmpPath(projectName?: string, config?: Config): string {
    return statePath(projectName, config) + '.tmp';
}

function bakPath(projectName?: string, config?: Config): string {
    return statePath(projectName, config) + '.bak';
}

function cleanupOldFiles(OLD_STATE_PATH: string): void {
    for (const suffix of ['.bak', '.tmp', '']) {
        try {
            fs.unlinkSync(path.resolve(OLD_STATE_PATH + suffix));
        } catch (err) {
            rootLogger.debug(
                'Old ' +
                    (suffix || 'state') +
                    ' file not found for cleanup — expected during first migration: ' +
                    String(err),
            );
        }
    }
}

export function migrateOldState(config?: Config): void {
    const OLD_STATE_PATH = path.join(import.meta.dirname, '.qa_tools_state.json');
    try {
        if (fs.existsSync(path.resolve(OLD_STATE_PATH)) && !fs.existsSync(statePath(undefined, config))) {
            const oldData = fs.readFileSync(OLD_STATE_PATH, UTF8);
            fs.writeFileSync(path.resolve(tmpPath(undefined, config)), oldData, UTF8);
            fs.renameSync(path.resolve(tmpPath(undefined, config)), statePath(undefined, config));
            cleanupOldFiles(OLD_STATE_PATH);
        }
    } catch (err: unknown) {
        rootLogger.warn(
            'Falha na migração de estado. Verifique se o arquivo ~/.qa_tools_state.json existe e pode ser lido.',
            err,
        );
    }
}

/** Split legacy `state.json` into `global.json` (global keys) + `state.json` (operational keys).
 * Atomic, idempotent: no-op when `global.json` already exists or when there are no global keys. */
export function migrateLegacyState(config?: Config): void {
    const legacy = statePath(undefined, config);
    const gp = globalPath(config);
    try {
        if (fs.existsSync(path.resolve(gp))) return;
        if (!fs.existsSync(path.resolve(legacy))) return;
        let parsed: { [key: string]: unknown };
        try {
            parsed = JSON.parse(fs.readFileSync(path.resolve(legacy), UTF8)) as { [key: string]: unknown };
        } catch (err) {
<<<<<<< Updated upstream
            rootLogger.warn(
                'state: Failed to parse legacy state file: ' + (err instanceof Error ? err.message : String(err)),
            );
=======
            rootLogger.warn('state: Failed to parse legacy state file: ' + (err instanceof Error ? err.message : String(err)));
>>>>>>> Stashed changes
            return; // legado corrompido: load() trata a recuperação
        }
        const globalKeys: { [key: string]: unknown } = {};
        const operational: { [key: string]: unknown } = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (isGlobalStateKey(k)) globalKeys[k] = v;
            else operational[k] = v;
        }
        if (Object.keys(globalKeys).length === 0) return; // nada a migrar
        writeStateAtomic(gp, globalKeys);
        writeStateAtomic(legacy, operational);
    } catch (err: unknown) {
        rootLogger.warn('Falha na migração legado→global de estado: ' + String(err));
    }
}

ensureStateDir();
migrateOldState();
migrateLegacyState();

/** Get the absolute path to the state JSON file for the given config (current/legacy). */
export function getStatePath(config?: Config): string {
    return statePath(undefined, config);
}

/** Load and return the state cast to {@link StateSchema}.
 * @see load for uncoupled access. */
export function loadTypedState(config?: Config): StateSchema {
    return load(config);
}

/** Load persisted operational+global state from disk. Recovers from backup on corruption.
 * @returns A plain object (empty `{}` when no file or unrecoverable). */
function tryRecoverBackup(bp: string, tp: string, sp: string): { [key: string]: unknown } | null {
    try {
        if (fs.existsSync(path.resolve(bp))) {
            const backup: { [key: string]: unknown } = JSON.parse(fs.readFileSync(path.resolve(bp), UTF8)) as {
                [key: string]: unknown;
            };
            fs.writeFileSync(path.resolve(tp), JSON.stringify(backup, null, 2), UTF8);
            fs.renameSync(path.resolve(tp), sp);
            return backup;
        }
    } catch (err2) {
        warn('Falha ao recuperar backup de estado.');
        rootLogger.error(
            'Falha ao recuperar backup de estado. Verifique permissões de leitura do arquivo .bak: ' + String(err2),
        );
    }
    return null;
}

function renameCorruptedToBackup(sp: string, bp: string): void {
    try {
        fs.renameSync(path.resolve(sp), bp);
        warn('Backup salvo. Criando novo estado.');
        rootLogger.warn('Backup salvo em ' + bp + '. Criando novo estado.');
    } catch (err3) {
        warn('Falha ao salvar backup de estado.');
        rootLogger.error(
            'Falha ao salvar backup de estado. Verifique permissões de escrita e espaço em disco: ' + String(err3),
        );
    }
}

function loadOperational(projectName: string | undefined, config?: Config): { [key: string]: unknown } {
    ensureStateDir(config);
    const sp = statePath(projectName, config);
    const bp = bakPath(projectName, config);
    const tp = tmpPath(projectName, config);
    try {
        if (fs.existsSync(path.resolve(sp))) {
            return JSON.parse(fs.readFileSync(path.resolve(sp), UTF8)) as { [key: string]: unknown };
        }
    } catch (err: unknown) {
        warn('Arquivo de estado corrompido. Recuperando backup...');
        rootLogger.warn('Arquivo de estado corrompido, recuperando backup...', String(err));
        const backup = tryRecoverBackup(bp, tp, sp);
        if (backup) return backup;
        renameCorruptedToBackup(sp, bp);
    }
    return {};
}

function loadGlobal(config?: Config): { [key: string]: unknown } {
    const gp = globalPath(config);
    const gbp = gp + '.bak';
    const gtp = gp + '.tmp';
    try {
        if (fs.existsSync(path.resolve(gp))) {
            return JSON.parse(fs.readFileSync(path.resolve(gp), UTF8)) as { [key: string]: unknown };
        }
    } catch (err: unknown) {
        rootLogger.warn('global.json de estado corrompido, recuperando backup...', String(err));
        const backup = tryRecoverBackup(gbp, gtp, gp);
        if (backup) return backup;
        renameCorruptedToBackup(gp, gbp);
    }
    return {};
}

/** Load state (operational merged with global keys). */
export function load(config?: Config): { [key: string]: unknown } {
    return loadState(undefined, config);
}

/** Load state for an explicit project name (operational merged with global keys). */
export function loadState(projectName: string | undefined, config?: Config): { [key: string]: unknown } {
    const op = loadOperational(projectName, config);
    const gl = loadGlobal(config);
    return { ...op, ...gl };
}

function writeStateAtomic(filePath: string, data: { [key: string]: unknown }): void {
    const tp = filePath + '.tmp';
    const bp = filePath + '.bak';
    try {
        fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
        fs.writeFileSync(path.resolve(tp), JSON.stringify(data, null, 2), UTF8);
        fs.renameSync(path.resolve(tp), filePath);
        fs.writeFileSync(path.resolve(bp), JSON.stringify(data, null, 2), UTF8);
    } catch (err) {
        warn('Falha ao salvar estado. Alteracoes podem ser perdidas.');
        rootLogger.error('Falha ao salvar estado. Verifique permissões de escrita e espaço em disco: ' + String(err));
    }
}

/** Persist state to disk (main file + backup).
 * Global keys (`lastProject`, `_llm*`) → `global.json`; the rest → per-project/legacy operational file. */
export function save(state: { [key: string]: unknown }, config?: Config): void {
    saveState(undefined, state, config);
}

/** Persist state for an explicit project name. */
export function saveState(projectName: string | undefined, state: { [key: string]: unknown }, config?: Config): void {
    ensureStateDir(config);
    const operational: { [key: string]: unknown } = {};
    const global: { [key: string]: unknown } = {};
    for (const [k, v] of Object.entries(state)) {
        if (isGlobalStateKey(k)) global[k] = v;
        else operational[k] = v;
    }
    writeStateAtomic(statePath(projectName, config), operational);
    writeStateAtomic(globalPath(config), global);
}

/** Load, mutate via callback, then save. Returns the mutated copy.
 * @example `update((s) => { s.lastProject = 'PROJ'; })` */
export function update(fn: (state: { [key: string]: unknown }) => void, config?: Config): { [key: string]: unknown } {
    const state = load(config);
    const copy: { [key: string]: unknown } = structuredClone(state);
    fn(copy);
    save(copy, config);
    return copy;
}

/** Type-safe variant of {@link update}. Callback receives typed StateSchema.
 * @example `updateTyped((s) => { s._llmConfigured = true; })` */
export function updateTyped(fn: (state: StateSchema) => void, config?: Config): StateSchema {
    return update((s) => fn(s), config);
}
