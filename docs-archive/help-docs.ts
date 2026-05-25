import fs from 'fs';
import path from 'path';
import { mdBox } from '../shared/markdown';
import { isQuiet, showSelect } from '../shared/prompt';

const DOCS_DIR = __dirname;

interface DocEntry {
    label: string;
    file: string;
    description: string;
}

function getDocs(): DocEntry[] {
    const files = fs
        .readdirSync(DOCS_DIR)
        .filter((f) => /^\d{2}-.+\.md$/.test(f))
        .sort();

    const descriptions: Record<string, string> = {
        '00-install.md': 'Pré-requisitos, instalação, .env, wrappers',
        '01-primeiros-passos.md': 'Primeira execução, menu, comandos',
        '02-jira-management.md': '16 opções do Jira Management em detalhe',
        '03-git-triggers.md': 'GitLab/GitHub, pipeline polling, nivelar',
        '04-csv-format.md': 'Formato CSV multi-bloco para importação',
        '05-json-format.md': 'Formato JSON para importação',
        '06-env-vars.md': 'Tabela completa de variáveis de ambiente',
        '07-config-files.md': 'projects.json, providers.json, reviewers.json',
        '08-fluxos-completos.md': 'Jornadas típicas: CSV→TE, release, pipeline',
        '09-troubleshooting.md': 'Problemas comuns e soluções',
    };

    return files.map((f) => ({
        label: f.replace(/^\d{2}-/, '').replace(/\.md$/, ''),
        file: f,
        description: descriptions[f] || '',
    }));
}

function displayFile(filePath: string): void {
    const content = fs.readFileSync(filePath, 'utf8');

    if (isQuiet()) {
        console.log(content);
        return;
    }
    try {
        console.log(mdBox(content, { title: 'Documentação', border: 'round' }));
    } catch {
        console.log(content);
    }
}

// eslint-disable-next-line @typescript-eslint/require-await
async function main(): Promise<void> {
    const docs = getDocs();

    if (docs.length === 0) {
        console.log('Nenhum arquivo de documentação encontrado em docs/.');
        process.exit(1);
    }

    if (process.argv.includes('--list') || process.argv.includes('-l')) {
        for (const doc of docs) {
            console.log(`  ${doc.file.padEnd(30)} ${doc.description}`);
        }
        return;
    }

    const targetArg = process.argv.find((a) => /^\d{2}/.test(a) || docs.some((d) => d.label === a));
    if (targetArg) {
        const match = docs.find((d) => d.file.startsWith(targetArg) || d.label === targetArg);
        if (match) {
            displayFile(path.join(DOCS_DIR, match.file));
            return;
        }
        console.log('Documento não encontrado. Use --list para listar os disponíveis.');
        process.exit(1);
    }

    try {
        const choice = await showSelect(
            '📚 Documentação — Selecione um tópico',
            docs.map((d) => ({
                name: `${d.label}${d.description ? ` — ${d.description}` : ''}`,
                value: d.file,
            })),
        );

        if (choice) {
            displayFile(path.join(DOCS_DIR, choice));
        }
    } catch (err: unknown) {
        console.log('\nSeleção cancelada.', err);
        process.exit(0);
    }
}

main().catch((err) => {
    console.error('Erro ao abrir documentação:', err);
    process.exit(1);
});
