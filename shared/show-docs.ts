/** Docs renderer — converts Markdown documentation to HTML and opens in browser.
 * Extracted from jira_management/ui-helpers.ts so both Jira and Git modules
 * can serve documentation without cross-module dependency. */
import fs from 'fs';
import path from 'path';
import { printError, warn, info, divider } from './prompt.js';
import { openWithFallback, getDocsOutputDir } from './open.js';
import { mdToHtml } from './markdown.js';
import { buildHtmlPage } from './html-factory.js';

function _loadDocFiles(docsDir: string): Array<{ label: string; file: string }> | null {
    let files: string[];
    try {
        files = fs
            .readdirSync(docsDir)
            .filter((f) => /^\d{2}-.+\.md$/.test(f))
            .sort((a, b) => a.localeCompare(b));
    } catch (err: unknown) {
        printError(
            'Documentação',
            new Error('Diretório docs/ não encontrado em ' + docsDir + ': ' + (err as Error).message),
        );
        return null;
    }
    if (files.length === 0) {
        warn('Nenhum documento encontrado em docs/.');
        divider();
        return null;
    }
    return files.map((f) => ({ label: f.replace(/^\d{2}-/, '').replace(/\.md$/, ''), file: f }));
}

function _buildIndexHtml(docs: Array<{ label: string; file: string }>): string {
    const items = docs
        .map(
            (d) =>
                '<li><a href="' +
                d.file.replace(/\.md$/, '.html') +
                '">' +
                d.label.replace(/^./, (c) => c.toUpperCase()) +
                '</a></li>',
        )
        .join('\n');
    const css =
        "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a;background:#fafafa}h1{color:#111;border-bottom:2px solid #1a73e8;padding-bottom:.5rem}ul{list-style:none;padding:0}li{padding:.5rem 0;border-bottom:1px solid #eee}li:last-child{border-bottom:none}a{color:#1a73e8;text-decoration:none;font-size:1.1rem}a:hover{text-decoration:underline}.subtitle{color:#555;margin-top:-.5rem}";
    const bodyContent =
        '<h1>QA Tools — Documentação</h1><p class="subtitle">' +
        docs.length +
        ' documentos disponíveis</p><ul>' +
        items +
        '</ul>';
    return buildHtmlPage({ title: 'QA Tools — Documentação', lang: 'pt-BR', styles: css, bodyContent });
}

/** Convert all Markdown docs to HTML, write them to the docs output directory,
 * and open the index in the browser. Safe to call from any module. */
export async function showDocs(): Promise<void> {
    const docsDir = path.join(import.meta.dirname, '../docs');
    const docs = _loadDocFiles(docsDir);
    if (!docs) return;
    const outDir = getDocsOutputDir();
    if (!outDir) {
        printError('Documentação', new Error('Não foi possível determinar diretório de saída'));
        return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < docs.length; i++) {
        const doc: unknown = Reflect.get(docs, i);
        if (doc === undefined || doc === null || typeof doc !== 'object') continue;
        const d = doc as { file: string; label: string };
        let content: string;
        try {
            content = fs.readFileSync(path.join(docsDir, d.file), 'utf8');
        } catch (e: unknown) {
            printError('Erro ao ler ' + d.file, e);
            continue;
        }
        const prevDoc = i > 0 ? docs[i - 1] : undefined;
        const nextDoc = i < docs.length - 1 ? docs[i + 1] : undefined;
        fs.writeFileSync(
            path.join(outDir, d.file.replace(/\.md$/, '.html')),
            mdToHtml(content, d.label, {
                ...(prevDoc ? { prev: { label: prevDoc.label, file: prevDoc.file.replace(/\.md$/, '.html') } } : {}),
                ...(nextDoc ? { next: { label: nextDoc.label, file: nextDoc.file.replace(/\.md$/, '.html') } } : {}),
            }),
            'utf8',
        );
    }
    const indexPath = path.join(outDir, 'index.html');
    fs.writeFileSync(indexPath, _buildIndexHtml(docs), 'utf8');
    await openWithFallback(indexPath, 'Documentação', info);
}
