// @ts-check
const { success, error, prompt } = require('../../shared/prompt');
const fs = require('fs');
const path = require('path');

/** @param {import('./context').CommandContext} c */
function handler(c) {
    const tmplPath = prompt('Caminho para salvar o template', {
        default: path.join(__dirname, '../test_steps_template.csv')
    });
    const src = path.join(__dirname, '../test_steps_template.csv');
    try {
        fs.copyFileSync(src, tmplPath);
        success('Template CSV gerado em: ' + tmplPath);
        c.pushHistory('gerar-template', tmplPath, 'ok');
    } catch (err) {
        error('Nao foi possivel copiar template de "' + src + '": ' + err.message);
    }
}

module.exports = { handler };
