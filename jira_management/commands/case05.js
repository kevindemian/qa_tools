// @ts-check
const { success, error, warn, info, prompt, confirm, smartPrompt, printError } = require('../../shared/prompt');
const { rootLogger } = require('../../shared/logger');
const PackageVersionManager = require('../package_version_manager');
const path = require('path');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    if (!c.ctx.packageManager) {
        const dir = smartPrompt('Diretório do projeto git', { default: process.cwd() }, () => {});
        c.ctx.packageManager = new PackageVersionManager(dir);
        c.ctx.git_directory = dir;
    }
    const version = smartPrompt('Nome da versão', { hint: 'ex: v2.7.0' }, () => {});
    try {
        const tasks = await c.jiraResource.getReleaseTasks(c.ctx.project_name, version, true);
        if (!Array.isArray(tasks)) {
            warn('Nenhuma tarefa encontrada para esta versão.');
            return;
        }
        const versionNumber = version.split(' ').pop();
        c.ctx.packageManager.updateReleaseNotes(versionNumber, tasks);

        const pkgVersion = version.split(' ').pop().split('v').pop();
        c.ctx.packageManager.updateVersion(pkgVersion);
        c.ctx.lastOperation = 'Package atualizado para v' + pkgVersion;
        c.pushHistory('atualizar-package', c.ctx.lastOperation, 'ok');
        success('Package version e release notes atualizados.');
    } catch (err) {
        const msg = 'Erro ao atualizar package para versão "' + version + '" no projeto "' + c.ctx.project_name + '"';
        printError(msg, err);
        rootLogger.error(msg, { version, project: c.ctx.project_name, status: err.response?.status });
        c.pushHistory('atualizar-package', version, 'error');
    }
}

module.exports = { handler };
