/** Persisted session state (JSON file + backup).
 * Stores user preferences like last project, CSV path, and Cypress dir.
 * Resilient to corruption: recovers from `.bak` on parse failure. */
import fs from 'fs';
import path from 'path';
import Config from './config.js';
import { rootLogger } from './logger.js';
import { warn } from './prompt.js';
import type { StateSchema } from './types.js';

const UTF8 = 'utf8';

/** Validate that a resolved path is within the expected state directory. */
function isPathWithinStateDir(resolvedPath: string): boolean {
    const stateRoot = path.resolve(getStateDir());
    const normalized = path.resolve(resolvedPath);
    return normalized.startsWith(stateRoot + path.sep) || normalized === stateRoot;
}

function getStateDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    return xdg ? path.join(xdg, 'qa-tools') : path.join(import.meta.dirname, '.local', 'state', 'qa-tools');
}

function ensureStateDir(config?: Config): boolean {
    const dir = getStateDir(config);
    try {
        const resolved = path.resolve(dir);
        if (!isPathWithinStateDir(resolved)) {
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

function statePath(config?: Config): string {
    return path.join(getStateDir(config), 'state.json');
}

function tmpPath(config?: Config): string {
    return statePath(config) + '.tmp';
}
function bakPath(config?: Config): string {
    return statePath(config) + '.bak';
}

function cleanupOldFiles(OLD_STATE_PATH: string): void {
    for (const suffix of ['.bak', '.tmp', '']) {
        try {
            const resolved = path.resolve(OLD_STATE_PATH + suffix);
            if (!isPathWithinStateDir(resolved)) {
                rootLogger.debug('Old file cleanup: path traversal blocked');
                continue;
            }
            fs.unlinkSync(resolved);
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
        const resolvedOld = path.resolve(OLD_STATE_PATH);
        if (!isPathWithinStateDir(resolvedOld)) {
            rootLogger.warn('Old state migration: path traversal blocked');
            return;
        }
        if (fs.existsSync(resolvedOld) && !fs.existsSync(statePath(config))) {
            const oldData = fs.readFileSync(resolvedOld, UTF8);
            const resolvedTmp = path.resolve(tmpPath(config));
            if (!isPathWithinStateDir(resolvedTmp)) {
                rootLogger.warn('Old state migration: path traversal blocked for tmp');
                return;
            }
            fs.writeFileSync(resolvedTmp, oldData, UTF8);
            fs.renameSync(resolvedTmp, statePath(config));
            cleanupOldFiles(OLD_STATE_PATH);
        }
    } catch (err: unknown) {
        rootLogger.warn(
            'Falha na migração de estado. Verifique se o arquivo ~/.qa_tools_state.json existe e pode ser lido.',
            err,
        );
    }
}

ensureStateDir();
migrateOldState();

/** Get the absolute path to the state JSON file for the given config. */
export function getStatePath(config?: Config): string {
    return statePath(config);
}

/** Load and return the state cast to {@link StateSchema}.
 * @see load for uncoupled access. */
export function loadTypedState(config?: Config): StateSchema {
    return load(config);
}

/** Load persisted state from disk. Recovers from backup on corruption.
 * @returns A plain object (empty `{}` when no file or unrecoverable). */
function tryRecoverBackup(bp: string, tp: string, sp: string): { [key: string]: unknown } | null {
    try {
        const resolvedBp = path.resolve(bp);
        if (!isPathWithinStateDir(resolvedBp)) {
            rootLogger.debug('Backup recovery: path traversal blocked');
            return null;
        }
        if (fs.existsSync(resolvedBp)) {
            const backup: { [key: string]: unknown } = JSON.parse(fs.readFileSync(resolvedBp, UTF8)) as {
                [key: string]: unknown;
            };
            const resolvedTp = path.resolve(tp);
            if (!isPathWithinStateDir(resolvedTp)) {
                rootLogger.debug('Backup recovery: path traversal blocked for tmp');
                return null;
            }
            fs.writeFileSync(resolvedTp, JSON.stringify(backup, null, 2), UTF8);
            fs.renameSync(resolvedTp, sp);
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
        const resolvedSp = path.resolve(sp);
        if (!isPathWithinStateDir(resolvedSp)) {
            rootLogger.debug('Corrupted backup: path traversal blocked');
            return;
        }
        fs.renameSync(resolvedSp, bp);
        warn('Backup salvo. Criando novo estado.');
        rootLogger.warn('Backup salvo em ' + bp + '. Criando novo estado.');
    } catch (err3) {
        warn('Falha ao salvar backup de estado.');
        rootLogger.error(
            'Falha ao salvar backup de estado. Verifique permissões de escrita e espaço em disco: ' + String(err3),
        );
    }
}

export function load(config?: Config): { [key: string]: unknown } {
    ensureStateDir(config);
    const sp = statePath(config);
    const bp = bakPath(config);
    const tp = tmpPath(config);
    try {
        const resolvedSp = path.resolve(sp);
        if (!isPathWithinStateDir(resolvedSp)) {
            rootLogger.warn('State load: path traversal blocked');
            return {};
        }
        if (fs.existsSync(resolvedSp)) {
            return JSON.parse(fs.readFileSync(resolvedSp, UTF8)) as { [key: string]: unknown };
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

/** Persist state to disk (main file + backup). Removes `.tmp` on success. */
export function save(state: { [key: string]: unknown }, config?: Config): void {
    ensureStateDir(config);
    const sp = statePath(config);
    const tp = tmpPath(config);
    const bp = bakPath(config);
    try {
        const resolvedTp = path.resolve(tp);
        if (!isPathWithinStateDir(resolvedTp)) {
            rootLogger.warn('State save: path traversal blocked for tmp');
            return;
        }
        fs.writeFileSync(resolvedTp, JSON.stringify(state, null, 2), UTF8);
        fs.renameSync(resolvedTp, sp);
        const resolvedBp = path.resolve(bp);
        if (!isPathWithinStateDir(resolvedBp)) {
            rootLogger.warn('State save: path traversal blocked for backup');
            return;
        }
        fs.writeFileSync(resolvedBp, JSON.stringify(state, null, 2), UTF8);
    } catch (err) {
        warn('Falha ao salvar estado. Alteracoes podem ser perdidas.');
        rootLogger.error('Falha ao salvar estado. Verifique permissões de escrita e espaço em disco: ' + String(err));
    }
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
