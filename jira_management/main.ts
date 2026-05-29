import path from 'path';
import fs from 'fs';

import Config from '../shared/config';
import JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import CsvResource from './csv_resource';
import PackageVersionManager from './package_version_manager';
import { showSplash } from '../shared/splash';
import { palette } from '../shared/palette';
import { defaultOutput } from '../shared/output';
import {
    warn,
    info,
    helpLine,
    title,
    divider,
    prompt,
    printError,
    showSelect,
    tableView,
    CancelError,
} from '../shared/prompt';
import {
    mask,
    createValidateEnv,
    setupSigint,
    printSessionSummary as sharedPrintSessionSummary,
} from '../shared/cli_base';
import { rootLogger } from '../shared/logger';
import { openWithOsOrFallback, getDocsOutputDir } from '../shared/open';
import { pushBreadcrumb, clearBreadcrumbs } from '../shared/breadcrumbs';
import { loadTypedState, load as loadState, update as updateState, getStatePath } from '../shared/state';
import { SessionContext } from '../shared/session-context';
import { mdToHtml } from '../shared/markdown';
import type { Logger } from '../shared/logger';
import type { StateSchema } from '../shared/types';
import { getHandler } from './commands';
import { NOT_CONFIGURED } from './constants';
import type { CommandContext } from './commands/context';
import { ensureDirs, registerCleanup } from '../shared/temp-dir';

const base_url: string = Config.jiraBaseUrl;
const personal_token: string = Config.jiraPersonalToken;
const xray_url: string = Config.xrayBaseUrl;
const default_project = 'ECSPOL';

const sessionLog: Logger = rootLogger.child({ session: 'jira' });

if (Config.debug) {
    info('Jira Base URL: ' + base_url);
    info('Jira Token: ' + mask(personal_token));
}

const validateEnv: () => void = createValidateEnv([
    { key: 'JIRA_BASE_URL', label: 'JIRA_BASE_URL', example: 'JIRA_BASE_URL=https://seu-jira-server' },
    {
        key: 'JIRA_PERSONAL_TOKEN',
        label: 'JIRA_PERSONAL_TOKEN (token de autenticação)',
        example: 'JIRA_PERSONAL_TOKEN=seu-token-aqui',
    },
    {
        key: 'XRAY_BASE_URL',
        label: 'XRAY_BASE_URL (obrigatorio para criar testes)',
        example: 'XRAY_BASE_URL=https://seu-xray-server',
    },
]);

const HELP_TOPICS: Record<string, string> = {
    csv: 'Formato CSV:\n  Cada teste e um bloco separado por "---"\n  Campos obrigatórios: Title, Action/Data/Expected Result\n  Opcionais: Description, Pre-condition, Linked Issues, Group\n  Exemplo em test_steps.csv',
    labels: 'Labels Jira:\n  Separadas por virgula. Sem acentos, sem espacos.\n  Ex: qa,regression,smoke,sprint-30',
    group: 'Group: agrupa testes para cross-reference.\n  Testes com mesmo Group: tem descricoes atualizadas automaticamente\n  apos criação com referencia mutua.',
    precondition:
        'Pre-condition:\n  Referencia: "KEY-123" (issue Jira)\n  Inline: texto descritivo (aparece na descrição do teste)',
    project:
        'Projeto Jira:\n  Chave do projeto (ex: ECSPOL, PROJ).\n  Deve estar definido no Jira com permissao de criação de issues.',
    version: 'Versão:\n  Nome da versão (ex: v2.7.0).\n  Criada no projeto Jira para organizar releases.',
    transitions:
        'Transicoes:\n  Fluxo: New -> Approve -> Coding In Progress -> Coding Done -> Done\n  Use a opção 7 para fechamento automatico.',
    template: 'Template CSV:\n  Use a opção 11 para gerar um arquivo CSV de exemplo.',
    diagnostics:
        'Diagnostico de conexão:\n  Opção 12 no menu. Testa conectividade com Jira API, Xray API,\n  e valida o projeto atual. Mostra tempos de resposta e status HTTP.',
};

