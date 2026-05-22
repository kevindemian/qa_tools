import { success, error, prompt } from '../../shared/prompt';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context';

function handler(c: CommandContext): void {
    const tmplPath = prompt('Caminho para salvar o template', {
        default: path.join(__dirname, '../test_steps_template.csv')
    });
    const src = path.join(__dirname, '../test_steps_template.csv');
    try {
        fs.copyFileSync(src, tmplPath);
        success('Template CSV gerado em: ' + tmplPath);
        c.pushHistory('gerar-template', tmplPath, 'ok');
    } catch (err) {
        error('Não foi possivel copiar template de "' + src + '": ' + (err as Error).message);
    }
}

export { handler };
module.exports = { handler };
