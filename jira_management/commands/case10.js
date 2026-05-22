// @ts-check
const { success, warn, prompt } = require('../../shared/prompt');
const PackageVersionManager = require('../package_version_manager');

/** @param {import('./context').CommandContext} c */
function handler(c) {
    const dir = prompt('Caminho do diretório git');
    c.ctx.packageManager = new PackageVersionManager(dir);
    c.ctx.git_directory = dir;
    success('Diretório alterado para: ' + dir);
}

module.exports = { handler };
