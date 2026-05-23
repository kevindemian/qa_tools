import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import { rootLogger } from './logger';
import { warn } from './prompt';

function getStateDir(): string {
    return Config.xdgStateHome
        ? path.join(Config.xdgStateHome, 'qa-tools')
        : path.join(os.homedir(), '.local', 'state', 'qa-tools');
}

function ensureStateDir(): boolean {
    const dir = getStateDir();
    try {
        fs.mkdirSync(dir, { recursive: true });
        return true;
    } catch {
        return false;
    }
}

function statePath(): string {
    return path.join(getStateDir(), 'state.json');
}
function tmpPath(): string {
    return statePath() + '.tmp';
}
function bakPath(): string {
    return statePath() + '.bak';
}

ensureStateDir();

const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
try {
    if (fs.existsSync(OLD_STATE_PATH) && !fs.existsSync(statePath())) {
        const oldData = fs.readFileSync(OLD_STATE_PATH, 'utf8');
        fs.writeFileSync(tmpPath(), oldData, 'utf8');
        fs.renameSync(tmpPath(), statePath());
        try {
            fs.unlinkSync(OLD_STATE_PATH + '.bak');
        } catch {}
        try {
            fs.unlinkSync(OLD_STATE_PATH + '.tmp');
        } catch {}
        try {
            fs.unlinkSync(OLD_STATE_PATH);
        } catch {}
    }
} catch {}

export function getStatePath(): string {
    return statePath();
}

export function load(): Record<string, unknown> {
    ensureStateDir();
    const sp = statePath();
    const bp = bakPath();
    const tp = tmpPath();
    try {
        if (fs.existsSync(sp)) {
            return JSON.parse(fs.readFileSync(sp, 'utf8'));
        }
    } catch {
        warn('Arquivo de estado corrompido. Recuperando backup...');
        rootLogger.warn('Arquivo de estado corrompido, recuperando backup...');
        try {
            if (fs.existsSync(bp)) {
                const backup = JSON.parse(fs.readFileSync(bp, 'utf8'));
                fs.writeFileSync(tp, JSON.stringify(backup, null, 2), 'utf8');
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

export function save(state: Record<string, unknown>): void {
    ensureStateDir();
    const sp = statePath();
    const tp = tmpPath();
    const bp = bakPath();
    try {
        fs.writeFileSync(tp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(tp, sp);
        fs.writeFileSync(bp, JSON.stringify(state, null, 2), 'utf8');
    } catch (err) {
        warn('Falha ao salvar estado. Alteracoes podem ser perdidas.');
        rootLogger.error('Falha ao salvar estado: ' + (err as Error).message);
    }
}

export function update(fn: (state: Record<string, unknown>) => void): Record<string, unknown> {
    const state = load();
    const copy = JSON.parse(JSON.stringify(state));
    fn(copy);
    save(copy);
    return copy;
}
