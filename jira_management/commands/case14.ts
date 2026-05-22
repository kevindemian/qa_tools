import { success, warn, prompt } from '../../shared/prompt';
import { update as updateState } from '../../shared/state';
import path from 'path';
import type { CommandContext } from './context';

function handler(c: CommandContext): void {
    const dir = prompt('Caminho do diretório Cypress');
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    updateState(state => { state.lastCypressPath = resolved; });
    success('Diretório Cypress alterado para: ' + resolved);
    c.pushHistory('config-cypress', resolved, 'ok');
}

export { handler };
module.exports = { handler };
