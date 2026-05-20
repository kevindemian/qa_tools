// @ts-check
const path = require('path');
const fs = require('fs');
const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');
const CsvResource = require('./csv_resource');
const PackageVersionManager = require('./package_version_manager');
const { success, error, warn, info, title, divider, prompt, confirm, printError, printSummary, smartPrompt } = require('../shared/prompt');
const { mask, createValidateEnv, setupSigint } = require('../shared/cli_base');
const { rootLogger } = require('../shared/logger');
const { load: loadState, update: updateState, STATE_PATH } = require('../shared/state');
const { createTestsFromCsv } = require('./create_tests');

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
    const logPath = rootLogger.filePath;
    console.log('');
    console.log('='.repeat(50));
    info('Sessao encerrada.');

    const ok = sessionCounters.filter(c => c.status === 'ok').length;
    const er = sessionCounters.filter(c => c.status === 'error').length;
    if (ok > 0 || er > 0) {
        if (ok > 0) success(ok + ' operacao(oes) concluida(s)');
        if (er > 0) error(er + ' operacao(oes) com erro');
    }

    const history = loadState().history || [];
    if (history.length > 0) {
        const last5 = history.slice(-5);
        info('Ultimas operacoes:');
        last5.forEach(h => {
            const icon = h.status === 'error' ? 'ERR' : 'OK';
            console.log(`  ${icon} ${h.op}: ${h.detail}`);
        });
    }

    if (lastOperation) info('Ultima operacao: ' + lastOperation);
    if (logPath) info('Log: ' + logPath);
    console.log('='.repeat(50));
    rootLogger.writeFileOnly('INFO', 'Sessao encerrada. ' +
        (ok > 0 ? ok + ' ok, ' : '') +
        (er > 0 ? er + ' erro(s), ' : '') +
        'ultima: ' + (lastOperation || 'nenhuma'));
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
    group: 'Group: agrupa testes para cross-reference.\n  Testes com mesmo Group: tem descricoes atualizadas automaticamente\n  apos criacao com referencia mutua.',
    precondition: 'Pre-condition:\n  Referencia: "KEY-123" (issue Jira)\n  Inline: texto descritivo (aparece na descricao do teste)',
    project: 'Projeto Jira:\n  Chave do projeto (ex: ECSPOL, PROJ).\n  Deve estar definido no Jira com permissao de criacao de issues.',
    version: 'Versao:\n  Nome da versao (ex: v2.7.0).\n  Criada no projeto Jira para organizar releases.',
    transitions: 'Transicoes:\n  Fluxo: New -> Approve -> Coding In Progress -> Coding Done -> Done\n  Use a opcao 7 para fechamento automatico.',
    template: 'Template CSV:\n  Use a opcao 11 para gerar um arquivo CSV de exemplo.',
    diagnostics: 'Diagnostico de conexao:\n  Opcao 12 no menu. Testa conectividade com Jira API, Xray API,\n  e valida o projeto atual. Mostra tempos de resposta e status HTTP.'
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
    info('Escolha uma opcao do menu e siga as instrucoes.');
    info('Em qualquer prompt de texto, digite /help para ver esta ajuda.');
    info('Digite /help <topico> para ajuda especifica: ' + Object.keys(HELP_TOPICS).join(', '));
    info('Digite /help search <termo> para buscar em todos os topicos.');
    info('Digite /back ou /menu para voltar ao menu principal.');
    divider();
    title('Fluxo comum:');
    info('1. Crie seu CSV de testes (veja test_steps.csv como exemplo)');
    info('2. Opcao 1 -> Cria os testes no Jira com steps, pre-conditions e links');
    info('3. Opcoes 3-4-8 -> Gerencie versoes de release');
    info('4. Opcao 7 -> Feche tarefas automaticamente');
    divider();
}

const ALIASES = {
    'criar': '1', 'criar-teste': '1', 'criar-testes': '1',
    'listar-versoes': '2', 'versoes': '2',
    'criar-versao': '3',
    'atribuir-fixversion': '4', 'fixversion': '4',
    'atualizar-package': '5', 'package': '5',
    'verificar': '6', 'status': '6',
    'fechar': '7',
    'publicar': '8', 'release': '8',
    'trocar-projeto': '9', 'projeto': '9',
    'trocar-diretorio': '10', 'diretorio': '10',
    'template': '11', 'gerar-template': '11',
    'sair': '0', 'exit': '0',
    'voltar': 'menu',
    'ajuda': '/help', 'help': '/help'
};

function resolveAlias(choice) {
    const trimmed = choice.trim().toLowerCase();
    return ALIASES[trimmed] || choice;
}

