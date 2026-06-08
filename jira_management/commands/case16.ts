/** Set the default JSON results directory path. */
import { success, warn, ask } from '../../shared/prompt.js';
import path from 'path';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const dir = await ask('Caminho do diretório padrão de JSON', { hint: 'ex: ./resultados/' });
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    success('Diretório padrao JSON alterado para: ' + resolved);
    c.pushHistory('config-json-dir', resolved, 'ok');
}

export default { handler };
