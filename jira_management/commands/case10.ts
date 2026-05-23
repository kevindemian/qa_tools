import { success, prompt } from '../../shared/prompt';
import type { CommandContext } from './context';

function handler(c: CommandContext): boolean | void {
    const dir = prompt('Caminho do diretório git');
    c.ctx.packageManager = c.ctx.createPackageManager?.(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

export = { handler };
