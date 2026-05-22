import { success, warn, prompt } from '../../shared/prompt';
import PackageVersionManager from '../package_version_manager';
import type { CommandContext } from './context';

function handler(c: CommandContext): void {
    const dir = prompt('Caminho do diretório git');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — SessionContext.packageManager is typed as string but holds PackageVersionManager
    (c.ctx as any).packageManager = new PackageVersionManager(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

export { handler };
module.exports = { handler };
