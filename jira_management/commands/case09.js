// @ts-check
const { success, error, warn, info, prompt } = require('../../shared/prompt');
const { update: updateState } = require('../../shared/state');

/** @param {import('./context').CommandContext} c */
function handler(c) {
    const newName = prompt('Novo nome do projeto Jira').toUpperCase().trim();
    if (!newName) {
        warn('Nome do projeto nao pode ser vazio.');
        return;
    }
    c.ctx.project_name = newName;
    c.ctx.lastOperation = 'Projeto alterado para ' + c.ctx.project_name;
    c.pushHistory('trocar-projeto', c.ctx.project_name, 'ok');
    updateState(state => { state.lastProject = c.ctx.project_name; });
    success('Projeto alterado para: ' + c.ctx.project_name);
}

module.exports = { handler };
