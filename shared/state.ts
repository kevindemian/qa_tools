import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import { rootLogger } from './logger';
import { warn } from './prompt';

const UTF8 = 'utf8';

function getStateDir(config?: Config): string {
    const xdg = config ? config.xdgStateHome : Config.xdgStateHome;
    return xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
}

function ensureStateDir(config?: Config): boolean {
    const dir = getStateDir(config);
    try {
        fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch {
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
                /* best-effort cleanup */
            }
            try {
                fs.unlinkSync(OLD_STATE_PATH + '.tmp');
            } catch {
                /* best-effort cleanup */
            }
            try {
                fs.unlinkSync(OLD_STATE_PATH);
            } catch {
                /* best-effort cleanup */
            }
        }
    } catch (err: unknown) {
        rootLogger.warn('Falha na migração de estado', err);
    }
}

ensureStateDir();
migrateOldState();

export function getStatePath(config?: Config): string {
    return statePath(config);
}

export function load(config?: Config): Record<string, unknown> {
    ensureStateDir(config);
    const sp = statePath(config);
    const bp = bakPath(config);
    const tp = tmpPath(config);
    try {
        if (fs.existsSync(sp)) {
            return JSON.parse(fs.readFileSync(sp, UTF8));
        }
    } catch {
        warn('Arquivo de estado corrompido. Recuperando backup...');
        rootLogger.warn('Arquivo de estado corrompido, recuperando backup...');
        try {
            if (fs.existsSync(bp)) {
                const backup = JSON.parse(fs.readFileSync(bp, UTF8));
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

export function update(fn: (state: Record<string, unknown>) => void, config?: Config): Record<string, unknown> {
    const state = load(config);
    const copy = JSON.parse(JSON.stringify(state));
    fn(copy);
    save(copy, config);
    return copy;
}
