// @ts-check
const path = require('path');
const fs = require('fs');
const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');
const CsvResource = require('./csv_resource');
const PackageVersionManager = require('./package_version_manager');
const { success, error, warn, info, title, divider, prompt, confirm, printError, printSummary, smartPrompt, showSelect, tableView } = require('../shared/prompt');
const { mask, createValidateEnv, setupSigint, sanitizeUrl, printSessionSummary: sharedPrintSessionSummary } = require('../shared/cli_base');
const { rootLogger } = require('../shared/logger');
const { load: loadState, update: updateState, STATE_PATH } = require('../shared/state');
const { SessionContext } = require('../shared/session-context');
const { createTestsFromCsv, createTestsFromJson, createTestExecution, createTestExecutionWithLinks } = require('./create_tests');
const { getHandler } = require('./commands');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/** @type {string} */
let base_url = /** @type {string} */ (process.env.JIRA_BASE_URL);
/** @type {string} */
let personal_token = /** @type {string} */ (process.env.JIRA_PERSONAL_TOKEN);
/** @type {string} */
let xray_url = /** @type {string} */ (process.env.XRAY_BASE_URL);
let default_project = 'ECSPOL';

const sessionLog = rootLogger.child({ session: 'jira' });

if (process.env.DEBUG === 'true') {
    info('Jira Base URL: ' + base_url);
    info('Jira Token: ' + mask(personal_token));
}

const validateEnv = createValidateEnv([
    { key: 'JIRA_BASE_URL', label: 'JIRA_BASE_URL', example: 'JIRA_BASE_URL=https://seu-jira-server' },
    { key: 'JIRA_PERSONAL_TOKEN', label: 'JIRA_PERSONAL_TOKEN (token de autenticacao)', example: 'JIRA_PERSONAL_TOKEN=seu-token-aqui' },
    { key: 'XRAY_BASE_URL', label: 'XRAY_BASE_URL (obrigatorio para criar testes)', example: 'XRAY_BASE_URL=https://seu-xray-server' },
]);

const HELP_TOPICS = {
    csv: 'Formato CSV:\n  Cada teste e um bloco separado por "---"\n  Campos obrigatorios: Title, Action/Data/Expected Result\n  Opcionais: Description, Pre-condition, Linked Issues, Group\n  Exemplo em test_steps.csv',
    labels: 'Labels Jira:\n  Separadas por virgula. Sem acentos, sem espacos.\n  Ex: qa,regression,smoke,sprint-30',
    group: 'Group: agrupa testes para cross-reference.\n  Testes com mesmo Group: tem descricoes atualizadas automaticamente\n  apos criação com referencia mutua.',
    precondition: 'Pre-condition:\n  Referencia: "KEY-123" (issue Jira)\n  Inline: texto descritivo (aparece na descrição do teste)',
    project: 'Projeto Jira:\n  Chave do projeto (ex: ECSPOL, PROJ).\n  Deve estar definido no Jira com permissao de criação de issues.',
    version: 'Versão:\n  Nome da versão (ex: v2.7.0).\n  Criada no projeto Jira para organizar releases.',
    transitions: 'Transicoes:\n  Fluxo: New -> Approve -> Coding In Progress -> Coding Done -> Done\n  Use a opção 7 para fechamento automatico.',
    template: 'Template CSV:\n  Use a opção 11 para gerar um arquivo CSV de exemplo.',
    diagnostics: 'Diagnostico de conexão:\n  Opção 12 no menu. Testa conectividade com Jira API, Xray API,\n  e valida o projeto atual. Mostra tempos de resposta e status HTTP.'
};

