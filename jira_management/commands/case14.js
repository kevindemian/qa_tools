// @ts-check
const { success, warn, prompt } = require('../../shared/prompt');
const { update: updateState } = require('../../shared/state');
const path = require('path');

/** @param {import('./context').CommandContext} c */
function handler(c) {
    const dir = prompt('Caminho do diretório Cypress');
    if (!dir.trim()) {
        warn('Caminho vazio, ignorando.');
        return;
    }
    const resolved = path.resolve(dir.trim());
    updateState(state => { state.lastCypressPath = resolved; });
    success('Diretório Cypress alterado para: ' + resolved);
    c.pushHistory('config-cypress', resolved, 'ok');
}

module.exports = { handler };