function showHelp(topic?: string): void {
    if (topic) {
        const lower = topic.toLowerCase().trim();
        if (HELP_TOPICS[lower]) {
            title('HELP — ' + lower);
            helpLine(HELP_TOPICS[lower]);
            return;
        }
        if (lower.startsWith('search ')) {
            const term = lower.slice(7).trim();
            if (term) {
                title('HELP — busca por "' + term + '"');
                const found = Object.entries(HELP_TOPICS).filter(([_, v]) => v.toLowerCase().includes(term));
                if (found.length > 0) {
                    found.forEach(([k, v]) => {
                        helpLine(k + ': ' + v.split('\n')[0]);
                    });
                } else {
                    warn('Nenhum topico encontrado para "' + term + '".');
                }
                return;
            }
        }
        warn(
            'Topico não encontrado: "' +
                topic +
                '". Tente: ' +
                Object.keys(HELP_TOPICS).join(', ') +
                ' ou /help search <termo>',
        );
        return;
    }
    title('HELP — Jira Tools');
    helpLine('Escolha uma opção do menu e siga as instrucoes.');
    helpLine('Em qualquer prompt de texto, digite /help para ver esta ajuda.');
    helpLine('Digite /help <topico> para ajuda especifica: ' + Object.keys(HELP_TOPICS).join(', '));
    helpLine('Digite /help search <termo> para buscar em todos os topicos.');
    helpLine('Digite /back ou /menu para voltar ao menu principal.');
    divider();
    title('Fluxo comum:');
    helpLine('1. Crie seu CSV de testes (veja test_steps.csv como exemplo)');
    helpLine('2. Opção 1 -> Cria os testes no Jira com steps, pre-conditions e links');
    helpLine('3. Opcoes 3-4-8 -> Gerencie versoes de release');
    helpLine('4. Opção 7 -> Feche tarefas automaticamente');
    divider();
}

const ALIASES: Record<string, string> = {
    criar: '1',
    'criar-teste': '1',
    'criar-testes': '1',
    'listar-versoes': '2',
    versoes: '2',
    'criar-versão': '3',
    'atribuir-fixversion': '4',
    fixversion: '4',
    'atualizar-package': '5',
    package: '5',
    verificar: '6',
    status: '6',
    fechar: '7',
    publicar: '8',
    release: '8',
    'trocar-projeto': '9',
    projeto: '9',
    'trocar-diretório': '10',
    diretório: '10',
    template: '11',
    'gerar-template': '11',
    'template-csv': '11',
    'template:csv': '11',
    'template-json': '11',
    'template:json': '11',
    'gerar-template-json': '11',
    testexec: '13',
    'criar-testexec': '13',
    execução: '13',
    'diretório-cypress': '14',
    cypress: '14',
    'importar-json': '15',
    relatório: '17',
    html: '17',
    us: '18',
    estória: '18',
    história: '18',
    cobertura: '19',
    bug: '20',
    'bug-report': '20',
    bugreport: '20',
    'criar-bug': '20',
    json: '15',
    'diretório-json': '16',
    d: 'docs',
    documentação: 'docs',
    docs: 'docs',
    sair: '0',
    exit: '0',
    voltar: '/menu',
    ajuda: '/help',
    help: '/help',
    t: '1',
    r: '2',
    c: '9',
    u: '11',
};

function resolveAlias(choice: string): string {
    const trimmed = choice.trim().toLowerCase();
    return ALIASES[trimmed] || choice;
}

interface MenuItem {
    section?: string;
    id?: string;
    label?: string;
    configKey?: string;
}

interface MenuChoice {
    type?: 'separator';
    line?: string;
    name?: string;
    value?: string;
    description?: string;
    disabled?: boolean | string;
}

const CATEGORIES: MenuItem[] = [
    { id: 'reports', label: 'GERAÇÃO DE RELATÓRIOS' },
    { id: 'tests', label: 'GERAÇÃO DE CASOS DE TESTE' },
    { id: 'bugreport', label: 'BUG REPORT' },
    { id: 'analytics', label: 'ANÁLISE E HISTÓRICO' },
    { id: 'releases', label: 'RELEASES' },
    { id: 'config', label: 'CONFIGURAÇÃO' },
    { id: 'utilities', label: 'UTILITÁRIOS' },
    { id: '0', label: 'Voltar ao menu principal' },
];

