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
import { load as loadState, update as updateState, getStatePath } from '../shared/state';
import { SessionContext } from '../shared/session-context';
import { mdBox } from '../shared/markdown';
import type { Logger } from '../shared/logger';
import type { StateSchema } from '../shared/types';
import type { CommandContext } from './commands/context';
import { NOT_CONFIGURED } from './constants';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getHandler } = require('./commands') as {
    getHandler: (caseNumber: string) => ((ctx: CommandContext) => Promise<boolean | void> | boolean | void) | null;
};

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
    testexec: '13',
    'criar-testexec': '13',
    execução: '13',
    'diretório-cypress': '14',
    cypress: '14',
    'importar-json': '15',
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

const MENU_ITEMS: MenuItem[] = [
    { section: 'TESTES' },
    { id: '1', label: 'Criar testes a partir de CSV' },
    { id: '15', label: 'Importar testes de JSON' },
    { section: 'RELEASES' },
    { id: '2', label: 'Listar versoes de release' },
    { id: '3', label: 'Criar nova versão' },
    { id: '4', label: 'Atribuir fixVersion as tarefas' },
    { id: '5', label: 'Atualizar package.json + release notes' },
    { id: '6', label: 'Verificar status das tarefas' },
    { id: '7', label: 'Fechar tarefas automaticamente' },
    { id: '8', label: 'Publicar versão' },
    { section: 'CONFIGURACAO' },
    { id: '9', label: 'Alterar projeto Jira' },
    { id: '10', label: 'Alterar diretório git', configKey: 'gitDir' },
    { id: '14', label: 'Alterar diretório Cypress', configKey: 'cypressDir' },
    { id: '16', label: 'Alterar diretório JSON', configKey: 'jsonDir' },
    { section: 'UTILITARIOS' },
    { id: '11', label: 'Gerar template CSV' },
    { id: '12', label: 'Diagnosticar conexão' },
    { id: '13', label: 'Criar Test Execution para testes existentes' },
    { id: 'd', label: 'Ver documentação' },
    { id: '0', label: 'Voltar ao menu principal' },
];

function _configHint(key: string, ctx: { git_directory: string }): string {
    if (key === 'gitDir') return '(atual: ' + ctx.git_directory + ')';
    if (key === 'cypressDir') {
        const d = Config.cypressProjectPath || (loadState() as StateSchema).lastCypressPath || NOT_CONFIGURED;
        return '(atual: ' + d + ')';
    }
    if (key === 'jsonDir') {
        const d = (loadState() as StateSchema).lastJsonDir || NOT_CONFIGURED;
        return '(atual: ' + d + ')';
    }
    return '';
}

const SECTION_ICONS: Record<string, string> = {
    TESTES: '🧪',
    RELEASES: '🚀',
    CONFIGURACAO: '⚙️',
    UTILITARIOS: '🔧',
};

