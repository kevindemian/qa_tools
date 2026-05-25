import { success, ask } from '../../shared/prompt';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const dir = await ask('Caminho do diretório git');
    c.ctx.packageManager = c.ctx.createPackageManager?.(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

export = { handler };