const SUB_MENUS: Record<string, MenuItem[]> = {
    reports: [
        { id: '17', label: 'Gerar relatório HTML' },
        { id: '0', label: 'Voltar' },
    ],
    tests: [
        { id: '1', label: 'Criar testes a partir de CSV' },
        { id: '13', label: 'Criar Test Execution para testes existentes' },
        { id: '15', label: 'Importar testes de JSON' },
        { id: '18', label: 'Gerar testes via User Story (IA)' },
        { id: '0', label: 'Voltar' },
    ],
    bugreport: [
        { id: '20', label: 'Criar Bug Report' },
        { id: '0', label: 'Voltar' },
    ],
    analytics: [
        { id: '19', label: 'Histórico / Cobertura' },
        { id: '0', label: 'Voltar' },
    ],
    releases: [
        { id: '2', label: 'Listar versões de release' },
        { id: '3', label: 'Criar nova versão' },
        { id: '4', label: 'Atribuir fixVersion às tarefas' },
        { id: '5', label: 'Atualizar package.json + release notes' },
        { id: '6', label: 'Verificar status das tarefas' },
        { id: '7', label: 'Fechar tarefas automaticamente' },
        { id: '8', label: 'Publicar versão' },
        { id: '0', label: 'Voltar' },
    ],
    config: [
        { id: '9', label: 'Alterar projeto Jira' },
        { id: '10', label: 'Alterar diretório git', configKey: 'gitDir' },
        { id: '14', label: 'Alterar diretório Cypress', configKey: 'cypressDir' },
        { id: '16', label: 'Alterar diretório JSON', configKey: 'jsonDir' },
        { id: '0', label: 'Voltar' },
    ],
    utilities: [
        { id: '11', label: 'Gerar template (CSV/JSON)' },
        { id: '12', label: 'Diagnosticar conexão' },
        { id: 'd', label: 'Ver documentação' },
        { id: '0', label: 'Voltar' },
    ],
};

const CATEGORY_IDS = new Set(Object.keys(SUB_MENUS));

const CATEGORY_TITLES: Record<string, string> = {
    reports: 'GERAÇÃO DE RELATÓRIOS',
    tests: 'GERAÇÃO DE CASOS DE TESTE',
    bugreport: 'BUG REPORT',
    analytics: 'ANÁLISE E HISTÓRICO',
    releases: 'RELEASES',
    config: 'CONFIGURAÇÃO',
    utilities: 'UTILITÁRIOS',
};

function _buildAliasMap(): Record<string, string[]> {
    const map: Record<string, string[]> = {};
    for (const [alias, id] of Object.entries(ALIASES)) {
        if (!map[id]) map[id] = [];
        map[id].push(alias);
    }
    return map;
}

const ID_TO_ALIASES = _buildAliasMap();

function _configHint(key: string, ctx: { git_directory: string }): string {
    if (key === 'gitDir') return '(atual: ' + ctx.git_directory + ')';
    if (key === 'cypressDir') {
        const d = Config.cypressProjectPath || loadTypedState().lastCypressPath || NOT_CONFIGURED;
        return '(atual: ' + d + ')';
    }
    if (key === 'jsonDir') {
        const d = loadTypedState().lastJsonDir || NOT_CONFIGURED;
        return '(atual: ' + d + ')';
    }
    return '';
}

