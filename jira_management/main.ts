import path from 'path';
import fs from 'fs';
import Config from '../shared/config';
import JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import CsvResource from './csv_resource';
import PackageVersionManager from './package_version_manager';
import {
    print, success, error, warn, info, title, divider, prompt,
    confirm, printError, printSummary, smartPrompt, showSelect, tableView,
} from '../shared/prompt';
import { mask, createValidateEnv, setupSigint, sanitizeUrl, printSessionSummary as sharedPrintSessionSummary } from '../shared/cli_base';
import { rootLogger } from '../shared/logger';
import { load as loadState, update as updateState, STATE_PATH } from '../shared/state';
import { SessionContext } from '../shared/session-context';
import createTestsModule = require('./create_tests');
const { createTestsFromCsv, createTestsFromJson, createTestExecution, createTestExecutionWithLinks } = createTestsModule;
import type { Logger } from '../shared/logger';
import type { StateSchema } from '../shared/types';
import type { CommandContext } from './commands/context';

const { getHandler } = require('./commands') as {
    getHandler: (caseNumber: string) => ((ctx: CommandContext) => Promise<boolean | void> | boolean | void) | null;
};

let base_url: string = Config.jiraBaseUrl as string;
let personal_token: string = Config.jiraPersonalToken as string;
let xray_url: string = Config.xrayBaseUrl as string;
let default_project = 'ECSPOL';

const sessionLog: Logger = rootLogger.child({ session: 'jira' });

if (Config.debug) {
    info('Jira Base URL: ' + base_url);
    info('Jira Token: ' + mask(personal_token));
}

const validateEnv: () => void = createValidateEnv([
    { key: 'JIRA_BASE_URL', label: 'JIRA_BASE_URL', example: 'JIRA_BASE_URL=https://seu-jira-server' },
    { key: 'JIRA_PERSONAL_TOKEN', label: 'JIRA_PERSONAL_TOKEN (token de autenticacao)', example: 'JIRA_PERSONAL_TOKEN=seu-token-aqui' },
    { key: 'XRAY_BASE_URL', label: 'XRAY_BASE_URL (obrigatorio para criar testes)', example: 'XRAY_BASE_URL=https://seu-xray-server' },
]);

const HELP_TOPICS: Record<string, string> = {
    csv: 'Formato CSV:\n  Cada teste e um bloco separado por "---"\n  Campos obrigatorios: Title, Action/Data/Expected Result\n  Opcionais: Description, Pre-condition, Linked Issues, Group\n  Exemplo em test_steps.csv',
    labels: 'Labels Jira:\n  Separadas por virgula. Sem acentos, sem espacos.\n  Ex: qa,regression,smoke,sprint-30',
    group: 'Group: agrupa testes para cross-reference.\n  Testes com mesmo Group: tem descricoes atualizadas automaticamente\n  apos criação com referencia mutua.',
    precondition: 'Pre-condition:\n  Referencia: "KEY-123" (issue Jira)\n  Inline: texto descritivo (aparece na descrição do teste)',
    project: 'Projeto Jira:\n  Chave do projeto (ex: ECSPOL, PROJ).\n  Deve estar definido no Jira com permissao de criação de issues.',
    version: 'Versão:\n  Nome da versão (ex: v2.7.0).\n  Criada no projeto Jira para organizar releases.',
    transitions: 'Transicoes:\n  Fluxo: New -> Approve -> Coding In Progress -> Coding Done -> Done\n  Use a opção 7 para fechamento automatico.',
    template: 'Template CSV:\n  Use a opção 11 para gerar um arquivo CSV de exemplo.',
    diagnostics: 'Diagnostico de conexão:\n  Opção 12 no menu. Testa conectividade com Jira API, Xray API,\n  e valida o projeto atual. Mostra tempos de resposta e status HTTP.',
};

function showHelp(topic?: string): void {
    if (topic) {
        const lower = topic.toLowerCase().trim();
        if (HELP_TOPICS[lower]) {
            title('HELP — ' + lower);
            info(HELP_TOPICS[lower]);
            return;
        }
        if (lower.startsWith('search ')) {
            const term = lower.slice(7).trim();
            if (term) {
                title('HELP — busca por "' + term + '"');
                const found = Object.entries(HELP_TOPICS)
                    .filter(([_, v]) => v.toLowerCase().includes(term));
                if (found.length > 0) {
                    found.forEach(([k, v]) => {
                        info(k + ': ' + v.split('\n')[0]);
                    });
                } else {
                    warn('Nenhum topico encontrado para "' + term + '".');
                }
                return;
            }
        }
        warn('Topico não encontrado: "' + topic + '". Tente: ' + Object.keys(HELP_TOPICS).join(', ') + ' ou /help search <termo>');
        return;
    }
    title('HELP — Jira Tools');
    info('Escolha uma opção do menu e siga as instrucoes.');
    info('Em qualquer prompt de texto, digite /help para ver esta ajuda.');
    info('Digite /help <topico> para ajuda especifica: ' + Object.keys(HELP_TOPICS).join(', '));
    info('Digite /help search <termo> para buscar em todos os topicos.');
    info('Digite /back ou /menu para voltar ao menu principal.');
    divider();
    title('Fluxo comum:');
    info('1. Crie seu CSV de testes (veja test_steps.csv como exemplo)');
    info('2. Opção 1 -> Cria os testes no Jira com steps, pre-conditions e links');
    info('3. Opcoes 3-4-8 -> Gerencie versoes de release');
    info('4. Opção 7 -> Feche tarefas automaticamente');
    divider();
}

