// @ts-check
const path = require('path');
const fs = require('fs');
const { success, error, warn, info, title, divider, prompt, confirm, printError, printSummary, Spinner } = require('../shared/prompt');
const { load: loadState, update: updateState } = require('../shared/state');
const { createValidateEnv, setupSigint } = require('../shared/cli_base');
const GitLabManager = require('./gitlab_manager');
const { rootLogger } = require('../shared/logger');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let projectId;
let apiToken = process.env.GIT_TOKEN;
let gitlabBaseUrl = process.env.GIT_BASE_URL;

const sessionLog = rootLogger.child({ session: 'gitlab' });
let sessionCounters = [];
let lastOperation = '';

function pushHistory(op, detail, status) {
    sessionCounters.push({ op, detail, status });
    lastOperation = op + ': ' + detail;
}

const validateEnv = createValidateEnv([
    { key: 'GIT_TOKEN', label: 'GIT_TOKEN (token de autenticacao GitLab)', example: 'GIT_TOKEN=seu-token-aqui' },
    { key: 'GIT_BASE_URL', label: 'GIT_BASE_URL (URL base do GitLab)', example: 'GIT_BASE_URL=https://gitlab.seusite.com' },
]);

function printSessionSummary() {
    const logPath = rootLogger.filePath;
    console.log('');
    console.log('='.repeat(50));
    info('Sessao encerrada.');
    const ok = sessionCounters.filter(c => c.status === 'OK').length;
    const er = sessionCounters.filter(c => c.status === 'ERR').length;
    if (ok > 0 || er > 0) {
        if (ok > 0) success(ok + ' operacao(oes) concluida(s)');
        if (er > 0) error(er + ' operacao(oes) com erro');
    }
    if (lastOperation) info('Ultima operacao: ' + lastOperation);
    if (logPath) info('Log: ' + logPath);
    console.log('='.repeat(50));
    rootLogger._writeFile('INFO', 'Sessao encerrada. ' +
        (ok > 0 ? ok + ' ok, ' : '') +
        (er > 0 ? er + ' erro(s), ' : '') +
        'ultima: ' + (lastOperation || 'nenhuma'));
}

setupSigint(null, () => printSessionSummary());

const projectsPath = path.resolve(__dirname, '../config/projects.json');
let projects;
try {
    projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
} catch (err) {
    rootLogger.error(
        `Falha ao carregar configuração de projetos de "${projectsPath}": ${err.message}`,
        { configPath: projectsPath }
    );
    error(`Configuração inválida em "${projectsPath}". Verifique o JSON.`);
    process.exitCode = 1;
}

function displayProjects() {
    title('Projetos GitLab');
    const names = Object.keys(projects);
    names.forEach((name, i) => console.log('  ' + (i + 1) + '  ' + name));
    console.log('  ' + (names.length + 1) + '  Sair');
}

function displayActions() {
    title('GITLAB TOOLS');
    if (lastOperation) info('Ultima operacao: ' + lastOperation);
    divider();
    console.log('  PIPELINES');
    console.log('   1  Disparar pipeline');
    console.log('   2  Listar schedules');
    console.log('   3  Disparar schedule');
    console.log('');
    console.log('  MERGE REQUESTS');
    console.log('   4  Criar merge request');
    console.log('   5  Listar MRs aprovados');
    console.log('   6  Fazer merge por ID');
    console.log('   7  Nivelar branches (main -> rel_cand -> dev)');
    console.log('');
    console.log('  UTILITARIOS');
    console.log('   8  Exportar variaveis CI/CD');
    console.log('   9  Trocar de projeto');
    console.log('');
    console.log('   0  Sair');
    divider();
}

