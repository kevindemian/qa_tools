/** Set the Cypress results directory path. */
import { success, warn, ask } from '../../shared/prompt.js';
import { update as updateState } from '../../shared/state.js';
import path from 'path';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const dir = await ask('Caminho do diretório Cypress');
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    updateState((state) => {
        state.lastCypressPath = resolved;
    });
    success('Diretório Cypress alterado para: ' + resolved);
    c.pushHistory('config-cypress', resolved, 'ok');
}

export default { handler };
