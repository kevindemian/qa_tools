const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const JiraResource = require('./jira_resource');
const JiraLinkManager = require('./jira_link_manager');
const CsvResource = require('./csv_resource');
const PackageVersionManager = require('./package_version_manager');
const { success, error, warn, info, title, divider, prompt, confirm, printError, printSummary, smartPrompt, onError, Spinner, ProgressBar, isQuiet } = require('../shared/prompt');
const { mask, createValidateEnv, setupSigint } = require('../shared/cli_base');
const { rootLogger } = require('../shared/logger');
const { load: loadState, save: saveState, STATE_PATH } = require('../shared/state');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let base_url = process.env.JIRA_BASE_URL;
let personal_token = process.env.JIRA_PERSONAL_TOKEN;
let xray_url = process.env.XRAY_BASE_URL;
let default_project = 'ECSPOL';
let git_directory = 'no_dir_selected';
let csvDefaultPath = process.env.CSV_DEFAULT_PATH || path.join(__dirname, 'test_steps.csv');
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
    rootLogger._writeFile('INFO', 'Sessao encerrada. ' +
        (ok > 0 ? ok + ' ok, ' : '') +
        (er > 0 ? er + ' erro(s), ' : '') +
        'ultima: ' + (lastOperation || 'nenhuma'));
}

function pushHistory(op, detail, status) {
    sessionCounters.push({ op, detail, status });
    const state = loadState();
    if (!state.history) state.history = [];
    state.history.push({ op, detail, status, ts: new Date().toISOString() });
    if (state.history.length > 50) state.history = state.history.slice(-50);
    save(state);
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
    template: 'Template CSV:\n  Use a opcao 11 para gerar um arquivo CSV de exemplo.'
};

