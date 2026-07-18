/** Update package version and prepend release notes. */
import { success, warn, ask, printError } from '../../shared/ui/prompt.js';
import type { CommandContext } from './context.js';
import { NO_TASKS_FOUND_FOR_VERSION } from '../constants.js';

async function handler(c: CommandContext): Promise<boolean | void> {
    if (!c.ctx.packageManager) {
        const dir = await ask('Diretório do projeto git', { hint: 'ex: /caminho/do/repo', default: process.cwd() });
        c.ctx.packageManager = c.ctx.createPackageManager?.(dir);
        c.ctx.git_directory = dir;
    }
    const version = await ask('Nome da versão', { hint: 'ex: v2.7.0' });
    try {
        const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version, true);
        if (!Array.isArray(tasks)) {
            warn(NO_TASKS_FOUND_FOR_VERSION);
            return;
        }
        const pm = c.ctx.packageManager as import('../package_version_manager.js').default;
        const versionNumber = version.split(' ').pop() || '';
        pm.updateReleaseNotes(versionNumber, tasks);

        const pkgVersion = (version.split(' ').pop() || '').split('v').pop() || '';
        pm.updateVersion(pkgVersion);
        c.ctx.lastOperation = 'Package atualizado para v' + pkgVersion;
        c.pushHistory('atualizar-package', c.ctx.lastOperation, 'ok');
        success('Package version e release notes atualizados.');
    } catch (err) {
        const msg = 'Erro ao atualizar package para versão "' + version + '" no projeto "' + c.ctx.project_name + '"';
        // fallback: log genérico se safeJiraCall não cobrir todos os cenários
        printError(msg, err);
        c.pushHistory('atualizar-package', version, 'error');
    }
}

export default { handler };
