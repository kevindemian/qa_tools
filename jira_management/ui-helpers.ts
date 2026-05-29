import path from 'path';
import fs from 'fs';
import Config from '../shared/config';
import { showSplash } from '../shared/splash';
import { defaultOutput } from '../shared/output';
import {
    warn,
    helpLine,
    title,
    divider,
    prompt,
    printError,
    showSelect,
    tableView,
    CancelError,
} from '../shared/prompt';
import { palette } from '../shared/palette';
import { openWithOsOrFallback, getDocsOutputDir } from '../shared/open';
import { loadTypedState, getStatePath } from '../shared/state';
import { mdToHtml } from '../shared/markdown';
import { getHandler } from './commands';
import { SessionContext } from '../shared/session-context';
import type { CommandContext } from './commands/context';
import { HELP_TOPICS, CATEGORY_IDS, CATEGORY_TITLES, resolveAlias, buildMenuChoices } from './menu-data';
export function showHelp(topic?: string): void {
    if (!topic) {
        title('HELP — Jira Tools');
        helpLine(
            'Escolha uma opção do menu e siga as instrucoes.\nEm qualquer prompt de texto, digite /help para ver esta ajuda.\nDigite /help <topico> para ajuda especifica: ' +
                Object.keys(HELP_TOPICS).join(', ') +
                '\nDigite /help search <termo> para buscar em todos os topicos.\nDigite /back ou /menu para voltar ao menu principal.',
        );
        divider();
        title('Fluxo comum:');
        helpLine(
            '1. Crie seu CSV de testes (veja test_steps.csv como exemplo)\n2. Opção 1 -> Cria os testes no Jira com steps, pre-conditions e links\n3. Opcoes 3-4-8 -> Gerencie versoes de release\n4. Opção 7 -> Feche tarefas automaticamente',
        );
        divider();
        return;
    }
    const lower = topic.toLowerCase().trim();
    if (HELP_TOPICS[lower]) {
        title('HELP — ' + lower);
        helpLine(HELP_TOPICS[lower]);
        return;
    }
    if (!lower.startsWith('search ')) {
        warn(
            'Topico não encontrado: "' +
                topic +
                '". Tente: ' +
                Object.keys(HELP_TOPICS).join(', ') +
                ' ou /help search <termo>',
        );
        return;
    }
    const term = lower.slice(7).trim();
    if (!term) return;
    title('HELP — busca por "' + term + '"');
    const found = Object.entries(HELP_TOPICS).filter(([_, v]) => v.toLowerCase().includes(term));
    if (found.length > 0) found.forEach(([k, v]) => helpLine(k + ': ' + v.split('\n')[0]!));
    else warn('Nenhum topico encontrado para "' + term + '".');
}
function _showAndPause(topic: string): void {
    showHelp(topic);
    divider();
    try {
        prompt('Pressione Enter para continuar');
    } catch {
        /* ignore */
    }
}
export function showHelpLoop(): void {
    const topicEntries = Object.entries(HELP_TOPICS);
    while (true) {
        if (process.stdout.isTTY) console.clear();
        defaultOutput.box([], { border: 'double', padding: 1, title: 'QA Tools · Ajuda', width: 80 });
        showHelp();
        let input: string;
        try {
            input = prompt('Digite /help <topico>, /help search <termo>, ou /back para voltar');
        } catch (e) {
            if (e instanceof CancelError) return;
            throw e;
        }
        const trimmed = input.trim();
        if (!trimmed) continue;
        const lower = trimmed.toLowerCase();
        if (lower === '/back' || lower === '/menu') return;
        if (lower === '/help' || lower === '/h') {
            showHelp();
            continue;
        }
        if (lower.startsWith('/help ') || lower.startsWith('/h ')) {
            _showAndPause(trimmed.slice(lower.startsWith('/help ') ? 6 : 3).trim());
            continue;
        }
        const found = topicEntries.filter(([k]) => k.includes(lower));
        if (found.length === 1) {
            const e = found[0];
            if (e) _showAndPause(e[0]);
            continue;
        }
        if (found.length > 1) {
            title('Tópicos encontrados');
            found.forEach(([k, v]) => helpLine(k + ': ' + v.split('\n')[0]!));
            divider();
            continue;
        }
        warn('Tópico não encontrado: "' + trimmed + '". Tente /help search <termo>');
    }
}
function _loadDocFiles(docsDir: string): Array<{ label: string; file: string }> | null {
    let files: string[];
    try {
        files = fs
            .readdirSync(docsDir)
            .filter((f) => /^\d{2}-.+\.md$/.test(f))
            .sort();
    } catch {
        printError('Documentação', new Error('Diretório docs/ não encontrado em ' + docsDir));
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
    return (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>QA Tools — Documentação</title><style>body{font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;line-height:1.6;color:#1a1a1a;background:#fafafa}h1{color:#111;border-bottom:2px solid #1a73e8;padding-bottom:.5rem}ul{list-style:none;padding:0}li{padding:.5rem 0;border-bottom:1px solid #eee}li:last-child{border-bottom:none}a{color:#1a73e8;text-decoration:none;font-size:1.1rem}a:hover{text-decoration:underline}.subtitle{color:#555;margin-top:-.5rem}</style></head><body><h1>QA Tools — Documentação</h1><p class="subtitle">' +
        docs.length +
        ' documentos disponíveis</p><ul>' +
        items +
        '</ul></body></html>'
    );
}
export async function showDocs(): Promise<void> {
    const docsDir = path.join(__dirname, '../docs');
    const docs = _loadDocFiles(docsDir);
    if (!docs) return;
    const outDir = getDocsOutputDir();
    if (!outDir) {
        printError('Documentação', new Error('Não foi possível determinar diretório de saída'));
        return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (!doc) continue;
        let content: string;
        try {
            content = fs.readFileSync(path.join(docsDir, doc.file), 'utf8');
        } catch (e: unknown) {
            printError('Erro ao ler ' + doc.file, e);
            continue;
        }
        const prevDoc = i > 0 ? docs[i - 1] : undefined;
        const nextDoc = i < docs.length - 1 ? docs[i + 1] : undefined;
        fs.writeFileSync(
            path.join(outDir, doc.file.replace(/\.md$/, '.html')),
            mdToHtml(content, doc.label, {
                prev: prevDoc ? { label: prevDoc.label, file: prevDoc.file.replace(/\.md$/, '.html') } : undefined,
                next: nextDoc ? { label: nextDoc.label, file: nextDoc.file.replace(/\.md$/, '.html') } : undefined,
            }),
            'utf8',
        );
    }
    const indexPath = path.join(outDir, 'index.html');
    fs.writeFileSync(indexPath, _buildIndexHtml(docs), 'utf8');
    const opened = await openWithOsOrFallback(indexPath);
    if (!opened)
        printError('Documentação', new Error('Não foi possível abrir o navegador. O arquivo está em: ' + indexPath));
}
export async function handleSpecialInput(
    input: string,
    level: string = 'main',
): Promise<boolean | '__exit__' | '__back__'> {
    const cmd = input.trim().toLowerCase();
    if (cmd.startsWith('/help') || cmd === '/h' || cmd.startsWith('/h ')) {
        showHelpLoop();
        return true;
    }
    if (cmd === '/home') {
        await showSplash(getStatePath());
        return true;
    }
    if (cmd === '/back' || cmd === '/menu') return level !== 'main' ? '__back__' : '__exit__';
    if (cmd === '/docs' || cmd === '/d') {
        await showDocs();
        return true;
    }
    if (cmd === '/history') {
        const hist = loadTypedState().history || [];
        title('Histórico de operações');
        const last10 = hist.slice(-10);
        if (last10.length === 0) warn('Nenhuma operação registrada.');
        else tableView(last10, ['ts', 'op', 'detail', 'status']);
        divider();
        return true;
    }
    return false;
}
export async function dispatchChoice(choice: string, cmdCtx: CommandContext): Promise<'exit' | 'continue'> {
    if (choice === 'd' || choice === 'docs') {
        await showDocs();
        return 'continue';
    }
    const cmdHandler = getHandler(choice);
    if (cmdHandler) {
        try {
            const shouldContinue = await cmdHandler(cmdCtx);
            if (shouldContinue) return 'continue';
        } catch (e) {
            if (e instanceof CancelError) return 'continue';
            printError('Erro no handler', e);
            return 'continue';
        }
        return 'continue';
    }
    warn('Opção inválida. Escolha entre 0-19, alias ou digite /help.');
    return 'continue';
}
export async function getUserChoice(level: string, proj: string, ctx: SessionContext): Promise<string> {
    if (Config.autoChoice) return Config.autoChoice;
    const choices = buildMenuChoices(level, proj, ctx);
    choices.splice(
        choices.length - 1,
        0,
        { type: 'separator', line: '        ' },
        { name: '      /help   Ajuda', value: '/help' },
        { name: '      /docs   Documentação', value: '/docs' },
        { name: '      /history  Histórico', value: '/history' },
    );
    const ok = ctx.sessionCounters.filter((c) => c.status === 'ok').length;
    const err = ctx.sessionCounters.filter((c) => c.status === 'error').length;
    const headerLines: string[] = [];
    if (ctx.sessionCounters.length > 0)
        headerLines.push(
            `   ${palette.muted(ctx.sessionCounters.length + ' operações')}  ·  ${palette.green('' + ok + ' ✓')}${err > 0 ? '  ' + palette.red('' + err + ' ✗') : ''}`,
        );
    const contextLine = ctx.buildContextLine ? ctx.buildContextLine(proj) : '';
    const pathLine =
        level === 'main'
            ? `   ${proj}${contextLine ? ' | ' + contextLine : ''}`
            : `   ${proj} > ${CATEGORY_TITLES[level] || level}${contextLine ? ' | ' + contextLine : ''}`;
    const displayPath = pathLine.length > 74 ? pathLine.slice(0, 73) + '…' : pathLine;
    defaultOutput.box(headerLines.length > 0 ? [displayPath, '', ...headerLines] : [displayPath], {
        border: 'double',
        padding: 1,
        title: 'QA Tools',
        width: 80,
    });
    return showSelect(
        level === 'main'
            ? '      Selecione uma seção'
            : `      ${CATEGORY_TITLES[level] || level} — Selecione uma opção`,
        choices,
        { pageSize: (process.stdout.rows || 24) - 4, menuMode: true },
    );
}
export async function getAndResolveChoice(level: string, ctx: SessionContext): Promise<string | null> {
    let choice: string;
    try {
        choice = await getUserChoice(level, ctx.project_name, ctx);
    } catch (e) {
        if (e instanceof CancelError) choice = '/menu';
        else throw e;
    }
    if (choice === '/exit' || choice === '/sair' || choice === '/quit') choice = '0';
    const resolved = resolveAlias(choice);
    if (resolved !== choice) {
        if (resolved === 'd' || resolved === 'docs' || getHandler(resolved)) return resolved;
        choice = resolved;
    }
    if (CATEGORY_IDS.has(choice)) return choice;
    const sr = await handleSpecialInput(choice, level);
    if (sr === '__exit__') return '__exit__';
    if (sr === '__back__') return '__back__';
    if (sr === true) return '__skip__';
    if (choice === '0') return level === 'main' ? '__exit__' : '__back__';
    if (getHandler(choice) || choice === 'd' || choice === 'docs') return choice;
    warn('Opção inválida. Escolha entre as opções disponíveis ou digite /help.');
    return '__skip__';
}
