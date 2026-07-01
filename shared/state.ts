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

function getStateDir(config?: Config): string {
    const xdg = config ? config.get('xdgStateHome') : Config.get('xdgStateHome');
    return xdg ? path.join(xdg, 'qa-tools') : path.join(import.meta.dirname, '.local', 'state', 'qa-tools');
}

function ensureStateDir(config?: Config): boolean {
    const dir = getStateDir(config);
    try {
        fs.mkdirSync(path.resolve(dir), { recursive: true });
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
        if (fs.existsSync(path.resolve(OLD_STATE_PATH)) && !fs.existsSync(statePath(config))) {
            const oldData = fs.readFileSync(OLD_STATE_PATH, UTF8);
            fs.writeFileSync(path.resolve(tmpPath(config)), oldData, UTF8);
            fs.renameSync(path.resolve(tmpPath(config)), statePath(config));
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

export function load(config?: Config): { [key: string]: unknown } {
    ensureStateDir(config);
    const sp = statePath(config);
    const bp = bakPath(config);
    const tp = tmpPath(config);
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

/** Persist state to disk (main file + backup). Removes `.tmp` on success. */
export function save(state: { [key: string]: unknown }, config?: Config): void {
    ensureStateDir(config);
    const sp = statePath(config);
    const tp = tmpPath(config);
    const bp = bakPath(config);
    try {
        fs.writeFileSync(path.resolve(tp), JSON.stringify(state, null, 2), UTF8);
        fs.renameSync(path.resolve(tp), sp);
        fs.writeFileSync(path.resolve(bp), JSON.stringify(state, null, 2), UTF8);
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
