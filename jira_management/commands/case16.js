// @ts-check
const { success, warn, prompt } = require('../../shared/prompt');
const { update: updateState } = require('../../shared/state');
const path = require('path');

/** @param {import('./context').CommandContext} c */
function handler(c) {
    const dir = prompt('Caminho do diretório padrão de JSON');
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    updateState(state => { state.lastJsonDir = resolved; });
    success('Diretório padrao JSON alterado para: ' + resolved);
    c.pushHistory('config-json-dir', resolved, 'ok');
}

module.exports = { handler };