function showHelp(topic) {
    if (topic) {
        const lower = topic.toLowerCase().trim();
        if (HELP_TOPICS[lower]) {
            title('HELP — ' + lower);
            info(HELP_TOPICS[lower]);
            return;
        }
        // search mode
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
        warn('Topico nao encontrado: "' + topic + '". Tente: ' + Object.keys(HELP_TOPICS).join(', ') + ' ou /help search <termo>');
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

const ALIASES = {
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
    'ajuda': '/help', 'help': '/help'
};

function resolveAlias(choice) {
    const trimmed = choice.trim().toLowerCase();
    return ALIASES[trimmed] || choice;
}

/**
 * @typedef {{ section?: string, id?: string, label?: string, configKey?: string }} MenuItem
 * @type {MenuItem[]}
 */
const MENU_ITEMS = [
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

/** @param {string} key @param {{ git_directory: string }} ctx */
function _configHint(key, ctx) {
    if (key === 'gitDir') return '(atual: ' + ctx.git_directory + ')';
    if (key === 'cypressDir') {
        const d = process.env.CYPRESS_PROJECT_PATH || loadState().lastCypressPath || 'nao configurado';
        return '(atual: ' + d + ')';
    }
    if (key === 'jsonDir') {
        const d = loadState().lastJsonDir || 'nao configurado';
        return '(atual: ' + d + ')';
    }
    return '';
}

/** @param {string} proj @param {{ lastOperation: string, sessionCounters: Array<{status:string}>, git_directory: string }} ctx */
function displayMenu(proj, ctx) {
    const ok = ctx.sessionCounters.filter(c => c.status === 'ok').length;
    const er = ctx.sessionCounters.filter(c => c.status === 'error').length;
    const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
    const ctxLine = proj + (ctx.lastOperation ? ' | ' + ctx.lastOperation : '') + counts;
    console.log('== ' + ctxLine + ' ==');
    divider();
    for (const item of MENU_ITEMS) {
        if (item.section) {
            console.log('  ' + item.section);
        } else {
            if (item.id === '0') console.log('');
            const hint = item.configKey ? ' ' + _configHint(item.configKey, ctx) : '';
            console.log('   ' + item.id + '  ' + item.label + hint);
        }
    }
    if (ok > 0 || er > 0) {
        console.log('  ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : ''));
    }
    console.log('  /h  Ajuda');
    divider();
}

/** @param {string} proj @param {import('../shared/session-context').SessionContext} ctx */
function buildContextLine(proj, ctx) {
    return ctx.buildContextLine(proj);
}

/** @param {string} proj @param {{ git_directory: string }} ctx */
function buildMenuChoices(proj, ctx) {
    const choices = [];
    for (const item of MENU_ITEMS) {
        if (item.section) {
            choices.push({ type: 'separator', line: ' ' + item.section });
        } else if (item.id === '0') {
            choices.push({ type: 'separator', line: '' });
            choices.push({ name: '0  ' + item.label, value: '0' });
        } else {
            const entry = { name: item.id + '  ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = ctx.git_directory;
            else if (item.configKey === 'cypressDir') entry.description = process.env.CYPRESS_PROJECT_PATH || loadState().lastCypressPath || 'nao configurado';
            else if (item.configKey === 'jsonDir') entry.description = loadState().lastJsonDir || 'nao configurado';
            else if (item.id === '9') entry.description = proj;
            choices.push(entry);
        }
    }
    return choices;
}

async function handleSpecialInput(input) {
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
        const hist = loadState().history || [];
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



function generateCsvTemplate(filePath) {
    const src = path.join(__dirname, 'test_steps_template.csv');
    try {
        fs.copyFileSync(src, filePath);
        return true;
    } catch (err) {
        error('Nao foi possivel copiar template de "' + src + '": ' + err.message);
        return false;
    }
}

async function main() {
    validateEnv();

    title('Bem-vindo ao QA Tools — Jira Management');
    info('Digite /help a qualquer momento para obter ajuda.');
    info('State: ' + STATE_PATH);
    divider();
    sessionLog.info('Sessão iniciada');

    const jiraResource = new JiraResource(personal_token, base_url + '/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const linkManager = new JiraLinkManager(jiraResource);
    const linkManagerXray = new JiraLinkManager(jiraResourceXray);
    const csvResource = new CsvResource();

    const ctx = new SessionContext();

    const state = loadState();
    ctx.project_name = (
        process.env.JIRA_PROJECT ||
        prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    function printSessionSummary() {
        const history = loadState().history || [];
        sharedPrintSessionSummary(ctx.sessionCounters, ctx.lastOperation, history);
    }

    function pushHistory(op, detail, status) {
        ctx.sessionCounters.push({ op, detail, status });
        updateState(state => {
            if (!state.history) state.history = [];
            state.history.push({ op, detail, status, ts: new Date().toISOString() });
            if (state.history.length > 50) state.history = state.history.slice(-50);
        });
    }

    setupSigint(() => ctx.isBusy, () => printSessionSummary());

    while (true) {
        let choice;
        if (process.env.AUTO_CHOICE) {
            choice = process.env.AUTO_CHOICE;
        } else if (process.stdout.isTTY && process.env.QUIET !== 'true') {
            const ctxLine = buildContextLine(ctx.project_name, ctx);
            console.log('== ' + ctxLine + ' ==');
            divider();
            /** @type {Array<any>} */
            const choices = buildMenuChoices(ctx.project_name, ctx);
            choices.push(
                { type: 'separator', line: '' },
                { name: '/help  Ajuda', value: '/help' },
                { name: '/history  Historico', value: '/history' },
            );
            const menuState = loadState();
            choice = await showSelect('Selecione uma opção', choices, {
                default: menuState.lastChoice && menuState.lastChoice !== '0' ? menuState.lastChoice : undefined,
            });
        } else {
            divider();
            displayMenu(ctx.project_name, ctx);
            const menuState = loadState();
            const lastHint = menuState.lastChoice && menuState.lastChoice !== '0'
                ? 'Enter = ' + menuState.lastChoice : '0-15 ou /help';
            choice = prompt('Selecione uma opção', { hint: lastHint });
            if (!choice.trim() && menuState.lastChoice && menuState.lastChoice !== '0') {
                choice = menuState.lastChoice;
                info('Repetindo última opção: ' + choice);
            }
        }

        if (await handleSpecialInput(choice)) continue;

        const resolved = resolveAlias(choice);
        if (resolved !== choice && !isNaN(resolved)) {
            choice = resolved;
        }

        updateState(state => { state.lastChoice = choice; });

        const opLog = sessionLog.child({ menuOption: choice });

        const cmdHandler = getHandler(choice);
        if (cmdHandler) {
            const cmdCtx = {
                jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource,
                ctx,
                pushHistory, printSessionSummary,
                base_url, sessionLog
            };
            const shouldContinue = await cmdHandler(cmdCtx);
            if (shouldContinue) continue;
        } else if (choice !== '0') {
            warn('Opção invalida. Escolha entre 0-16, alias ou digite /help.');
        }

        if (choice === '0') {
            title('Ate logo!');
            printSessionSummary();
            if (ctx.sessionCounters.some(c => c.status === 'error')) process.exitCode = 1;
            return;
        }

        const longOps = ['1', '15', '4', '5', '7', '8'];
        const hasResults = ctx.results.length > 0 && ctx.results.some(r => r.status === 'error');
        if (process.env.AUTO_CONFIRM !== 'true' && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}


main().catch(err => {
    printError('Erro inesperado', err);
    const state = loadState();
    sharedPrintSessionSummary([], '', state.history || []);
    process.exitCode = 1;
});