async function main() {
    validateEnv();
    sessionLog.info('Sessao iniciada');

    const state = loadState();
    displayProjects();
    const names = Object.keys(projects);
    const firstDefault = state.lastProject || '';
    const firstChoice = prompt('Escolha um projeto', {
        hint: '1-' + names.length,
        default: firstDefault
    });
    const firstIdx = !firstChoice.trim()
        ? names.indexOf(firstDefault) + 1
        : parseInt(firstChoice);
    if (isNaN(firstIdx) || firstIdx < 1 || firstIdx > names.length) {
        error('Projeto invalido.');
        process.exitCode = 1;
        return;
    }
    const projectName = names[firstIdx - 1];
    projectId = projects[projectName];
    updateState(s => { s.lastProject = projectName; });
    success('Projeto selecionado: ' + projectName);

    const gitlab = new GitLabManager(projectId, apiToken, gitlabBaseUrl);
    let currentBranch = '';

    const stateHint = loadState().lastChoice && loadState().lastChoice !== '0'
        ? 'Enter = ' + loadState().lastChoice : '0-9';

    while (true) {
        displayActions();
        const choice = prompt('Escolha uma opcao', { hint: stateHint });
        const resolved = !choice.trim() && loadState().lastChoice && loadState().lastChoice !== '0'
            ? loadState().lastChoice : choice;
        if (resolved !== choice) info('Repetindo ultima opcao: ' + resolved);
        const finalChoice = resolved;

        updateState(s => { s.lastChoice = finalChoice; });

        switch (finalChoice) {
            case '1': {
                currentBranch = prompt('Branch para disparar pipeline');
                const payload = { ref: currentBranch, variables: [] };

                const addVars = confirm('Adicionar variaveis?');
                if (addVars) {
                    const varsInput = prompt('Variaveis (chave=valor separadas por virgula)');
                    varsInput.split(',').forEach(v => {
                        const [key, ...rest] = v.trim().split('=');
                        if (key) payload.variables.push({ key, value: rest.join('=') });
                    });
                }

                title('Preview');
                console.log('  Projeto: ' + projectName);
                console.log('  Branch: ' + currentBranch);
                console.log('  Variaveis: ' + payload.variables.length);
                if (!confirm('Confirmar disparo de pipeline?')) {
                    warn('Operacao cancelada.');
                    continue;
                }

                try {
                    const spinner = new Spinner();
                    spinner.start('Disparando pipeline em ' + currentBranch);
                    const result = await gitlab.triggerPipeline(payload);
                    spinner.stop();
                    if (result) { success('Pipeline disparado: ' + result.web_url); pushHistory('pipeline', currentBranch, 'OK'); }
                } catch (err) {
                    printError('Falha ao disparar pipeline', err); pushHistory('pipeline', currentBranch, 'ERR');
                }
                break;
            }

            case '2': {
                try {
                    const spinner = new Spinner();
                    spinner.start('Buscando schedules...');
                    const schedules = await gitlab.getSchedules();
                    spinner.stop();
                    if (schedules && schedules.length > 0) {
                        info('Schedules encontrados:');
                        schedules.forEach(s => {
                            console.log('  ID: ' + s.id + '  ' + (s.description || 'sem descricao') + '  (proxima execucao: ' + (s.next_run_at || 'N/A') + ')');
                        });
                        pushHistory('list-schedules', schedules.length + ' schedules', 'OK');
                    } else {
                        warn('Nenhum schedule encontrado.');
                        pushHistory('list-schedules', 'vazio', 'OK');
                    }
                } catch (err) {
                    printError('Erro ao listar schedules', err); pushHistory('list-schedules', 'erro', 'ERR');
                }
                break;
            }

            case '3': {
                const scheduleId = prompt('ID do schedule');
                try {
                    const spinner = new Spinner();
                    spinner.start('Disparando schedule ' + scheduleId + '...');
                    const result = await gitlab.runSchedule(scheduleId);
                    spinner.stop();
                    if (result) { success('Schedule disparado: ' + scheduleId); pushHistory('schedule-run', scheduleId, 'OK'); }
                } catch (err) {
                    printError('Erro ao disparar schedule', err); pushHistory('schedule-run', scheduleId, 'ERR');
                }
                break;
            }

            case '4': {
                const sourceBranch = prompt('Branch de origem');
                const targetBranch = prompt('Branch de destino');
                const mrTitle = prompt('Titulo do MR');
                const description = prompt('Descricao do MR');
                try {
                    const spinner = new Spinner();
                    spinner.start('Criando MR ' + sourceBranch + ' -> ' + targetBranch + '...');
                    const result = await gitlab.createMergeRequest(sourceBranch, targetBranch, mrTitle, description);
                    spinner.stop();
                    if (result) {
                        success('MR criado: ' + result.web_url); pushHistory('mr-create', sourceBranch + '->' + targetBranch, 'OK');
                    }
                } catch (err) {
                    printError('Falha ao criar MR', err); pushHistory('mr-create', sourceBranch + '->' + targetBranch, 'ERR');
                }
                break;
            }

            case '5': {
                const status = prompt('Status dos MRs', { default: 'opened' });
                try {
                    const approved = (await gitlab.searchMergeRequests('', '', status))
                        .filter(mr => mr.approved === true);
                    if (approved.length > 0) {
                        info('MRs aprovados:');
                        approved.forEach(mr => console.log('  MR #' + mr.iid + ': ' + mr.title));
                        pushHistory('mrs-approved', approved.length + ' MRs', 'OK');
                    } else {
                        warn('Nenhum MR aprovado encontrado.');
                        pushHistory('mrs-approved', 'vazio', 'OK');
                    }
                } catch (err) {
                    printError('Erro ao listar MRs aprovados', err); pushHistory('mrs-approved', status, 'ERR');
                }
                break;
            }

            case '6': {
                const iid = prompt('ID do MR para merge');
                try {
                    const spinner = new Spinner();
                    spinner.start('Fazendo merge de MR #' + iid + '...');
                    const result = await gitlab.acceptMergeRequest(iid);
                    spinner.stop();
                    if (result) { success('Merge realizado: ' + result.web_url); pushHistory('mr-merge', iid, 'OK'); }
                } catch (err) {
                    printError('Falha ao fazer merge', err); pushHistory('mr-merge', iid, 'ERR');
                }
                break;
            }

            case '7': {
                const mainBranch = prompt('Branch principal', { default: 'main' });
                const rcBranch = prompt('Branch release candidate', { default: 'rel_cand' });
                const devBranch = prompt('Branch dev', { default: 'dev' });

                try {
                    const spinner = new Spinner();
                    spinner.start('Criando MR ' + mainBranch + ' -> ' + rcBranch + '...');
                    const mr1 = await gitlab.createMergeRequest(
                        mainBranch, rcBranch,
                        'chore: nivelamento ' + mainBranch + ' -> ' + rcBranch,
                        'Nivelamento automatico de branches: ' + mainBranch + ' -> ' + rcBranch
                    );
                    spinner.stop();
                    if (mr1) info('MR criado: ' + mr1.web_url);
                } catch (err) {
                    printError('Falha no nivelamento (primeiro MR)', err); pushHistory('nivelamento', mainBranch + '->' + rcBranch, 'ERR');
                }

                try {
                    const spinner = new Spinner();
                    spinner.start('Criando MR ' + rcBranch + ' -> ' + devBranch + '...');
                    const mr2 = await gitlab.createMergeRequest(
                        rcBranch, devBranch,
                        'chore: nivelamento ' + rcBranch + ' -> ' + devBranch,
                        'Nivelamento automatico de branches: ' + rcBranch + ' -> ' + devBranch
                    );
                    spinner.stop();
                    if (mr2) success('Segundo MR criado: ' + mr2.web_url);
                    pushHistory('nivelamento', mainBranch + '->' + rcBranch + ', ' + rcBranch + '->' + devBranch, 'OK');
                } catch (err) {
                    printError('Falha no nivelamento (segundo MR)', err); pushHistory('nivelamento', rcBranch + '->' + devBranch, 'ERR');
                }
                break;
            }

            case '8': {
                try {
                    const spinner = new Spinner();
                    spinner.start('Buscando variaveis CI/CD...');
                    const variables = await gitlab.getCICDVariables();
                    spinner.stop();
                    if (variables) {
                        const exportPath = path.resolve(__dirname, '../exported_variables.env');
                        const envContent = variables.map(v => v.key + '=' + v.value).join('\n');
                        fs.writeFileSync(exportPath, envContent, 'utf8');
                        console.log(envContent);
                        success('Variaveis exportadas para ' + exportPath);
                        pushHistory('export-vars', variables.length + ' variaveis', 'OK');
                    }
                } catch (err) {
                    printError('Falha ao buscar variaveis CI/CD', err); pushHistory('export-vars', 'erro', 'ERR');
                }
                break;
            }

            case '9': {
                displayProjects();
                const newChoice = prompt('Escolha um projeto', { hint: '1-' + names.length });
                const newIdx = parseInt(newChoice);
                if (!isNaN(newIdx) && newIdx >= 1 && newIdx <= names.length) {
                    const newName = names[newIdx - 1];
                    projectId = projects[newName];
                    gitlab.projectId = projectId;
                    updateState(s => { s.lastProject = newName; });
                    success('Projeto alterado para: ' + newName);
                    pushHistory('trocar-projeto', newName, 'OK');
                } else {
                    warn('Opcao invalida.');
                }
                break;
            }

            case '0':
                title('Ate logo!');
                printSessionSummary();
                if (sessionCounters.some(c => c.status === 'ERR')) process.exitCode = 1;
                return;

            default:
                warn('Opcao invalida.');
        }
    }
}

main();
