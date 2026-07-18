/** Generate CSV/JSON template files from the canonical templates at project root.
 *
 *  The CSV template uses bulk format (Title: prefix, --- block separators)
 *  which is what readBulkCsv() actually parses. The JSON template follows
 *  the ImportJsonSchema format with 5 example test cases.
 *
 *  Sources (both at project root):
 *    - test_steps_template.csv (94 lines, bulk format, 7 example blocks)
 *    - test_cases_template.json (86 lines, 5 example cases, comprehensive) */
import { formatErr } from '../../shared/errors.js';
import { success, error, info, ask } from '../../shared/ui/prompt.js';
import fs from 'fs';
import path from 'path';
import type { CommandContext } from './context.js';

const FORMATS = ['CSV', 'JSON'] as const;

async function handler(c: CommandContext): Promise<boolean | void> {
    const format = await ask('Formato do template', {
        hint: 'CSV ou JSON',
        default: 'CSV',
    });
    const fmt = format.toUpperCase().trim();
    if (!FORMATS.includes(fmt as (typeof FORMATS)[number])) {
        error('Formato inválido. Use CSV ou JSON.');
        return;
    }

    const src = resolveSource(fmt);
    const tmplPath = await ask('Caminho para salvar', {
        hint: 'ex: ./modelos/',
        default: path.join(process.cwd(), fmt === 'CSV' ? 'test_steps_template.csv' : 'test_cases_template.json'),
    });

    try {
        fs.copyFileSync(src, tmplPath);
        success(`Template ${fmt} gerado em: ${tmplPath}`);
        c.pushHistory('gerar-template', `${fmt}: ${tmplPath}`, 'ok');
    } catch (err) {
        error(`Não foi possível copiar template de "${src}": ${formatErr(err)}`);
        return;
    }

    info(`Use a opção ${fmt === 'CSV' ? '1' : '15'} do menu para importar o arquivo gerado.`);
}

function resolveSource(fmt: string): string {
    const root = path.resolve(import.meta.dirname, '../..');
    return fmt === 'CSV' ? path.join(root, 'test_steps_template.csv') : path.join(root, 'test_cases_template.json');
}

export default { handler };