function buildMenuChoices(level: string, proj: string, ctx: { git_directory: string }): MenuChoice[] {
    const items = level === 'main' ? CATEGORIES : SUB_MENUS[level] || CATEGORIES;
    const choices: MenuChoice[] = [];
    for (const item of items) {
        if (item.section) {
            choices.push({ type: 'separator' as const, line: '' });
            choices.push({ type: 'separator' as const, line: item.section });
        } else if (item.id === '0') {
            choices.push({ name: '      ' + item.label, value: '0' });
        } else {
            const entry: MenuChoice = { name: '      ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = ctx.git_directory;
            else if (item.configKey === 'cypressDir')
                entry.description = Config.cypressProjectPath || loadTypedState().lastCypressPath || NOT_CONFIGURED;
            else if (item.configKey === 'jsonDir') entry.description = loadTypedState().lastJsonDir || NOT_CONFIGURED;
            else if (item.id === '9') entry.description = proj;
            if (item.id && ID_TO_ALIASES[item.id]) {
                const aliases = ID_TO_ALIASES[item.id]!.slice(0, 2).join(', ');
                const count = ID_TO_ALIASES[item.id]!.length;
                const suffix = count > 2 ? '…' : '';
                const hint = 'alias: ' + aliases + suffix;
                entry.description = entry.description ? entry.description + ' (' + hint + ')' : hint;
            }
            choices.push(entry);
        }
    }
    return choices;
}

async function handleSpecialInput(input: string, level: string = 'main'): Promise<boolean | '__exit__' | '__back__'> {
    const cmd = input.trim().toLowerCase();
    if (cmd.startsWith('/help') || cmd === '/h' || cmd.startsWith('/h ')) {
        showHelpLoop();
        return true;
    }
    if (cmd === '/home') {
        await showSplash(getStatePath(), base_url, personal_token);
        return true;
    }
    if (cmd === '/back' || cmd === '/menu') {
        if (level !== 'main') return '__back__';
        return '__exit__';
    }
    if (cmd === '/docs' || cmd === '/d') {
        await showDocs();
        return true;
    }
    if (cmd === '/history') {
        const hist = loadTypedState().history || [];
        title('Histórico de operações');
        const last10 = hist.slice(-10);
        if (last10.length === 0) {
            warn('Nenhuma operação registrada.');
        } else {
            tableView(last10, ['ts', 'op', 'detail', 'status']);
        }
        divider();
        return true;
    }
    return false;
}

function _showSearchResults(found: Array<[string, string]>): void {
    title('Tópicos encontrados');
    found.forEach(([k, v]) => helpLine(k + ': ' + v.split('\n')[0]));
    divider();
}

function showHelpLoop(): void {
    const topicEntries = Object.entries(HELP_TOPICS);
    while (true) {
        console.clear();
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
            const topic = trimmed.slice(lower.startsWith('/help ') ? 6 : 3).trim();
            showHelp(topic);
            divider();
            try {
                prompt('Pressione Enter para continuar');
            } catch {
                /* ignore */
            }
            continue;
        }
        // Try as topic name or search
        const found = topicEntries.filter(([k]) => k.includes(lower));
        if (found.length === 1) {
            const topic = found[0];
            if (!topic) continue;
            showHelp(topic[0]);
            divider();
            try {
                prompt('Pressione Enter para continuar');
            } catch {
                /* ignore */
            }
            continue;
        }
        if (found.length > 1) {
            _showSearchResults(found);
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

    return files.map((f) => ({
        label: f.replace(/^\d{2}-/, '').replace(/\.md$/, ''),
        file: f,
    }));
}

async function showDocs(): Promise<void> {
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
        const filePath = path.join(docsDir, doc.file);
        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch (e: unknown) {
            printError('Erro ao ler ' + doc.file, e);
            continue;
        }

        const prevDoc = i > 0 ? docs[i - 1] : undefined;
        const nextDoc = i < docs.length - 1 ? docs[i + 1] : undefined;
        const nav = {
            prev: prevDoc ? { label: prevDoc.label, file: prevDoc.file.replace(/\.md$/, '.html') } : undefined,
            next: nextDoc ? { label: nextDoc.label, file: nextDoc.file.replace(/\.md$/, '.html') } : undefined,
        };

        const html = mdToHtml(content, doc.label, nav);
        const htmlFile = path.join(outDir, doc.file.replace(/\.md$/, '.html'));
        fs.writeFileSync(htmlFile, html, 'utf8');
    }

    const indexHtml = buildIndexHtml(docs);
    const indexPath = path.join(outDir, 'index.html');
    fs.writeFileSync(indexPath, indexHtml, 'utf8');

    const opened = await openWithOsOrFallback(indexPath);
    if (!opened) {
        printError('Documentação', new Error('Não foi possível abrir o navegador. O arquivo está em: ' + indexPath));
    }
}

function buildIndexHtml(docs: Array<{ label: string; file: string }>): string {
    const items = docs
        .map((d) => {
            const href = d.file.replace(/\.md$/, '.html');
            return '<li><a href="' + href + '">' + d.label.replace(/^./, (c) => c.toUpperCase()) + '</a></li>';
        })
        .join('\n');
    return (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<title>QA Tools — Documentação</title><style>' +
        "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 3rem auto; padding: 0 1rem; line-height: 1.6; color: #1a1a1a; background: #fafafa; }" +
        'h1 { color: #111; border-bottom: 2px solid #1a73e8; padding-bottom: 0.5rem; }' +
        'ul { list-style: none; padding: 0; }' +
        'li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }' +
        'li:last-child { border-bottom: none; }' +
        'a { color: #1a73e8; text-decoration: none; font-size: 1.1rem; }' +
        'a:hover { text-decoration: underline; }' +
        '.subtitle { color: #555; margin-top: -0.5rem; }' +
        '</style></head><body>' +
        '<h1>QA Tools — Documentação</h1>' +
        '<p class="subtitle">' +
        docs.length +
        ' documentos disponíveis</p>' +
        '<ul>' +
        items +
        '</ul>' +
        '</body></html>'
    );
}

function initializeSession() {
    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();
    const ctx = new SessionContext();
    ctx.createPackageManager = (dir: string) => new PackageVersionManager(dir);

    const state = loadTypedState();
    ctx.project_name = (
        Config.jiraProject || prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    function printSessionSummary(): void {
        const history = loadTypedState().history || [];
        sharedPrintSessionSummary(ctx.sessionCounters, ctx.lastOperation, history);
    }

    function pushHistory(op: string, detail: string, status: string): void {
        ctx.sessionCounters.push({ op, detail, status });
        updateState((s) => {
            const st = s as StateSchema;
            if (!st.history) st.history = [];
            st.history.push({ op, detail, status, ts: new Date().toISOString() });
            if (st.history.length > 50) st.history = st.history.slice(-50);
        });
    }

    return {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    };
}

async function getUserChoice(level: string, proj: string, ctx: SessionContext): Promise<string> {
    if (Config.autoChoice) {
        return Config.autoChoice;
    }

    const choices = buildMenuChoices(level, proj, ctx);
    const cmdGroup = [
        { type: 'separator' as const, line: '        ' },
        { name: '      /help   Ajuda', value: '/help' },
        { name: '      /docs   Documentação', value: '/docs' },
        { name: '      /history  Histórico', value: '/history' },
    ];
    choices.splice(choices.length - 1, 0, ...cmdGroup);

    const ok = ctx.sessionCounters.filter((c) => c.status === 'ok').length;
    const err = ctx.sessionCounters.filter((c) => c.status === 'error').length;
    const headerLines: string[] = [];
    if (ctx.sessionCounters.length > 0) {
        headerLines.push(
            `   ${palette.muted(ctx.sessionCounters.length + ' operações')}  ·  ${palette.green('' + ok + ' ✓')}${err > 0 ? '  ' + palette.red('' + err + ' ✗') : ''}`,
        );
    }

    const contextLine = ctx.buildContextLine ? ctx.buildContextLine(proj) : '';
    const contextPart = contextLine ? ' | ' + contextLine : '';
    const pathLine =
        level === 'main' ? `   ${proj}${contextPart}` : `   ${proj} > ${CATEGORY_TITLES[level] || level}${contextPart}`;
    const maxPathLen = 74;
    const displayPath = pathLine.length > maxPathLen ? pathLine.slice(0, maxPathLen - 1) + '…' : pathLine;
    const boxLines = headerLines.length > 0 ? [displayPath, '', ...headerLines] : [displayPath];
    defaultOutput.box(boxLines, { border: 'double', padding: 1, title: 'QA Tools', width: 80 });

    const selectLabel =
        level === 'main'
            ? '      Selecione uma seção'
            : `      ${CATEGORY_TITLES[level] || level} — Selecione uma opção`;

    return showSelect(selectLabel, choices, {
        pageSize: (process.stdout.rows || 24) - 4,
        menuMode: true,
    });
}

type DispatchResult = 'exit' | 'continue';

async function dispatchChoice(choice: string, cmdCtx: CommandContext): Promise<DispatchResult> {
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

async function getAndResolveChoice(level: string, ctx: SessionContext): Promise<string | null> {
    let choice;
    try {
        choice = await getUserChoice(level, ctx.project_name, ctx);
    } catch (e) {
        if (e instanceof CancelError) choice = '/menu';
        else throw e;
    }

    if (choice === '/exit' || choice === '/sair' || choice === '/quit') {
        choice = '0';
    }

    const resolved = resolveAlias(choice);
    if (resolved !== choice) {
        if (resolved === 'd' || resolved === 'docs' || getHandler(resolved)) {
            return resolved;
        }
        choice = resolved;
    }

    if (CATEGORY_IDS.has(choice)) {
        return choice;
    }

    const specialResult = await handleSpecialInput(choice, level);
    if (specialResult === '__exit__') return '__exit__';
    if (specialResult === '__back__') return '__back__';
    if (specialResult === true) return '__skip__';

    if (choice === '0') {
        if (level === 'main') return '__exit__';
        return '__back__';
    }

    if (getHandler(choice) || choice === 'd' || choice === 'docs') {
        return choice;
    }

    warn('Opção inválida. Escolha entre as opções disponíveis ou digite /help.');
    return '__skip__';
}

function buildCommandContext(
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    ctx: SessionContext,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): CommandContext {
    return {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
        base_url,
        sessionLog,
    };
}

async function dispatchAndHandleResult(
    choice: string,
    cmdCtx: CommandContext,
    ctx: SessionContext,
): Promise<'continue'> {
    await dispatchChoice(choice, cmdCtx);

    const longOps = ['1', '15', '4', '5', '7', '8'];
    const hasResults = ctx.results.length > 0 && ctx.results.some((r) => r.status === 'error');
    if (!Config.autoConfirm && choice !== '0' && longOps.includes(choice) && hasResults) {
        prompt('Pressione Enter para continuar');
    }

    return 'continue';
}

async function _executeChoice(
    choice: string,
    ctx: SessionContext,
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): Promise<void> {
    updateState((s) => {
        (s as StateSchema).lastChoice = choice;
    });

    const cmdCtx = buildCommandContext(
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    );

    await dispatchAndHandleResult(choice, cmdCtx, ctx);
}

async function runMainLoop(
    ctx: SessionContext,
    jiraResource: JiraResource,
    jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager,
    linkManagerXray: JiraLinkManager,
    csvResource: CsvResource,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): Promise<void> {
    let currentLevel = 'main';
    clearBreadcrumbs();
    while (true) {
        if (process.stdout.isTTY) {
            process.stdout.write('\x1b[2J\x1b[H');
        }
        const choice = await getAndResolveChoice(currentLevel, ctx);
        if (choice === '__exit__') {
            clearBreadcrumbs();
            title('Até logo!');
            printSessionSummary();
            if (ctx.sessionCounters.some((c) => c.status === 'error')) process.exitCode = 1;
            return;
        }
        if (choice === '__back__') {
            clearBreadcrumbs();
            currentLevel = 'main';
            continue;
        }
        if (choice === '__skip__') continue;
        if (!choice) continue;

        if (CATEGORY_IDS.has(choice)) {
            pushBreadcrumb(CATEGORY_TITLES[choice] || choice);
            currentLevel = choice;
            continue;
        }

        await _executeChoice(
            choice,
            ctx,
            jiraResource,
            jiraResourceXray,
            linkManager,
            linkManagerXray,
            csvResource,
            pushHistory,
            printSessionSummary,
        );
    }
}

async function main(): Promise<void> {
    if (process.stdout.isTTY) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    validateEnv();
    ensureDirs();
    registerCleanup();

    await showSplash(getStatePath());
    rootLogger.writeFileOnly('INFO', 'Sessão iniciada');

    const {
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        ctx,
        pushHistory,
        printSessionSummary,
    } = initializeSession();

    setupSigint(
        () => ctx.isBusy,
        () => printSessionSummary(),
    );

    await runMainLoop(
        ctx,
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        csvResource,
        pushHistory,
        printSessionSummary,
    );
}

process.on('unhandledRejection', (reason: unknown) => {
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
    process.exitCode = 1;
});

main().catch((err: unknown) => {
    printError('Erro inesperado', err);
    const state = loadState();
    sharedPrintSessionSummary([], '', (state as StateSchema).history || []);
    process.exitCode = 1;
});

export {
    main,
    showSplash,
    showHelp,
    showDocs,
    showHelpLoop,
    resolveAlias,
    buildMenuChoices,
    handleSpecialInput,
    dispatchChoice,
    _configHint,
};
