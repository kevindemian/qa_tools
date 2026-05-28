/** Generate a CSV template file from the built-in template. */
import { success, error, ask } from '../../shared/prompt';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context';

async function handler(c: CommandContext): Promise<boolean | void> {
    const tmplPath = await ask('Caminho para salvar o template', {
        default: path.join(__dirname, '../test_steps_template.csv'),
    });
    const src = path.join(__dirname, '../test_steps_template.csv');
    try {
        fs.copyFileSync(src, tmplPath);
        success('Template CSV gerado em: ' + tmplPath);
        c.pushHistory('gerar-template', tmplPath, 'ok');
    } catch (err) {
        error('Não foi possível copiar template de "' + src + '": ' + (err as Error).message);
    }
}

export default { handler };
