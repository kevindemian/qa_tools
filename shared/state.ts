/** Persisted session state (JSON file + backup).
 * Stores user preferences like last project, CSV path, and Cypress dir.
 * Resilient to corruption: recovers from `.bak` on parse failure. */
import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config.js';
import { rootLogger } from './logger.js';
import { warn } from './prompt.js';
import type { StateSchema } from './types.js';

const UTF8 = 'utf8';

function getStateDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    return xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
}

function ensureStateDir(config?: Config): boolean {
    const dir = getStateDir(config);
    try {
        fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch (err) {
        rootLogger.warn('Failed to ensure state dir: ' + (err instanceof Error ? err.message : String(err)));
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

/** Migrate state from the legacy `~/.qa_tools_state.json` path to the new XDG path.
 * Called once at import. Safe to call multiple times (no-op if already migrated). */
export function migrateOldState(config?: Config): void {
    const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
    try {
        if (fs.existsSync(OLD_STATE_PATH) && !fs.existsSync(statePath(config))) {
            const oldData = fs.readFileSync(OLD_STATE_PATH, UTF8);
            fs.writeFileSync(tmpPath(config), oldData, UTF8);
            fs.renameSync(tmpPath(config), statePath(config));
            try {
                fs.unlinkSync(OLD_STATE_PATH + '.bak');
            } catch {
                rootLogger.debug('Old backup file not found for cleanup — expected during first migration');
            }
            try {
                fs.unlinkSync(OLD_STATE_PATH + '.tmp');
            } catch {
                rootLogger.debug('Old tmp file not found for cleanup — expected during first migration');
            }
            try {
                fs.unlinkSync(OLD_STATE_PATH);
            } catch {
                rootLogger.debug('Old state file not found for cleanup — expected during first migration');
            }
        }
    } catch (err: unknown) {
        rootLogger.warn('Falha na migração de estado', err);
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
export function load(config?: Config): Record<string, unknown> {
    ensureStateDir(config);
    const sp = statePath(config);
    const bp = bakPath(config);
    const tp = tmpPath(config);
    try {
        if (fs.existsSync(sp)) {
            return JSON.parse(fs.readFileSync(sp, UTF8)) as Record<string, unknown>;
        }
    } catch (err: unknown) {
        warn('Arquivo de estado corrompido. Recuperando backup...');
        rootLogger.warn('Arquivo de estado corrompido, recuperando backup...', (err as Error).message);
        try {
            if (fs.existsSync(bp)) {
                const backup: Record<string, unknown> = JSON.parse(fs.readFileSync(bp, UTF8)) as Record<
                    string,
                    unknown
                >;
                fs.writeFileSync(tp, JSON.stringify(backup, null, 2), UTF8);
                fs.renameSync(tp, sp);
                return backup;
            }
        } catch (err2) {
            warn('Falha ao recuperar backup de estado.');
            rootLogger.error('Falha ao recuperar backup de estado: ' + (err2 as Error).message);
        }
        try {
            fs.renameSync(sp, bp);
            warn('Backup salvo. Criando novo estado.');
            rootLogger.warn('Backup salvo em ' + bp + '. Criando novo estado.');
        } catch (err3) {
            warn('Falha ao salvar backup de estado.');
            rootLogger.error('Falha ao salvar backup de estado: ' + (err3 as Error).message);
        }
    }
    return {};
}

/** Persist state to disk (main file + backup). Removes `.tmp` on success. */
export function save(state: Record<string, unknown>, config?: Config): void {
    ensureStateDir(config);
    const sp = statePath(config);
    const tp = tmpPath(config);
    const bp = bakPath(config);
    try {
        fs.writeFileSync(tp, JSON.stringify(state, null, 2), UTF8);
        fs.renameSync(tp, sp);
        fs.writeFileSync(bp, JSON.stringify(state, null, 2), UTF8);
    } catch (err) {
        warn('Falha ao salvar estado. Alteracoes podem ser perdidas.');
        rootLogger.error('Falha ao salvar estado: ' + (err as Error).message);
    }
}

/** Load, mutate via callback, then save. Returns the mutated copy.
 * @example `update((s) => { s.lastProject = 'PROJ'; })` */
export function update(fn: (state: Record<string, unknown>) => void, config?: Config): Record<string, unknown> {
    const state = load(config);
    const copy: Record<string, unknown> = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    fn(copy);
    save(copy, config);
    return copy;
}

/** Type-safe variant of {@link update}. Callback receives typed StateSchema.
 * @example `updateTyped((s) => { s._llmConfigured = true; })` */
export function updateTyped(fn: (state: StateSchema) => void, config?: Config): StateSchema {
    return update((s) => fn(s), config);
}