function buildMenuChoices(proj: string, ctx: { git_directory: string }): MenuChoice[] {
    const choices: MenuChoice[] = [];
    for (const item of MENU_ITEMS) {
        if (item.section) {
            const icon = SECTION_ICONS[item.section] || '';
            const line = icon ? '       ' + icon + '  ' + item.section : '       ' + item.section;
            choices.push({ type: 'separator' as const, line: '        ' });
            choices.push({ type: 'separator' as const, line });
        } else if (item.id === '0') {
            choices.push({ name: '      ' + item.label, value: '0' });
        } else {
            const entry: MenuChoice = { name: '      ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = ctx.git_directory;
            else if (item.configKey === 'cypressDir')
                entry.description =
                    Config.cypressProjectPath || (loadState() as StateSchema).lastCypressPath || NOT_CONFIGURED;
            else if (item.configKey === 'jsonDir')
                entry.description = (loadState() as StateSchema).lastJsonDir || NOT_CONFIGURED;
            else if (item.id === '9') entry.description = proj;
            choices.push(entry);
        }
    }
    return choices;
}

async function handleSpecialInput(input: string): Promise<boolean | '__exit__'> {
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
        return '__exit__';
    }
    if (cmd === '/docs' || cmd === '/d') {
        await showDocs();
        return true;
    }
    if (cmd === '/history') {
        const hist = (loadState() as StateSchema).history || [];
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

function showHelpLoop(): void {
    const topicEntries = Object.entries(HELP_TOPICS);
    while (true) {
        console.clear();
        defaultOutput.box([], { border: 'double', padding: 1, title: 'QA Tools · Ajuda', width: 80 });
        showHelp();

        const input = prompt('Digite /help <topico>, /help search <termo>, ou /back para voltar');
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
            prompt('Pressione Enter para continuar');
            continue;
        }
        // Try as topic name or search
        const found = topicEntries.filter(([k]) => k.includes(lower));
        if (found.length === 1) {
            showHelp(found[0][0]);
            divider();
            prompt('Pressione Enter para continuar');
            continue;
        }
        if (found.length > 1) {
            title('Tópicos encontrados');
            found.forEach(([k, v]) => helpLine(k + ': ' + v.split('\n')[0]));
            divider();
            continue;
        }
        warn('Tópico não encontrado: "' + trimmed + '". Tente /help search <termo>');
    }
}

async function showDocs(): Promise<void> {
    const docsDir = path.join(__dirname, '../docs');
    let files: string[];
    try {
        files = fs
            .readdirSync(docsDir)
            .filter((f) => /^\d{2}-.+\.md$/.test(f))
            .sort();
    } catch {
        printError('Documentação', new Error('Diretório docs/ não encontrado em ' + docsDir));
        return;
    }

    if (files.length === 0) {
        warn('Nenhum documento encontrado em docs/.');
        divider();
        return;
    }

    const docs: Array<{ label: string; file: string }> = files.map((f) => ({
        label: f.replace(/^\d{2}-/, '').replace(/\.md$/, ''),
        file: f,
    }));

    while (true) {
        console.clear();
        defaultOutput.box([], { border: 'double', padding: 1, title: 'QA Tools · Jira > Documentação', width: 80 });

        const choices: MenuChoice[] = docs.map((d) => ({
            name: '      ' + d.label,
            value: d.file,
        }));
        choices.push(
            { type: 'separator' as const, line: '        ' },
            { name: '      /voltar  Menu Jira', value: '0' },
        );

        const answer = await showSelect('      Selecione um documento', choices, {
            pageSize: (process.stdout.rows || 24) - 4,
        });
        if (answer === '0') return;

        const chosen = docs.find((d) => d.file === answer);
        if (!chosen) continue;

        const filePath = path.join(docsDir, chosen.file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            defaultOutput.print(mdBox(content, { title: chosen.label, border: 'round' }));
        } catch (e: unknown) {
            printError('Erro ao ler ' + chosen.file, e);
        }
        divider();
        const input = prompt('Pressione Enter [ou q] para voltar à lista');
        if (input.trim().toLowerCase() === 'q') break;
    }
}

function initializeSession() {
    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();
    const ctx = new SessionContext();
    ctx.createPackageManager = (dir: string) => new PackageVersionManager(dir);

    const state = loadState() as StateSchema;
    ctx.project_name = (
        Config.jiraProject || prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    function printSessionSummary(): void {
        const history = (loadState() as StateSchema).history || [];
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

async function getUserChoice(proj: string, ctx: SessionContext): Promise<string> {
    if (Config.autoChoice) {
        return Config.autoChoice;
    }

    const choices = buildMenuChoices(proj, ctx);
    const cmdGroup = [
        { type: 'separator' as const, line: '        ' },
        { name: '      /help   Ajuda', value: '/help' },
        { name: '      /docs   Documentação', value: '/docs' },
        { name: '      /history  Histórico', value: '/history' },
    ];
    choices.splice(choices.length - 1, 0, ...cmdGroup);
    const menuState = loadState() as StateSchema;

    const ok = ctx.sessionCounters.filter((c) => c.status === 'ok').length;
    const err = ctx.sessionCounters.filter((c) => c.status === 'error').length;
    const headerLines: string[] = [];
    if (ctx.sessionCounters.length > 0) {
        headerLines.push(
            `   ${palette.muted(ctx.sessionCounters.length + ' operações')}  ·  ${palette.green('' + ok + ' ✓')}${err > 0 ? '  ' + palette.red('' + err + ' ✗') : ''}`,
        );
    }
    if (headerLines.length > 0) {
        defaultOutput.box(headerLines, { border: 'double', padding: 1, title: 'QA Tools · ' + proj, width: 80 });
    }

    return showSelect('      Selecione uma opção', choices, {
        default: menuState.lastChoice && menuState.lastChoice !== '0' ? menuState.lastChoice : undefined,
        pageSize: (process.stdout.rows || 24) - 4,
    });
}

type DispatchResult = 'exit' | 'continue';

async function dispatchChoice(choice: string, cmdCtx: CommandContext): Promise<DispatchResult> {
    if (choice === '0') return 'exit';

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
            throw e;
        }
        return 'continue';
    }

    warn('Opção inválida. Escolha entre 0-16, alias ou digite /help.');
    return 'continue';
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
    const longOps = ['1', '15', '4', '5', '7', '8'];
    while (true) {
        console.clear();
        let choice;
        try {
            choice = await getUserChoice(ctx.project_name, ctx);
        } catch (e) {
            if (e instanceof CancelError) choice = '/menu';
            else throw e;
        }

        if (choice === '/exit' || choice === '/sair' || choice === '/quit') {
            choice = '0';
        }

        const resolved = resolveAlias(choice);
        if (resolved !== choice) {
            choice = resolved;
        }

        const specialResult = await handleSpecialInput(choice);
        if (specialResult === '__exit__') return;
        if (specialResult === true) continue;

        updateState((s) => {
            (s as StateSchema).lastChoice = choice;
        });

        const cmdCtx: CommandContext = {
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

        const action = await dispatchChoice(choice, cmdCtx);
        if (action === 'exit') {
            title('Até logo!');
            printSessionSummary();
            if (ctx.sessionCounters.some((c) => c.status === 'error')) process.exitCode = 1;
            return;
        }

        const hasResults = ctx.results.length > 0 && ctx.results.some((r) => r.status === 'error');
        if (!Config.autoConfirm && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}

async function main(): Promise<void> {
    if (process.stdout.isTTY) {
        process.stdout.write('\x1b[2J\x1b[H\x1b[3J');
    }
    validateEnv();

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

module.exports = {
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
