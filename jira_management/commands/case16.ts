import { success, warn, prompt } from '../../shared/prompt';
import { update as updateState } from '../../shared/state';
import path from 'path';
import type { CommandContext } from './context';

function handler(c: CommandContext): boolean | void {
    const dir = prompt('Caminho do diretório padrão de JSON');
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

export = { handler };
