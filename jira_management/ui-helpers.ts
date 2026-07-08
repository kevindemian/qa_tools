import Config from '../shared/config.js';
import { showSplash } from '../shared/splash.js';
import { defaultOutput } from '../shared/output.js';
import { warn, helpLine, title, divider, prompt, printError, showSelect, tableView } from '../shared/prompt.js';
import { palette } from '../shared/palette.js';
import { rootLogger } from '../shared/logger.js';
import { isCancelError } from '../shared/errors.js';
import { loadTypedState, getStatePath } from '../shared/state.js';
import { getHandler } from './commands/index.js';
import { SessionContext } from '../shared/session-context.js';
import type { CommandContext } from './commands/context.js';
import { HELP_TOPICS, CATEGORY_IDS, CATEGORY_TITLES, resolveAlias, buildMenuChoices } from './menu-data.js';
import { showDocs } from '../shared/show-docs.js';
export { showDocs };
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
    const helpEntries = Object.entries(HELP_TOPICS);
    const helpEntry = helpEntries.find(([k]) => k === lower);
    if (helpEntry) {
        title('HELP — ' + lower);
        helpLine(helpEntry[1]);
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
    if (found.length > 0) found.forEach(([k, v]) => helpLine(k + ': ' + (v.split('\n')[0] ?? '')));
    else warn('Nenhum topico encontrado para "' + term + '".');
}
function _showAndPause(topic: string): void {
    showHelp(topic);
    divider();
    try {
        prompt('Pressione Enter para continuar');
    } catch (err) {
        rootLogger.debug('User pressed Ctrl+C or non-TTY during help pause: ' + String(err));
    }
}
function handleSearchTopic(lower: string, topicEntries: Array<[string, string]>): void {
    const term = lower.slice(7).trim();
    if (!term) return;
    title('HELP — busca por "' + term + '"');
    const found = topicEntries.filter(([_, v]) => v.toLowerCase().includes(term));
    if (found.length > 0) found.forEach(([k, v]) => helpLine(k + ': ' + (v.split('\n')[0] ?? '')));
    else warn('Nenhum topico encontrado para "' + term + '".');
}

type HelpAction = 'exit' | 'continue' | 'handled';

function handleHelpInput(trimmed: string, lower: string, topicEntries: Array<[string, string]>): HelpAction {
    if (!trimmed) return 'continue';
    if (lower === '/back' || lower === '/menu') return 'exit';
    if (lower === '/help' || lower === '/h') {
        showHelp();
        return 'continue';
    }
    if (lower.startsWith('/help ') || lower.startsWith('/h ')) {
        _showAndPause(trimmed.slice(lower.startsWith('/help ') ? 6 : 3).trim());
        return 'continue';
    }
    if (lower.startsWith('search ')) {
        handleSearchTopic(lower, topicEntries);
        return 'continue';
    }
    return handleTopicLookup(trimmed, lower, topicEntries);
}

function handleTopicLookup(trimmed: string, lower: string, topicEntries: Array<[string, string]>): HelpAction {
    const found = topicEntries.filter(([k]) => k.includes(lower));
    if (found.length === 1) {
        const e = found[0];
        if (e) _showAndPause(e[0]);
        return 'continue';
    }
    if (found.length > 1) {
        title('Tópicos encontrados');
        found.forEach(([k, v]) => helpLine(k + ': ' + (v.split('\n')[0] ?? '')));
        divider();
        return 'continue';
    }
    warn('Tópico não encontrado: "' + trimmed + '". Tente /help search <termo>');
    return 'handled';
}

