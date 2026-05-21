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
const { createTestsFromCsv, createTestsFromJson, createTestExecution, createTestExecutionWithLinks } = require('./create_tests');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/** @type {string} */
let base_url = /** @type {string} */ (process.env.JIRA_BASE_URL);
/** @type {string} */
let personal_token = /** @type {string} */ (process.env.JIRA_PERSONAL_TOKEN);
/** @type {string} */
let xray_url = /** @type {string} */ (process.env.XRAY_BASE_URL);
let default_project = 'ECSPOL';
let git_directory = 'no_dir_selected';
let isBusy = false;
let lastOperation = '';
let sessionCounters = [];

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

function printSessionSummary() {
    const history = loadState().history || [];
    sharedPrintSessionSummary(sessionCounters, lastOperation, history);
}

function pushHistory(op, detail, status) {
    sessionCounters.push({ op, detail, status });
    updateState(state => {
        if (!state.history) state.history = [];
        state.history.push({ op, detail, status, ts: new Date().toISOString() });
        if (state.history.length > 50) state.history = state.history.slice(-50);
    });
}

setupSigint(() => isBusy, () => printSessionSummary());

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

/** @param {string} key */
function _configHint(key) {
    if (key === 'gitDir') return '(atual: ' + git_directory + ')';
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

function displayMenu(proj) {
    const ok = sessionCounters.filter(c => c.status === 'ok').length;
    const er = sessionCounters.filter(c => c.status === 'error').length;
    const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
    const ctx = proj + (lastOperation ? ' | ' + lastOperation : '') + counts;
    console.log('== ' + ctx + ' ==');
    divider();
    for (const item of MENU_ITEMS) {
        if (item.section) {
            console.log('  ' + item.section);
        } else {
            if (item.id === '0') console.log('');
            const hint = item.configKey ? ' ' + _configHint(item.configKey) : '';
            console.log('   ' + item.id + '  ' + item.label + hint);
        }
    }
    if (ok > 0 || er > 0) {
        console.log('  ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : ''));
    }
    console.log('  /h  Ajuda');
    divider();
}

function buildContextLine(proj) {
    const ok = sessionCounters.filter(c => c.status === 'ok').length;
    const er = sessionCounters.filter(c => c.status === 'error').length;
    const counts = ok > 0 || er > 0 ? ' | ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : '') : '';
    return proj + (lastOperation ? ' | ' + lastOperation : '') + counts;
}

/** @returns {Array<any>} */
function buildMenuChoices(proj) {
    const choices = [];
    for (const item of MENU_ITEMS) {
        if (item.section) {
            choices.push({ type: 'separator', line: ' ' + item.section });
        } else if (item.id === '0') {
            choices.push({ type: 'separator', line: '' });
            choices.push({ name: '0  ' + item.label, value: '0' });
        } else {
            const entry = { name: item.id + '  ' + item.label, value: item.id };
            if (item.configKey === 'gitDir') entry.description = git_directory;
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
    let packageManager;
    let inMemoryTasksId = [];
    let inMemoryTasksText = [];

    const state = loadState();
    let project_name = (
        process.env.JIRA_PROJECT ||
        prompt('Nome do projeto Jira', { default: state.lastProject || default_project })
    ).toUpperCase();

    let results = [];
    function resetResults() { results = []; }

    async function withBusy(fn) {
        isBusy = true;
        try { return await fn(); } finally { isBusy = false; }
    }

    while (true) {
        let choice;
        if (process.env.AUTO_CHOICE) {
            choice = process.env.AUTO_CHOICE;
        } else if (process.stdout.isTTY && process.env.QUIET !== 'true') {
            const ctx = buildContextLine(project_name);
            console.log('== ' + ctx + ' ==');
            divider();
            const choices = buildMenuChoices(project_name);
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
            displayMenu(project_name);
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

        switch (choice) {
            case '1': {
                resetResults();
                const result = await createTestsFromCsv({
                    jiraResource,
                    jiraResourceXray,
                    linkManager,
                    linkManagerXray,
                    csvResource,
                    project_name,
                    base_url,
                    sessionLog,
                    onBusy: (val) => { isBusy = val; }
                });
                if (result) {
                    inMemoryTasksId = result.inMemoryTasksId;
                    inMemoryTasksText = result.inMemoryTasksText;
                    pushHistory('csv-import', result.summary, result.status);
                    lastOperation = result.summary;
                }
                if (result && inMemoryTasksId.length > 0) {
                    const execState = loadState();
                    const csvPathHint = execState.lastCsvPath || '';
                    const csvName = csvPathHint ? path.basename(csvPathHint, '.csv') : '';
                    if (confirm('Criar Test Execution para ' + inMemoryTasksId.length + ' testes criados?', true)) {
                        const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + (csvName || 'Automated Execution') });
                        const execDesc = prompt('Descrição (opcional)');
                        try {
                            const execResult = await createTestExecutionWithLinks(
                                jiraResource, linkManager, project_name, inMemoryTasksId, csvName,
                                { title: execTitle, description: execDesc }
                            );
                            pushHistory('create-testexec', execResult.key, 'ok');
                        } catch (err) {
                            printError('Erro ao criar Test Execution', err);
                            pushHistory('create-testexec', 'erro', 'error');
                        }
                    }
                }
                break;
            }

            case '2': {
                const howMany = prompt('Quantas releases listar?', { hint: 'ex: 5' });
                const num = parseInt(howMany);
                if (isNaN(num) || num < 1) {
                    warn('Numero inválido.');
                    continue;
                }
                try {
                    await jiraResource.getLatestReleases(project_name, num);
                    pushHistory('listar-versoes', num + ' versoes', 'ok');
                } catch (err) {
                    printError('Erro ao listar versoes', err);
                    pushHistory('listar-versoes', 'erro', 'error');
                }
                break;
            }

            case '3': {
                const name = smartPrompt('Nome da versão', { hint: 'ex: v2.7.0' }, () => showHelp('version'));
                const desc = smartPrompt('Descrição da versão', {}, () => showHelp('version'));
                try {
                    await jiraResource.createVersion(project_name, name, desc);
                    pushHistory('criar-versão', name, 'ok');
                } catch (err) {
                    const msg = `Erro ao criar versão "${name}" no projeto "${project_name}"`;
                    printError(msg, err);
                    rootLogger.error(msg, { version: name, project: project_name, status: err.response?.status });
                    pushHistory('criar-versão', name, 'error');
                }
                break;
            }

            case '4': {
                const useInMemory = confirm('Usar tarefas criadas anteriormente?', true);
                let taskIds = [];

                if (useInMemory) {
                    if (inMemoryTasksId.length === 0) {
                        warn('Nenhuma tarefa criada anteriormente. Insira manualmente.');
                        const input = prompt('IDs das tarefas (separadas por espaco)');
                        taskIds = input.split(' ').filter(Boolean);
                    } else {
                        inMemoryTasksId.forEach((id, idx) => {
                            console.log('  ' + id + ' — ' + inMemoryTasksText[idx]);
                            taskIds.push(id);
                        });
                    }
                } else {
                    const input = prompt('IDs das tarefas (separadas por espaco)');
                    taskIds = input.split(' ').filter(Boolean);
                }

                const version = smartPrompt('Nome da versão', {}, () => showHelp('version'));

                title('Preview da operação');
                console.log('  Versão: ' + version);
                console.log('  Tarefas (' + taskIds.length + '):');
                taskIds.forEach(id => console.log('    - ' + id));
                if (!confirm('Confirmar atribuicao de fixVersion?')) {
                    warn('Operação cancelada.');
                    continue;
                }

                results = [];
                await withBusy(async () => {
                    for (const taskId of taskIds) {
                        try {
                            await jiraResource.updateFixVersions([taskId], project_name, version);
                            results.push({ status: 'ok', label: taskId, message: '' });
                        } catch (err) {
                            results.push({ status: 'error', label: taskId, message: 'Falha ao atualizar fixVersion' });
                        }
                    }
                });
                printSummary(
                    /** @type {import('../shared/types').TestResult[]} */ (results));
                lastOperation = results.filter(r => r.status === 'ok').length + '/' + taskIds.length + ' tarefas atualizadas';
                pushHistory('atribuir-fixversion', lastOperation,
                    results.some(r => r.status === 'error') ? 'error' : 'ok');

                if (confirm('Adicionar tarefas a uma sprint?')) {
                    const sprintId = prompt('ID da sprint', { hint: 'ex: 6991 (encontrado na URL do board)' });
                    const agileResource = new JiraResource(personal_token, base_url + '/rest/agile/1.0');
                    await agileResource.addTasksToSprint(taskIds, sprintId);
                }
                break;
            }

            case '5': {
                if (!packageManager) {
                    const dir = smartPrompt('Diretório do projeto git', { default: process.cwd() }, () => showHelp('version'));
                    packageManager = new PackageVersionManager(dir);
                    git_directory = dir;
                }
                const version = smartPrompt('Nome da versão', { hint: 'ex: v2.7.0' }, () => showHelp('version'));
                try {
                    const tasks = await jiraResource.getReleaseTasks(project_name, version, true);
                    if (!Array.isArray(tasks)) {
                        warn('Nenhuma tarefa encontrada para esta versão.');
                        break;
                    }
                    const versionNumber = version.split(' ').pop();
                    packageManager.updateReleaseNotes(versionNumber, tasks);

                    const pkgVersion = version.split(' ').pop().split('v').pop();
                    packageManager.updateVersion(pkgVersion);
                    lastOperation = 'Package atualizado para v' + pkgVersion;
                    pushHistory('atualizar-package', lastOperation, 'ok');
                    success('Package version e release notes atualizados.');
                } catch (err) {
                    const msg = `Erro ao atualizar package para versão "${version}" no projeto "${project_name}"`;
                    printError(msg, err);
                    rootLogger.error(msg, { version, project: project_name, status: err.response?.status });
                    pushHistory('atualizar-package', version, 'error');
                }
                break;
            }

            case '6': {
                const version = smartPrompt('Nome da versão', {}, () => showHelp('version'));
                try {
                    await jiraResource.checkReleaseTasksStatus(project_name, version);
                    pushHistory('verificar-status', version, 'ok');
                } catch (err) {
                    const msg = `Erro ao verificar status da versão "${version}" no projeto "${project_name}"`;
                    printError(msg, err);
                    rootLogger.error(msg, { version, project: project_name, status: err.response?.status });
                    pushHistory('verificar-status', version, 'error');
                }
                break;
            }

            case '7': {
                const version = smartPrompt('Versão a fechar', {}, () => showHelp('version'));
                if (!confirm('Fechar todas as tarefas da versão ' + version + '? Esta operação nao pode ser desfeita.')) {
                    warn('Operação cancelada.');
                    continue;
                }
                const tasks = await jiraResource.getReleaseTasks(project_name, version);
                if (!Array.isArray(tasks) || tasks.length === 0) {
                    warn('Nenhuma tarefa encontrada para esta versão.');
                    continue;
                }
                const taskIds = tasks
                    .map(task => task.match(/\[([A-Z][A-Z0-9]+-\d+)\]/)?.[1])
                    .filter(id => id !== undefined);
                if (taskIds.length === 0) {
                    warn('Nenhuma tarefa encontrada.');
                    continue;
                }
                info('Fechando ' + taskIds.length + ' tarefa(s)...');
                await withBusy(async () => {
                    try {
                        await jiraResource.moveCardsToDone(taskIds);
                        const summary = taskIds.map(id => ({ status: 'ok', label: id, message: '' }));
                        printSummary(
                            /** @type {import('../shared/types').TestResult[]} */ (summary));
                        pushHistory('fechar-tarefas', taskIds.length + ' tarefa(s)', 'ok');
                    } catch (err) {
                        const summary = taskIds.map(id => ({ status: 'error', label: id, message: 'Falha ao fechar tarefa' }));
                        printSummary(
                            /** @type {import('../shared/types').TestResult[]} */ (summary));
                        pushHistory('fechar-tarefas', 'erro', 'error');
                    }
                    lastOperation = taskIds.length + ' tarefa(s) fechadas';
                });
                break;
            }

            case '8': {
                const version = smartPrompt('Versão a publicar', {}, () => showHelp('version'));
                if (!confirm('Publicar versão ' + version + '? Isso marcara a versão como released.')) {
                    warn('Operação cancelada.');
                    continue;
                }
                try {
                    await jiraResource.releaseVersion(project_name, version);
                    printSummary(
                        /** @type {import('../shared/types').TestResult[]} */ ([{ status: 'ok', label: 'Versão ' + version, message: 'Publicada com sucesso' }]));
                    lastOperation = 'Versão ' + version + ' publicada';
                    pushHistory('publicar-versão', version, 'ok');
                } catch (err) {
                    printError('Erro ao publicar versão', err);
                    pushHistory('publicar-versão', 'erro', 'error');
                }
                break;
            }

            case '9': {
                const newName = prompt('Novo nome do projeto Jira').toUpperCase().trim();
                if (!newName) {
                    warn('Nome do projeto nao pode ser vazio.');
                    break;
                }
                project_name = newName;
                lastOperation = 'Projeto alterado para ' + project_name;
                pushHistory('trocar-projeto', project_name, 'ok');
                updateState(state => { state.lastProject = project_name; });
                success('Projeto alterado para: ' + project_name);
                break;
            }

            case '10': {
                const dir = prompt('Caminho do diretório git');
                packageManager = new PackageVersionManager(dir);
                git_directory = dir;
                success('Diretório alterado para: ' + dir);
                break;
            }

            case '11': {
                const tmplPath = prompt('Caminho para salvar o template', {
                    default: path.join(__dirname, 'test_steps_template.csv')
                });
                if (generateCsvTemplate(tmplPath)) {
                    success('Template CSV gerado em: ' + tmplPath);
                    pushHistory('gerar-template', tmplPath, 'ok');
                } else {
                    error('Falha ao gerar template CSV.');
                }
                break;
            }

            case '12': {
                title('Diagnostico de Conexao');
                const results = [];
                const endpoints = [
                    { url: sanitizeUrl(base_url + '/rest/api/2/myself'), label: 'Jira API' },
                    { url: sanitizeUrl(xray_url), label: 'Xray API' },
                    { url: sanitizeUrl(base_url + '/rest/api/2/project/' + project_name), label: 'Projeto ' + project_name }
                ];
                for (const ep of endpoints) {
                    const start = Date.now();
                    try {
                        const resp = await jiraResource.axiosInstance.get(ep.url);
                        const ms = Date.now() - start;
                        info(ep.label + ': ' + resp.status + ' (' + ms + 'ms)');
                        results.push({ status: 'ok', label: ep.label, message: ms + 'ms' });
                    } catch (err) {
                        const ms = Date.now() - start;
                        const st = err.response?.status || 'ERR';
                        if (st === 401 || st === 403) {
                            warn(ep.label + ': ' + st + ' (token pode estar inválido)');
                        } else {
                            error(ep.label + ': ' + st + ' (' + ms + 'ms)');
                        }
                        results.push({ status: 'error', label: ep.label, message: st + ' ' + ms + 'ms' });
                    }
                }
                printSummary(
                    /** @type {import('../shared/types').TestResult[]} */ (results));
                pushHistory('diagnostico',
                    results.filter(r => r.status === 'ok').length + '/' + results.length + ' ok',
                    results.some(r => r.status === 'error') ? 'error' : 'ok');
                break;
            }

            case '13': {
                let keys = [];
                if (inMemoryTasksId.length > 0) {
                    info('Testes da sessão atual: ' + inMemoryTasksId.join(', '));
                    if (confirm('Usar estes ' + inMemoryTasksId.length + ' testes?', true)) {
                        keys = inMemoryTasksId;
                    }
                }
                if (keys.length === 0) {
                    const input = prompt('Keys dos testes (separadas por espaco)', { hint: 'ex: TEST-1 TEST-2' });
                    keys = input.split(/\s+/).filter(Boolean);
                }
                if (keys.length === 0) {
                    warn('Nenhuma key informada.');
                    break;
                }
                const nameInput = prompt('Nome da execução', { hint: 'Enter = "Automated Execution"' });
                const csvName = nameInput.trim() || '';
                const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + (csvName || 'Automated Execution') });
                const execDesc = prompt('Descrição (opcional)');
                try {
                    const execResult = await createTestExecutionWithLinks(
                        jiraResource, linkManager, project_name, keys, csvName,
                        { title: execTitle, description: execDesc }
                    );
                    pushHistory('create-testexec', execResult.key, 'ok');
                } catch (err) {
                    printError('Erro ao criar Test Execution', err);
                    pushHistory('create-testexec', 'erro', 'error');
                }
                break;
            }

            case '14': {
                const dir = prompt('Caminho do diretório Cypress');
                if (!dir.trim()) {
                    warn('Caminho vazio, ignorando.');
                    break;
                }
                const resolved = path.resolve(dir.trim());
                updateState(state => { state.lastCypressPath = resolved; });
                success('Diretório Cypress alterado para: ' + resolved);
                pushHistory('config-cypress', resolved, 'ok');
                break;
            }

            case '15': {
                resetResults();
                try {
                    const result = await createTestsFromJson({
                        jiraResource, jiraResourceXray, linkManager, linkManagerXray,
                        project_name, base_url, sessionLog,
                        onBusy: (val) => { isBusy = val; }
                    });
                    if (result) {
                        inMemoryTasksId = result.inMemoryTasksId;
                        inMemoryTasksText = result.inMemoryTasksText;
                        const okCount = result.inMemoryTasksId.length;
                        success('Importacao JSON concluída: ' + okCount + ' testes');
                        results = result.inMemoryTasksId.map(key => ({ status: 'ok', label: key, message: '' }));
                        pushHistory('importar-json', okCount + ' testes', 'ok');

                        if (confirm('Criar Test Execution para estes testes?', true)) {
                            try {
                                const keys = result.inMemoryTasksId;
                                const srcName = result.sourcePath ? path.basename(result.sourcePath, '.json') : 'json-import';
                                const nameInput = prompt('Nome da execução', { hint: 'Enter = ' + srcName });
                                const csvName = nameInput.trim() || srcName;
                                const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + csvName });
                                const execDesc = prompt('Descrição (opcional)');
                                const execResult = await createTestExecutionWithLinks(
                                    jiraResource, linkManager, project_name, keys, csvName,
                                    { title: execTitle, description: execDesc }
                                );
                                success('Test Execution criado: ' + execResult.key);
                                pushHistory('create-testexec', execResult.key, 'ok');
                            } catch (err) {
                                printError('Erro ao criar Test Execution', err);
                            }
                        }

                        lastOperation = okCount + ' testes importados via JSON';
                    }
                } catch (err) {
                    printError('Erro ao importar JSON', err);
                    pushHistory('importar-json', 'erro', 'error');
                }
                break;
            }

            case '16': {
                const dir = prompt('Caminho do diretório padrão de JSON');
                if (!dir.trim()) {
                    warn('Caminho vazio, ignorando.');
                    break;
                }
                const resolved = path.resolve(dir.trim());
                updateState(state => { state.lastJsonDir = resolved; });
                success('Diretório padrao JSON alterado para: ' + resolved);
                pushHistory('config-json-dir', resolved, 'ok');
                break;
            }

            case '0':
                title('Ate logo!');
                printSessionSummary();
                if (sessionCounters.some(c => c.status === 'error')) process.exitCode = 1;
                return;

            default:
                warn('Opção invalida. Escolha entre 0-16, alias ou digite /help.');
        }

        const longOps = ['1', '15', '4', '5', '7', '8'];
        const hasResults = typeof results !== 'undefined' && results && results.some(r => r.status === 'error');
        if (process.env.AUTO_CONFIRM !== 'true' && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}

main().catch(err => {
    printError('Erro inesperado', err);
    printSessionSummary();
    process.exitCode = 1;
});