function showHelp(topic) {
    if (topic) {
        const lower = topic.toLowerCase().trim();
        if (HELP_TOPICS[lower]) {
            title('HELP — ' + lower);
            info(HELP_TOPICS[lower]);
            return;
        }
        warn('Topico nao encontrado: "' + topic + '". Tente: ' + Object.keys(HELP_TOPICS).join(', '));
        return;
    }
    title('HELP — Jira Tools');
    info('Escolha uma opcao do menu e siga as instrucoes.');
    info('Em qualquer prompt de texto, digite /help para ver esta ajuda.');
    info('Digite /help <topico> para ajuda especifica: ' + Object.keys(HELP_TOPICS).join(', '));
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
    const state = loadState();
    const hint = state.lastChoice && state.lastChoice !== '0'
        ? 'Enter = ' + state.lastChoice : '0-12 ou /help';
    title('Jira Tools — Projeto: ' + proj);
    divider();
    console.log('  TESTES');
    console.log('   1  Criar testes a partir de CSV');
    console.log('   2  Listar versoes de release');
    console.log('');
    console.log('  RELEASES');
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

function estimateRemaining(tests, startIdx, elapsedMs, testDurations) {
    if (testDurations.length === 0) return '';
    const avg = testDurations.reduce((a, b) => a + b, 0) / testDurations.length;
    const remaining = tests.length - startIdx;
    const est = Math.round(avg * remaining / 1000);
    if (est < 5) return '~' + est + 's';
    if (est < 120) return '~' + Math.round(est / 5) * 5 + 's';
    return '~' + Math.round(est / 60) + 'm';
}

function csvChecksum(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function validateCsvTests(tests) {
    const errors = [];
    const warnings = [];
    const titles = new Set();

    tests.forEach((test, i) => {
        const idx = i + 1;

        if (!test.title || !test.title.trim()) {
            errors.push('Teste ' + idx + ': Titulo vazio');
        }

        if (test.title && titles.has(test.title.trim())) {
            warnings.push('Teste ' + idx + ': Titulo duplicado "' + test.title.trim() + '"');
        }
        if (test.title) titles.add(test.title.trim());

        if (!test.steps || test.steps.length === 0) {
            errors.push('Teste ' + idx + ' "' + (test.title || '(sem titulo)') + '": Nenhum step definido');
        } else {
            test.steps.forEach((step, si) => {
                const action = step.fields?.Action || '';
                if (!action.trim()) {
                    warnings.push('Teste ' + idx + ' "' + test.title + '": Step ' + (si + 1) + ' sem Action');
                }
            });
        }
    });

    return { errors, warnings };
}

async function updateCrossReferences(jiraResource, tests, ids) {
    const valid = tests.map((t, i) => ({ test: t, id: ids[i] }))
        .filter(x => x.id && x.test.group);

    const groups = {};
    for (const { test, id } of valid) {
        const key = test.group.toUpperCase();
        if (!groups[key]) groups[key] = { name: test.group, members: [] };
        groups[key].members.push({ id, description: test.description || '' });
    }

    const crossLog = rootLogger.child({ operation: 'cross-ref' });

    for (const group of Object.values(groups)) {
        if (group.members.length < 2) continue;

        crossLog.info('Atualizando descricoes do grupo "' + group.name + '" (' + group.members.length + ' issues)');

        await JiraResource.delay(500);

        for (const member of group.members) {
            const others = group.members
                .filter(m => m.id !== member.id)
                .map(m => m.id)
                .join(', ');
            const refText = '\n\nEste caso de teste faz parte do conjunto ' + group.name + ': ' + others;

            try {
                const current = await jiraResource.getJiraResource('issue/' + member.id);
                const currentDesc = current?.fields?.description || '';
                if (currentDesc.includes('faz parte do conjunto')) {
                    crossLog.info('  ' + member.id + ': ja atualizado, pulando');
                    continue;
                }

                await jiraResource.putJiraResource('issue/' + member.id, {
                    fields: { description: currentDesc + refText }
                });
                process.stdout.write('+');
                crossLog.info('  ' + member.id + ': descricao atualizada');
            } catch (err) {
                crossLog.error('Falha ao atualizar descricao de ' + member.id + ' no grupo "' + group.name + '"', {
                    status: err.response?.status
                });
                process.stdout.write('x');
            }
        }
    }
}

function generateCsvTemplate(filePath) {
    const content = 'Title: [QA] Login - credenciais validas\n' +
        'Description: Verifica o fluxo de login com usuario e senha corretos\n' +
        'Pre-condition: Usuario cadastrado no sistema\n' +
        'Group: LOGIN-FLOW\n' +
        'Linked Issues: KEY-123 (relates to)\n' +
        '---\n' +
        'Action,Data,Expected Result\n' +
        'Acessar pagina de login,,Pagina de login exibida corretamente\n' +
        'Preencher usuario,usuario_teste@email.com,Campo preenchido\n' +
        'Preencher senha,senha123,Campo preenchido (oculto)\n' +
        'Clicar em "Entrar",,Redirecionado para o dashboard\n' +
        '---\n' +
        'Title: [QA] Login - campo vazio\n' +
        'Description: Verifica a validacao de campo obrigatorio\n' +
        'Group: LOGIN-FLOW\n' +
        '---\n' +
        'Action,Data,Expected Result\n' +
        'Acessar pagina de login,,Pagina de login exibida\n' +
        'Deixar usuario em branco,,"Mensagem: ""Campo obrigatorio"""\n' +
        'Clicar em "Entrar",,Mensagem de erro exibida\n';
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        return true;
    } catch (err) {
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

        save(state => { state.lastChoice = choice; });

        const opLog = sessionLog.child({ menuOption: choice });

        switch (choice) {
            case '1': {
                const state = loadState();
                const csvPath = process.env.CSV_PATH || smartPrompt(
                    'Caminho do arquivo CSV',
                    { default: state.lastCsvPath || csvDefaultPath },
                    () => showHelp('csv')
                );
                const labelsHint = state.lastLabels
                    ? 'ultimo: ' + state.lastLabels : 'vazio para nenhuma';
                const jiraLabelsInput = process.env.CSV_LABELS || prompt(
                    'Labels Jira (separadas por virgula)',
                    { hint: labelsHint, default: state.lastLabels || '' }
                );
                const jiraLabels = jiraLabelsInput
                    .split(',')
                    .map(l => l.trim())
                    .filter(l => l.length > 0);

                if (!isQuiet()) info('Lendo CSV...');
                let tests;
                let rawCsvContent;
                try {
                    rawCsvContent = fs.readFileSync(csvPath, 'utf8');
                    tests = await csvResource.readBulkCsv(csvPath);
                } catch (err) {
                    printError('Erro ao ler CSV', err);
                    continue;
                }

                if (tests.length === 0) {
                    warn('Nenhum teste encontrado no CSV.');
                    continue;
                }

                // Checkpoint resume
                const cp = loadState()._checkpoint;
                let resumeFrom = 0;
                if (cp && cp.csvPath === csvPath && cp.project === project_name && cp.csvLength === tests.length) {
                    const age = Date.now() - new Date(cp.ts).getTime();
                    if (age < 86400000 && cp.done.length < tests.length) {
                        const ans = confirm(
                            cp.done.length + '/' + tests.length + ' testes ja criados. Continuar?',
                            true
                        );
                        if (ans) {
                            resumeFrom = cp.done.length;
                            inMemoryTasksId = cp.done.map(d => d.key);
                            inMemoryTasksText = cp.done.map(d => d.title);
                            info('Retomando do teste ' + (resumeFrom + 1) + '...');
                        }
                    }
                }

                // CSV pre-validation
                if (resumeFrom === 0) {
                    const { errors, warnings } = validateCsvTests(tests);
                    if (warnings.length > 0) {
                        warn('Avisos no CSV (' + warnings.length + '):');
                        warnings.slice(0, 5).forEach(w => warn('  ' + w));
                        if (warnings.length > 5) warn('  ... e mais ' + (warnings.length - 5) + ' aviso(s)');
                    }
                    if (errors.length > 0) {
                        error('Erros no CSV (' + errors.length + '):');
                        errors.forEach(e => error('  ' + e));
                        warn('Corrija o CSV antes de importar.');
                        continue;
                    }
                }

                const batchLog = opLog.child({ operation: 'csv-import', csvPath });

                const totalSteps = tests.reduce((sum, t) => sum + t.steps.length, 0);
                const groupsCount = new Set(tests.map(t => t.group).filter(Boolean)).size;

                title('Preview dos testes a serem criados');
                tests.forEach((test, i) => {
                    const desc = test.description ? ' — ' + test.description.substring(0, 60) : '';
                    const pre = test.precondition ? ' [pre: ' + test.precondition.value.substring(0, 30) + ']' : '';
                    const links = test.linkedIssues?.length ? ' [' + test.linkedIssues.length + ' link(s)]' : '';
                    const group = test.group ? ' [grupo: ' + test.group + ']' : '';
                    const stepsInfo = test.steps.length + ' step(s)';
                    const firstStep = test.steps[0]?.fields?.Action?.substring(0, 30) || '';
                    const lastStep = test.steps.length > 1
                        ? test.steps[test.steps.length - 1]?.fields?.Action?.substring(0, 30) || ''
                        : '';
                    const stepPreview = ' [' + stepsInfo + ': "' + firstStep + '"...' +
                        (lastStep && lastStep !== firstStep ? ' "' + lastStep + '"' : '') + ']';
                    console.log('  ' + (i + 1) + '. ' + test.title + desc + pre + links + group + stepPreview);
                });
                divider();

                if (jiraLabels.length > 0) {
                    info('Labels: ' + jiraLabels.join(', '));
                }
                info('Total: ' + tests.length + ' teste(s), ' + totalSteps + ' step(s)' +
                    (groupsCount > 0 ? ', ' + groupsCount + ' grupo(s)' : ''));

                // CSV filter
                if (process.env.AUTO_CONFIRM !== 'true') {
                    const filterText = prompt('Filtrar testes por titulo? (Enter para todos)');
                    if (filterText.trim()) {
                        const filtered = tests.filter(t =>
                            t.title.toLowerCase().includes(filterText.trim().toLowerCase())
                        );
                        if (filtered.length === 0) {
                            warn('Nenhum teste corresponde a "' + filterText.trim() + '".');
                            continue;
                        }
                        info(filtered.length + '/' + tests.length + ' testes correspondem a "' + filterText.trim() + '"');
                        if (!confirm('Criar apenas estes ' + filtered.length + ' testes?')) {
                            warn('Operacao cancelada.');
                            continue;
                        }
                        tests = filtered;
                    }
                }

                if (process.env.AUTO_CONFIRM !== 'true' && !confirm('Criar estes testes no Jira?')) {
                    warn('Operacao cancelada.');
                    continue;
                }

                batchLog.info('Iniciando criacao de ' + tests.length + ' teste(s)');

                const results = [];
                const testDurations = [];
                let testStart = Date.now();
                isBusy = true;
                const testBar = !isQuiet() ? new ProgressBar(tests.length, { width: 20 }) : null;

                outer: for (let t = resumeFrom; t < tests.length; t++) {
                    const test = tests[t];
                    const testTitle = test.title;
                    const validSteps = test.steps;
                    if (testBar) testBar.update(t + 1);

                    let description = test.description || '';
                    if (test.precondition && test.precondition.type === 'inline') {
                        description += (description ? '\n\n' : '') + 'Pre-condition: ' + test.precondition.value;
                    }

                    const testLog = batchLog.child({ test: t + 1, title: testTitle });
                    if (!isQuiet()) info('Criando: ' + testTitle);

                    inMemoryTasksText.push(testTitle);

                    const testData = {
                        fields: {
                            project: { key: project_name },
                            summary: testTitle,
                            description,
                            issuetype: { name: 'Test' }
                        }
                    };

                    if (jiraLabels.length > 0) {
                        testData.fields.labels = jiraLabels;
                    }

                    let createdTestIssue;
                    try {
                        createdTestIssue = await jiraResource.postJiraResource('issue', testData);
                        if (!isQuiet()) success('Issue criada: ' + createdTestIssue.key);
                        testLog.info('Issue criada', { key: createdTestIssue.key });
                    } catch (err) {
                        const action = await onError(
                            '[' + (t + 1) + '/' + tests.length + '] Criar issue "' + testTitle + '"',
                            err,
                            { retry: true, details: true }
                        );
                        results.push({ status: 'error', label: testTitle, message: 'Falha na criacao da issue' });
                        if (action === 'abort') {
                            batchLog.warn('Usuario abortou apos falha na criacao da issue');
                            break outer;
                        }
                        if (action === 'retry') {
                            results.pop();
                            t--;
                            continue;
                        }
                        continue;
                    }

                    inMemoryTasksId.push(createdTestIssue.key);

                    // Save checkpoint
                    update(state => {
                        if (!state._checkpoint) state._checkpoint = {};
                        state._checkpoint.csvPath = csvPath;
                        state._checkpoint.project = project_name;
                        state._checkpoint.ts = new Date().toISOString();
                        state._checkpoint.csvLength = tests.length;
                        state._checkpoint.done = inMemoryTasksId.map((key, idx) => ({
                            key,
                            title: inMemoryTasksText[idx]
                        }));
                    });

                    const testReport = { status: 'ok', label: testTitle, message: '' };
                    const testErrors = [];

                    if (test.precondition && test.precondition.type === 'reference') {
                        try {
                            await linkManagerXray.associatePrecondition(createdTestIssue.key, test.precondition.value);
                            if (!isQuiet()) success('  Pre-condition ' + test.precondition.value + ' associada');
                        } catch (err) {
                            testErrors.push('Falha ao associar pre-condition');
                            const action = await onError(
                                '  Pre-condition de "' + testTitle + '"',
                                err,
                                { details: true }
                            );
                            if (action === 'abort') {
                                batchLog.warn('Usuario abortou apos falha na pre-condition');
                                testReport.status = 'error';
                                testReport.message = testErrors.join('; ');
                                results.push(testReport);
                                break outer;
                            }
                        }
                    }

                    let abortSteps = false;
                    const stepBar = !isQuiet() ? new ProgressBar(validSteps.length, { width: 15 }) : null;
                    for (let i = 0; i < validSteps.length; i++) {
                        const step = validSteps[i];
                        try {
                            await jiraResourceXray.postJiraResource('test/' + createdTestIssue.key + '/steps', step);
                            if (stepBar) stepBar.update(i + 1);
                        } catch (err) {
                            testErrors.push('Falha no step ' + (i + 1) + ': ' + step.fields.Action);
                            const action = await onError(
                                '  Step ' + (i + 1) + ' de "' + testTitle + '"',
                                err,
                                { details: true }
                            );
                            if (action === 'abort') {
                                abortSteps = true;
                                break;
                            }
                        }
                    }
                    if (stepBar) stepBar.stop();
                    if (abortSteps) {
                        batchLog.warn('Usuario abortou apos falha no step');
                        testReport.status = 'error';
                        testReport.message = testErrors.join('; ');
                        results.push(testReport);
                        break outer;
                    }

                    if (testErrors.length > 0) {
                        warn('Issue ' + createdTestIssue.key + ' criada com ' + testErrors.length + ' erro(s)');
                        testErrors.forEach(e => warn('  ' + e));
                        testReport.status = 'error';
                        testReport.message = testErrors.length + ' step(s) falharam';
                    }

                    if (test.linkedIssues && test.linkedIssues.length > 0) {
                        try {
                            await linkManager.linkIssues(createdTestIssue.key, test.linkedIssues);
                            if (!isQuiet()) success('  ' + test.linkedIssues.length + ' linked issue(s) criados');
                        } catch (err) {
                            testErrors.push('Falha ao criar linked issues');
                            const action = await onError(
                                '  Linked issues de "' + testTitle + '"',
                                err,
                                { details: true }
                            );
                            if (action === 'abort') {
                                testReport.status = 'error';
                                testReport.message = testErrors.join('; ');
                                results.push(testReport);
                                break outer;
                            }
                        }
                    }

                    if (!isQuiet()) console.log('  -> ' + base_url + '/browse/' + createdTestIssue.key);
                    results.push(testReport);

                    testDurations.push(Date.now() - testStart);
                    testStart = Date.now();
                }

                if (testBar) testBar.stop();

                // Clear checkpoint on success
                if (results.filter(r => r.status === 'ok').length === tests.length) {
                    update(state => { delete state._checkpoint; });
                }

                if (tests.some(t => t.group) && results.length > 0) {
                    info('Atualizando descricoes com cross-references...');
                    await updateCrossReferences(jiraResource, tests, inMemoryTasksId);
                }

                printSummary(results);
                lastOperation = results.filter(r => r.status === 'ok').length + '/' + tests.length + ' testes criados';
                pushHistory('csv-import', lastOperation,
                    results.some(r => r.status === 'error') ? 'error' : 'ok');
                batchLog.info('Operacao concluida', {
                    passed: results.filter(r => r.status === 'ok').length,
                    failed: results.filter(r => r.status === 'error').length,
                    total: tests.length
                });

                save(state => {
                    state.lastLabels = jiraLabels.join(',');
                    state.lastCsvPath = csvPath;
                    state.lastProject = project_name;
                });

                isBusy = false;
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
                await jiraResource.createVersion(project_name, name, desc);
                pushHistory('criar-versao', name, 'ok');
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

                isBusy = true;
                const results = [];
                for (const taskId of taskIds) {
                    try {
                        await jiraResource.updateFixVersions([taskId], project_name, version);
                        results.push({ status: 'ok', label: taskId, message: '' });
                    } catch (err) {
                        results.push({ status: 'error', label: taskId, message: 'Falha ao atualizar fixVersion' });
                    }
                }
                printSummary(results);
                lastOperation = results.filter(r => r.status === 'ok').length + '/' + taskIds.length + ' tarefas atualizadas';
                pushHistory('atribuir-fixversion', lastOperation,
                    results.some(r => r.status === 'error') ? 'error' : 'ok');

                if (confirm('Adicionar tarefas a uma sprint?')) {
                    const sprintId = prompt('ID da sprint', { hint: 'ex: 6991 (encontrado na URL do board)' });
                    const agileResource = new JiraResource(personal_token, base_url + '/rest/agile/1.0');
                    await agileResource.addTasksToSprint(taskIds, sprintId);
                }
                isBusy = false;
                break;
            }

            case '5': {
                if (!packageManager) {
                    const dir = smartPrompt('Diretorio do projeto git', { default: process.cwd() }, () => showHelp('version'));
                    packageManager = new PackageVersionManager(dir);
                    git_directory = dir;
                }
                const version = smartPrompt('Nome da versao', { hint: 'ex: v2.7.0' }, () => showHelp('version'));
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
                break;
            }

            case '6': {
                const version = smartPrompt('Nome da versao', {}, () => showHelp('version'));
                await jiraResource.checkReleaseTasksStatus(project_name, version);
                pushHistory('verificar-status', version, 'ok');
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
                const taskIds = tasks.map(task => task.match(/\[(.*?)\]/)?.[1]).filter(Boolean);
                if (taskIds.length === 0) {
                    warn('Nenhuma tarefa encontrada.');
                    continue;
                }
                info('Fechando ' + taskIds.length + ' tarefa(s)...');
                isBusy = true;
                try {
                    await jiraResource.moveCardsToDone(taskIds);
                    const summary = taskIds.map(id => ({ status: 'ok', label: id, message: '' }));
                    printSummary(summary);
                    pushHistory('fechar-tarefas', taskIds.length + ' tarefa(s)', 'ok');
                } catch (err) {
                    const summary = taskIds.map(id => ({ status: 'error', label: id, message: 'Falha ao fechar tarefa' }));
                    printSummary(summary);
                    pushHistory('fechar-tarefas', 'erro', 'error');
                }
                lastOperation = taskIds.length + ' tarefa(s) fechadas';
                isBusy = false;
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
                    printSummary([{ status: 'ok', label: 'Versao ' + version, message: 'Publicada com sucesso' }]);
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
                save(state => { state.lastProject = project_name; });
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
                printSummary(results);
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
                warn('Opcao invalida. Escolha entre 0-11, alias ou digite /help.');
        }

        const longOps = ['1', '4', '5', '7', '8'];
        const hasResults = typeof results !== 'undefined' && results && results.some(r => r.status === 'error');
        if (process.env.AUTO_CONFIRM !== 'true' && choice !== '0' && longOps.includes(choice) && hasResults) {
            prompt('Pressione Enter para continuar');
        }
    }
}

main();
