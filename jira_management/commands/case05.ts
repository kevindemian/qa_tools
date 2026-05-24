import { success, warn, smartPrompt, printError } from '../../shared/prompt';
import { rootLogger } from '../../shared/logger';
import type { CommandContext } from './context';
import { NO_TASKS_FOUND_FOR_VERSION } from '../constants';

async function handler(c: CommandContext): Promise<boolean | void> {
    if (!c.ctx.packageManager) {
        const dir = smartPrompt('Diretório do projeto git', { default: process.cwd() }, () => {});
        c.ctx.packageManager = c.ctx.createPackageManager?.(dir);
        c.ctx.git_directory = dir;
    }
    const version = smartPrompt('Nome da versão', { hint: 'ex: v2.7.0' }, () => {});
    try {
        const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version, true);
        if (!Array.isArray(tasks)) {
            warn(NO_TASKS_FOUND_FOR_VERSION);
            return;
        }
        const pm = c.ctx.packageManager as import('../package_version_manager');
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
        rootLogger.error(msg, {
            version,
            project: c.ctx.project_name,
            status: (err as { response?: { status?: number } }).response?.status,
        });
        c.pushHistory('atualizar-package', version, 'error');
    }
}

export = { handler };