function displayMenu(proj, gitDir) {
    if (lastOperation) {
        info('Ultima operacao: ' + lastOperation);
    }
    title('Jira Tools — Projeto: ' + proj);
    divider();
    console.log('  TESTES');
    console.log('   1  Criar testes a partir de CSV');
    console.log('');
    console.log('  RELEASES');
    console.log('   2  Listar versoes de release');
    console.log('   3  Criar nova versao');
    console.log('   4  Atribuir fixVersion as tarefas');
    console.log('   5  Atualizar package.json + release notes');
    console.log('   6  Verificar status das tarefas');
    console.log('   7  Fechar tarefas automaticamente');
    console.log('   8  Publicar versao');
    console.log('');
    console.log('  CONFIGURACAO');
    console.log('   9  Alterar projeto Jira');
    console.log('  10  Alterar diretorio git (atual: ' + gitDir + ')');
    console.log('');
    console.log('  UTILITARIOS');
    console.log('  11  Gerar template CSV');
    console.log('  12  Diagnosticar conexao');
    console.log('');
    console.log('   0  Sair');
    console.log('  /h  Ajuda');
    divider();
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
    sessionLog.info('Sessao iniciada');

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

    async function withBusy(fn) {
        isBusy = true;
        try { return await fn(); } finally { isBusy = false; }
    }

    while (true) {
        let choice;
        if (process.env.AUTO_CHOICE) {
            choice = process.env.AUTO_CHOICE;
        } else {
            divider();
            displayMenu(project_name, git_directory);
            const menuState = loadState();
            const lastHint = menuState.lastChoice && menuState.lastChoice !== '0'
                ? 'Enter = ' + menuState.lastChoice : '0-12 ou /help';
            choice = prompt('Selecione uma opcao', { hint: lastHint });
            if (!choice.trim() && menuState.lastChoice && menuState.lastChoice !== '0') {
                choice = menuState.lastChoice;
                info('Repetindo ultima opcao: ' + choice);
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
                break;
            }

            case '2': {
                const howMany = prompt('Quantas releases listar?', { hint: 'ex: 5' });
                const num = parseInt(howMany);
                if (isNaN(num) || num < 1) {
                    warn('Numero invalido.');
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
                const name = smartPrompt('Nome da versao', { hint: 'ex: v2.7.0' }, () => showHelp('version'));
                const desc = smartPrompt('Descricao da versao', {}, () => showHelp('version'));
                try {
                    await jiraResource.createVersion(project_name, name, desc);
                    pushHistory('criar-versao', name, 'ok');
                } catch (err) {
                    const msg = `Erro ao criar versão "${name}" no projeto "${project_name}"`;
                    printError(msg, err);
                    rootLogger.error(msg, { version: name, project: project_name, status: err.response?.status });
                    pushHistory('criar-versao', name, 'error');
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

                const version = smartPrompt('Nome da versao', {}, () => showHelp('version'));

                title('Preview da operacao');
                console.log('  Versao: ' + version);
                console.log('  Tarefas (' + taskIds.length + '):');
                taskIds.forEach(id => console.log('    - ' + id));
                if (!confirm('Confirmar atribuicao de fixVersion?')) {
                    warn('Operacao cancelada.');
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
                    const dir = smartPrompt('Diretorio do projeto git', { default: process.cwd() }, () => showHelp('version'));
                    packageManager = new PackageVersionManager(dir);
                    git_directory = dir;
                }
                const version = smartPrompt('Nome da versao', { hint: 'ex: v2.7.0' }, () => showHelp('version'));
                try {
                    const tasks = await jiraResource.getReleaseTasks(project_name, version, true);
                    if (!Array.isArray(tasks)) {
                        warn('Nenhuma tarefa encontrada para esta versao.');
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
                const version = smartPrompt('Nome da versao', {}, () => showHelp('version'));
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
                const version = smartPrompt('Versao a fechar', {}, () => showHelp('version'));
                if (!confirm('Fechar todas as tarefas da versao ' + version + '? Esta operacao nao pode ser desfeita.')) {
                    warn('Operacao cancelada.');
                    continue;
                }
                const tasks = await jiraResource.getReleaseTasks(project_name, version);
                if (!Array.isArray(tasks) || tasks.length === 0) {
                    warn('Nenhuma tarefa encontrada para esta versao.');
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
                const version = smartPrompt('Versao a publicar', {}, () => showHelp('version'));
                if (!confirm('Publicar versao ' + version + '? Isso marcara a versao como released.')) {
                    warn('Operacao cancelada.');
                    continue;
                }
                try {
                    await jiraResource.releaseVersion(project_name, version);
                    printSummary(
                        /** @type {import('../shared/types').TestResult[]} */ ([{ status: 'ok', label: 'Versao ' + version, message: 'Publicada com sucesso' }]));
                    lastOperation = 'Versao ' + version + ' publicada';
                    pushHistory('publicar-versao', version, 'ok');
                } catch (err) {
                    printError('Erro ao publicar versao', err);
                    pushHistory('publicar-versao', 'erro', 'error');
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
                const dir = prompt('Caminho do diretorio git');
                packageManager = new PackageVersionManager(dir);
                git_directory = dir;
                success('Diretorio alterado para: ' + dir);
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
                    { url: base_url + '/rest/api/2/myself', label: 'Jira API' },
                    { url: xray_url, label: 'Xray API' },
                    { url: base_url + '/rest/api/2/project/' + project_name, label: 'Projeto ' + project_name }
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
                            warn(ep.label + ': ' + st + ' (token pode estar invalido)');
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

            case '0':
                title('Ate logo!');
                printSessionSummary();
                if (sessionCounters.some(c => c.status === 'error')) process.exitCode = 1;
                return;

            default:
                warn('Opcao invalida. Escolha entre 0-12, alias ou digite /help.');
        }

        const longOps = ['1', '4', '5', '7', '8'];
        const hasResults = typeof results !== 'undefined' && results && results.some(r => r.status === 'error');
        if (process.env.AUTO_CONFIRM !== 'true' && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}

main();
