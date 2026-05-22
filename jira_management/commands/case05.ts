import { success, error, warn, info, prompt, confirm, smartPrompt, printError } from '../../shared/prompt';
import { rootLogger } from '../../shared/logger';
import PackageVersionManager from '../package_version_manager';
import path from 'path';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<void> {
    if (!c.ctx.packageManager) {
        const dir = smartPrompt('Diretório do projeto git', { default: process.cwd() }, () => {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — SessionContext.packageManager is typed as string but holds PackageVersionManager
        (c.ctx as any).packageManager = new PackageVersionManager(dir);
        c.ctx.git_directory = dir;
    }
    const version = smartPrompt('Nome da versão', { hint: 'ex: v2.7.0' }, () => {});
    try {
        const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version, true);
        if (!Array.isArray(tasks)) {
            warn('Nenhuma tarefa encontrada para esta versão.');
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any — SessionContext.packageManager is typed as string but holds PackageVersionManager
        const pm = c.ctx.packageManager as any as PackageVersionManager;
        const versionNumber = version.split(' ').pop() || '';
        pm.updateReleaseNotes(versionNumber, tasks);

        const pkgVersion = (version.split(' ').pop() || '').split('v').pop() || '';
        pm.updateVersion(pkgVersion);
        c.ctx.lastOperation = 'Package atualizado para v' + pkgVersion;
        c.pushHistory('atualizar-package', c.ctx.lastOperation, 'ok');
        success('Package version e release notes atualizados.');
    } catch (err) {
        const msg = 'Erro ao atualizar package para versão "' + version + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, { version, project: c.ctx.project_name, status: (err as any).response?.status });
        c.pushHistory('atualizar-package', version, 'error');
    }
}

export { handler };
module.exports = { handler };