const ALIASES: Record<string, string> = {
    'criar': '1', 'criar-teste': '1', 'criar-testes': '1',
    'listar-versoes': '2', 'versoes': '2',
    'criar-versão': '3',
    'atribuir-fixversion': '4', 'fixversion': '4',
    'atualizar-package': '5', 'package': '5',
    'verificar': '6', 'status': '6',
    'fechar': '7',
    'publicar': '8', 'release': '8',
    'trocar-projeto': '9', 'projeto': '9',
    'trocar-diretório': '10', 'diretório': '10',
    'template': '11', 'gerar-template': '11',
    'testexec': '13', 'criar-testexec': '13', 'execução': '13',
    'diretório-cypress': '14', 'cypress': '14',
    'importar-json': '15', 'json': '15',
    'diretório-json': '16',
    'sair': '0', 'exit': '0',
    'voltar': 'menu',
    'ajuda': '/help', 'help': '/help',
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
    { id: '0', label: 'Sair' },
];

function _configHint(key: string, ctx: { git_directory: string }): string {
    if (key === 'gitDir') return '(atual: ' + ctx.git_directory + ')';
    if (key === 'cypressDir') {
        const d = Config.cypressProjectPath || (loadState() as StateSchema).lastCypressPath || 'não configurado';
        return '(atual: ' + d + ')';
    }
    if (key === 'jsonDir') {
        const d = (loadState() as StateSchema).lastJsonDir || 'não configurado';
        return '(atual: ' + d + ')';
    }
    return '';
}