export function showHelpLoop(): void {
    const topicEntries = Object.entries(HELP_TOPICS);
    for (;;) {
        if (process.stdout.isTTY) process.stdout.write('\x1Bc');
        defaultOutput.box([], { border: 'double', padding: 1, title: 'QA Tools · Ajuda', width: 80 });
        showHelp();
        let input: string;
        try {
            input = prompt('Digite /help <topico>, /help search <termo>, ou /back para voltar');
        } catch (e) {
            if (isCancelError(e)) return;
            throw e;
        }
        const trimmed = input.trim();
        const lower = trimmed.toLowerCase();
        const action = handleHelpInput(trimmed, lower, topicEntries);
        if (action === 'exit') return;
    }
}
export async function handleSpecialInput(
    input: string,
    level: string = 'main',
): Promise<boolean | '__exit__' | '__back__'> {
    const cmd = input.trim().toLowerCase();
    if (
        cmd.startsWith('/help') ||
        cmd.startsWith('/h ') ||
        cmd === '/h' ||
        cmd === 'help' ||
        cmd === 'ajuda' ||
        cmd === 'h' ||
        cmd.startsWith('help ') ||
        cmd.startsWith('ajuda ') ||
        cmd.startsWith('h ')
    ) {
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
    if (choice === 'docs') {
        await showDocs();
        return 'continue';
    }
    const cmdHandler = getHandler(choice);
    if (cmdHandler) {
        let result: boolean | void;
        try {
            result = await cmdHandler(cmdCtx);
        } catch (e) {
            if (isCancelError(e)) return 'continue';
            printError('Erro no handler', e);
            return 'continue';
        }
        return result === false ? 'exit' : 'continue';
    }
    warn('Opção inválida. Escolha entre 0-19, alias ou digite /help.');
    return 'continue';
}
export async function getUserChoice(level: string, proj: string, ctx: SessionContext): Promise<string> {
    if (Config.get('autoChoice')) return Config.get('autoChoice');
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
    const contextLine = ctx.buildContextLine(proj);
    const catEntries = Object.entries(CATEGORY_TITLES);
    const catEntry = catEntries.find(([k]) => k === level);
    const catTitle = catEntry?.[1] ?? level;
    let pathLine: string;
    if (level === 'main') {
        pathLine = `   ${proj}${contextLine ? ' | ' + contextLine : ''}`;
    } else {
        pathLine = `   ${proj} > ${catTitle}${contextLine ? ' | ' + contextLine : ''}`;
    }
    const displayPath = pathLine.length > 74 ? pathLine.slice(0, 73) + '…' : pathLine;
    defaultOutput.box(headerLines.length > 0 ? [displayPath, '', ...headerLines] : [displayPath], {
        border: 'double',
        padding: 1,
        title: 'QA Tools',
        width: 80,
    });
    return showSelect(
        level === 'main' ? '      Selecione uma seção' : `      ${catTitle} — Selecione uma opção`,
        choices,
        { pageSize: (process.stdout.rows || 24) - 4, menuMode: true },
    );
}
async function resolveChoiceResult(choice: string, level: string): Promise<string | null> {
    if (CATEGORY_IDS.has(choice)) return choice;
    const sr = await handleSpecialInput(choice, level);
    if (sr === '__exit__') return '__exit__';
    if (sr === '__back__') return '__back__';
    if (sr === true) return '__skip__';
    if (choice === '0') return level === 'main' ? '__exit__' : '__back__';
    if (getHandler(choice) || choice === 'docs') return choice;
    warn('Opção inválida. Escolha entre as opções disponíveis ou digite /help.');
    return '__skip__';
}

export async function getAndResolveChoice(level: string, ctx: SessionContext): Promise<string | null> {
    let choice: string;
    try {
        choice = await getUserChoice(level, ctx.project_name, ctx);
    } catch (e) {
        if (isCancelError(e)) choice = '/menu';
        else return '__exit__';
    }
    if (choice === '/exit' || choice === '/sair' || choice === '/quit') choice = '0';
    const resolved = resolveAlias(choice);
    if (resolved !== choice) {
        if (resolved === 'docs' || getHandler(resolved)) return resolved;
        choice = resolved;
    }
    return resolveChoiceResult(choice, level);
}
