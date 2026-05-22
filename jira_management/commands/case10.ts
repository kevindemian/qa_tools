import { success, prompt } from '../../shared/prompt';
import PackageVersionManager from '../package_version_manager';
import type { CommandContext } from './context';

function handler(c: CommandContext): boolean | void {
    const dir = prompt('Caminho do diretório git');
    c.ctx.packageManager = new PackageVersionManager(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

export { handler };
module.exports = { handler };