function displayMenu(proj: string, ctx: { lastOperation: string; sessionCounters: Array<{ status: string }>; git_directory: string }): void {
    const ok = ctx.sessionCounters.filter(c => c.status === 'ok').length;
    const er = ctx.sessionCounters.filter(c => c.status === 'error').length;
    const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
    const ctxLine = proj + (ctx.lastOperation ? ' | ' + ctx.lastOperation : '') + counts;
    print('== ' + ctxLine + ' ==');
    divider();
    for (const item of MENU_ITEMS) {
        if (item.section) {
            print('  ' + item.section);
        } else {
            if (item.id === '0') print('');
            const hint = item.configKey ? ' ' + _configHint(item.configKey, ctx) : '';
            print('   ' + item.id + '  ' + item.label + hint);
        }
    }
    if (ok > 0 || er > 0) {
        print('  ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : ''));
    }
    print('  /h  Ajuda');
    divider();
}

function buildContextLine(proj: string, ctx: SessionContext): string {
    return ctx.buildContextLine(proj);
}

function buildMenuChoices(proj: string, ctx: { git_directory: string }): MenuChoice[] {
    const choices: MenuChoice[] = [];
    for (const item of MENU_ITEMS) {
        if (item.section) {
            choices.push({ type: 'separator' as const, line: ' ' + item.section });
        } else if (item.id === '0') {
            choices.push({ type: 'separator' as const, line: '' });
            choices.push({ name: '0  ' + item.label, value: '0' });
        } else {
            const entry: MenuChoice = { name: item.id + '  ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = ctx.git_directory;
            else if (item.configKey === 'cypressDir') entry.description = Config.cypressProjectPath || (loadState() as StateSchema).lastCypressPath || 'não configurado';
            else if (item.configKey === 'jsonDir') entry.description = (loadState() as StateSchema).lastJsonDir || 'não configurado';
            else if (item.id === '9') entry.description = proj;
            choices.push(entry);
        }
    }
    return choices;
}

async function handleSpecialInput(input: string): Promise<boolean> {
    const cmd = input.trim().toLowerCase();
    if (cmd.startsWith('/help') || cmd.startsWith('/h')) {
        const parts = cmd.split(/\s+/);
        if (parts.length > 1 && parts[1] !== '/help' && parts[1] !== '/h') {
            showHelp(parts.slice(1).join(' '));
        } else {
            showHelp();
        }
        return true;
    }
    if (cmd === '/back' || cmd === '/menu' || cmd === '/exit') {
        return true;
    }
    if (cmd === '/history') {
        const hist = (loadState() as StateSchema).history || [];
        title('Historico de operacoes');
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

function generateCsvTemplate(filePath: string): boolean {
    const src = path.join(__dirname, 'test_steps_template.csv');
    try {
        fs.copyFileSync(src, filePath);
        return true;
    } catch (err) {
        error('Não foi possivel copiar template de "' + src + '": ' + (err as Error).message);
        return false;
    }
}

function initializeSession() {
    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();
    const ctx = new SessionContext();

    const state = loadState() as StateSchema;
    ctx.project_name = (
        Config.jiraProject ||
        prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    function printSessionSummary(): void {
        const history = (loadState() as StateSchema).history || [];
        sharedPrintSessionSummary(ctx.sessionCounters, ctx.lastOperation, history);
    }

    function pushHistory(op: string, detail: string, status: string): void {
        ctx.sessionCounters.push({ op, detail, status });
        updateState(s => {
            const st = s as StateSchema;
            if (!st.history) st.history = [];
            st.history.push({ op, detail, status, ts: new Date().toISOString() });
            if (st.history.length > 50) st.history = st.history.slice(-50);
        });
    }

    return { jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource, ctx, pushHistory, printSessionSummary };
}

async function getUserChoice(proj: string, ctx: SessionContext): Promise<string> {
    if (Config.autoChoice) {
        return Config.autoChoice;
    }
    if (process.stdout.isTTY && !Config.quiet) {
        const ctxLine = buildContextLine(proj, ctx);
        print('== ' + ctxLine + ' ==');
        divider();
        const choices = buildMenuChoices(proj, ctx);
        choices.push(
            { type: 'separator' as const, line: '' },
            { name: '/help  Ajuda', value: '/help' },
            { name: '/history  Historico', value: '/history' },
        );
        const menuState = loadState() as StateSchema;
        return await showSelect('Selecione uma opção', choices, {
            default: menuState.lastChoice && menuState.lastChoice !== '0' ? menuState.lastChoice : undefined,
        });
    }
    divider();
    displayMenu(proj, ctx);
    const menuState = loadState() as StateSchema;
    const lastHint = menuState.lastChoice && menuState.lastChoice !== '0'
        ? 'Enter = ' + menuState.lastChoice : '0-15 ou /help';
    let choice = prompt('Selecione uma opção', { hint: lastHint });
    if (!choice.trim() && menuState.lastChoice && menuState.lastChoice !== '0') {
        choice = menuState.lastChoice;
        info('Repetindo última opção: ' + choice);
    }
    return choice;
}

async function runMainLoop(
    ctx: SessionContext, jiraResource: JiraResource, jiraResourceXray: JiraResource,
    linkManager: JiraLinkManager, linkManagerXray: JiraLinkManager, csvResource: CsvResource,
    pushHistory: (op: string, detail: string, status: string) => void,
    printSessionSummary: () => void,
): Promise<void> {
    while (true) {
        let choice = await getUserChoice(ctx.project_name, ctx);

        if (await handleSpecialInput(choice)) continue;

        const resolved = resolveAlias(choice);
        if (resolved !== choice && !isNaN(Number(resolved))) {
            choice = resolved;
        }

        updateState(s => { (s as StateSchema).lastChoice = choice; });

        const opLog = sessionLog.child({ menuOption: choice });

        const cmdHandler = getHandler(choice);
        if (cmdHandler) {
            const cmdCtx: CommandContext = {
                jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource,
                ctx,
                pushHistory, printSessionSummary,
                base_url, sessionLog,
            };
            const shouldContinue = await cmdHandler(cmdCtx);
            if (shouldContinue) continue;
        } else if (choice !== '0') {
            warn('Opção invalida. Escolha entre 0-16, alias ou digite /help.');
        }

        if (choice === '0') {
            title('Até logo!');
            printSessionSummary();
            if (ctx.sessionCounters.some(c => c.status === 'error')) process.exitCode = 1;
            return;
        }

        const longOps = ['1', '15', '4', '5', '7', '8'];
        const hasResults = ctx.results.length > 0 && ctx.results.some(r => r.status === 'error');
        if (!Config.autoConfirm && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}

async function main(): Promise<void> {
    validateEnv();

    title('Bem-vindo ao QA Tools — Jira Management');
    info('Digite /help a qualquer momento para obter ajuda.');
    info('State: ' + STATE_PATH);
    divider();
    sessionLog.info('Sessão iniciada');

    const {
        jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource,
        ctx, pushHistory, printSessionSummary,
    } = initializeSession();

    setupSigint(() => ctx.isBusy, () => printSessionSummary());

    await runMainLoop(
        ctx, jiraResource, jiraResourceXray,
        linkManager, linkManagerXray, csvResource,
        pushHistory, printSessionSummary,
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

module.exports = { main };
