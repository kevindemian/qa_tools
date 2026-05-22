import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import { rootLogger } from './logger';
import { warn } from './prompt';

const STATE_DIR = Config.xdgStateHome
    ? path.join(Config.xdgStateHome, 'qa-tools')
    : path.join(os.homedir(), '.local', 'state', 'qa-tools');

try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
} catch {}

export const STATE_PATH = path.join(STATE_DIR, 'state.json');
const TMP_PATH = STATE_PATH + '.tmp';
const BAK_PATH = STATE_PATH + '.bak';

const OLD_STATE_PATH = path.join(os.homedir(), '.qa_tools_state.json');
try {
    if (fs.existsSync(OLD_STATE_PATH) && !fs.existsSync(STATE_PATH)) {
        const oldData = fs.readFileSync(OLD_STATE_PATH, 'utf8');
        fs.writeFileSync(TMP_PATH, oldData, 'utf8');
        fs.renameSync(TMP_PATH, STATE_PATH);
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

export function load(): Record<string, unknown> {
    try {
        if (fs.existsSync(STATE_PATH)) {
            return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        }
    } catch {
        warn('Arquivo de estado corrompido. Recuperando backup...');
        rootLogger.warn('Arquivo de estado corrompido, recuperando backup...');
        try {
            if (fs.existsSync(BAK_PATH)) {
                const backup = JSON.parse(fs.readFileSync(BAK_PATH, 'utf8'));
                fs.writeFileSync(TMP_PATH, JSON.stringify(backup, null, 2), 'utf8');
                fs.renameSync(TMP_PATH, STATE_PATH);
                return backup;
            }
        } catch (err2) {
            warn('Falha ao recuperar backup de estado.');
            rootLogger.error('Falha ao recuperar backup de estado: ' + (err2 as Error).message);
        }
        try {
            fs.renameSync(STATE_PATH, BAK_PATH);
            warn('Backup salvo. Criando novo estado.');
            rootLogger.warn('Backup salvo em ' + BAK_PATH + '. Criando novo estado.');
        } catch (err3) {
            warn('Falha ao salvar backup de estado.');
            rootLogger.error('Falha ao salvar backup de estado: ' + (err3 as Error).message);
        }
    }
    return {};
}

export function save(state: Record<string, unknown>): void {
    try {
        fs.writeFileSync(TMP_PATH, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(TMP_PATH, STATE_PATH);
        fs.writeFileSync(BAK_PATH, JSON.stringify(state, null, 2), 'utf8');
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
