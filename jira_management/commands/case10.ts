/** Set the git working directory for version management. */
import { success, ask } from '../../shared/prompt.js';
import type { CommandContext } from './context.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    const dir = await ask('Caminho do diretório git', { hint: 'ex: /caminho/do/repo' });
    c.ctx.packageManager = c.ctx.createPackageManager?.(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

export default { handler };
