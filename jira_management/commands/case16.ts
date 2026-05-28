/** Set the default JSON results directory path. */
import { success, warn, ask } from '../../shared/prompt';
import { update as updateState } from '../../shared/state';
import path from 'path';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const dir = await ask('Caminho do diretório padrão de JSON');
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    updateState((state) => {
        state.lastJsonDir = resolved;
    });
    success('Diretório padrao JSON alterado para: ' + resolved);
    c.pushHistory('config-json-dir', resolved, 'ok');
}

export default { handler };
