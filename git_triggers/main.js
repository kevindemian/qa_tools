// @ts-check
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const { print, success, error, warn, info, title, divider, prompt, confirm, printError, printSummary, withSpinner, showSelect, tableView } = require('../shared/prompt');
const { load: loadState, update: updateState } = require('../shared/state');
const { createValidateEnv, setupSigint, printSessionSummary: sharedPrintSessionSummary } = require('../shared/cli_base');
const GitLabManager = require('./gitlab_manager');
const GitHubManager = require('./github_manager');
const { nivelarBranches } = require('./nivelar');
const { rootLogger } = require('../shared/logger');
const { sleep } = require('../shared/http-client');
const glob = require('glob');
const JiraResource = require('../jira_management/jira_resource');
const JiraLinkManager = require('../jira_management/jira_link_manager');
const { parseMochawesome } = require('../shared/result_parser');
const { matchResultsToTests, createTestExecutionFromResults } = require('../jira_management/result_reporter');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let projectId;
/** @type {string} */
let apiToken = /** @type {string} */ (process.env.GIT_TOKEN);
/** @type {string} */
let gitlabBaseUrl = /** @type {string} */ (process.env.GIT_BASE_URL);
/** @type {'gitlab'|'github'} */
let currentProvider = 'gitlab';
let isBusy = false;

const sessionLog = rootLogger.child({ session: 'gitlab' });
const sessionContext = new (require('../shared/session-context').SessionContext)();

/** @type {import('../shared/types').GitProvider|null} */
let manager = null;

const PROVIDERS_PATH = path.resolve(__dirname, '../config/providers.json');
let providersConfig = {};
try {
    providersConfig = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf8'));
} catch (err) {
    rootLogger.warn('Falha ao carregar providers.json. Usando GitLab como padrao.');
}

/** @returns {'gitlab'|'github'} */
function getProviderForProject(projectName) {
    const cfg = providersConfig[projectName];
    return /** @type {'gitlab'|'github'} */ ((cfg && cfg.provider) || 'gitlab');
}

/** @returns {import('../shared/types').GitProvider} */
function createManagerForProject(projectName, id) {
    const provider = getProviderForProject(projectName);
    currentProvider = provider;
    if (provider === 'github') {
        const cfg = providersConfig[projectName];
        const repo = (cfg && cfg.repo) || id;
        const ghToken = process.env.GITHUB_TOKEN || process.env.GIT_TOKEN || '';
        const ghApiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
        return new GitHubManager(repo, ghToken, ghApiUrl);
    }
    return new GitLabManager(id, apiToken, gitlabBaseUrl);
}

function pushHistory(op, detail, status) {
    sessionContext.pushHistory(op, detail, status);
    updateState(state => {
        if (!state.history) state.history = [];
        state.history.push({ op, detail, status, ts: new Date().toISOString() });
        if (state.history.length > 50) state.history = state.history.slice(-50);
    });
}

const validateEnv = createValidateEnv([
    { key: 'GIT_TOKEN', label: 'GIT_TOKEN (token de autenticacao GitLab)', example: 'GIT_TOKEN=seu-token-aqui' },
    { key: 'GIT_BASE_URL', label: 'GIT_BASE_URL (URL base do GitLab)', example: 'GIT_BASE_URL=https://gitlab.seusite.com' },
    { key: 'GITHUB_TOKEN', label: 'GITHUB_TOKEN (token GitHub, opcional se usar GitHub)', example: 'GITHUB_TOKEN=seu-token-github' },
]);

function printSessionSummary() {
    sharedPrintSessionSummary(sessionContext.sessionCounters, sessionContext.lastOperation);
}

async function nivelarBranchesWrapper(gitlab) {
    await nivelarBranches(gitlab, { pushHistory });
}

function isComplete(status) {
    return ['success', 'failed', 'canceled', 'skipped'].includes(status);
}

async function pollPipeline(m, pipelineId, interval = 5000, timeout = 300000) {
    const start = Date.now();
    let lastLog = 0;
    let aborted = false;
    while (Date.now() - start < timeout && !aborted) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        if (elapsed - lastLog >= 15) {
            lastLog = elapsed;
            info('Aguardando pipeline #' + pipelineId + ' (' + elapsed + 's)...');
        }
        const p = await m.getPipeline(pipelineId);
        if (aborted || !p) { await sleep(interval); if (aborted) break; continue; }
        const status = p.status || p.state || '';
        if (isComplete(status)) {
            return { status, web_url: p.web_url || '' };
        }
        await sleep(interval);
        if (aborted) break;
    }
    return { status: 'timeout', web_url: '' };
}

setupSigint(() => isBusy, () => printSessionSummary());

const projectsPath = path.resolve(__dirname, '../config/projects.json');
let projects;
try {
    projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));
    for (const key of Object.keys(projects)) {
        const envKey = 'PROJECT_ID_' + key.toUpperCase();
        if (process.env[envKey]) {
            projects[key] = process.env[envKey];
        }
    }
} catch (err) {
    rootLogger.error(
        `Falha ao carregar configuração de projetos de "${projectsPath}": ${err.message}`,
        { configPath: projectsPath }
    );
    error(`Configuração inválida em "${projectsPath}". Verifique o JSON.`);
    process.exitCode = 1;
}

function displayProjects() {
    title('Projetos');
    const names = Object.keys(projects);
    names.forEach((name, i) => {
        const p = getProviderForProject(name);
        const tag = p === 'github' ? ' [GH]' : ' [GL]';
        print('  ' + (i + 1) + '  ' + name + tag);
    });
    print('  ' + (names.length + 1) + '  Sair');
}

function _jiraEnv() {
    const base = process.env.JIRA_BASE_URL;
    const token = process.env.JIRA_PERSONAL_TOKEN;
    const xray = process.env.XRAY_BASE_URL;
    if (!base || !token || !xray) return null;
    return { base, token, xray };
}

async function collectTestResults(m, pipelineId, branch, projectName) {
    const jira = _jiraEnv();
    if (!jira) {
        warn('Variaveis JIRA nao configuradas. Defina JIRA_BASE_URL, JIRA_PERSONAL_TOKEN e XRAY_BASE_URL.');
        return;
    }

    const artifacts = await withSpinner('Buscando artifacts...', () => m.listPipelineArtifacts(pipelineId));

    if (!Array.isArray(artifacts) || artifacts.length === 0) {
        warn('Nenhum artifact encontrado na pipeline #' + pipelineId);
        return;
    }
    const art = artifacts.find(a => /mochawesome|test-result/i.test(a.name)) || artifacts[0];
    info('Artifact: ' + art.name + ' (id=' + art.id + ')');

    let buffer;
    try {
        buffer = await withSpinner('Baixando artifact...', async () => {
            const dl = await m.downloadArtifact(art.id);
            return dl.buffer;
        });
    } catch (err) {
        printError('Falha ao baixar artifact', err);
        return;
    }

    let jsonData;
    try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();
        const mochaEntry = entries.find(e => e.entryName.includes('mochawesome.json') && !e.isDirectory);
        if (!mochaEntry) {
            warn('mochawesome.json nao encontrado no artifact. Entradas: ' + entries.map(e => e.entryName).join(', '));
            return;
        }
        const raw = mochaEntry.getData().toString('utf8');
        jsonData = JSON.parse(raw);
    } catch (err) {
        printError('Falha ao ler mochawesome.json', err);
        return;
    }

    const parsed = parseMochawesome(jsonData);
    info('Resultados: ' + parsed.stats.passed + ' pass, ' + parsed.stats.failed + ' fail, ' + parsed.stats.skipped + ' skip');
    if (parsed.tests.length === 0) {
        warn('Nenhum teste encontrado no report.');
        return;
    }

    const cypressDir = process.env.CYPRESS_PROJECT_PATH || loadState().lastCypressPath || '';
    const defaultMapping = cypressDir ? path.join(path.resolve(cypressDir), '*jira-mapping.json') : '';
    const mappingPath = prompt('Caminho do mapping JSON', { default: defaultMapping });
    if (!mappingPath.trim()) {
        warn('Mapping necessario para criar Test Execution.');
        return;
    }

    const resolvedPath = mappingPath.includes('*')
        ? _resolveGlob(mappingPath) || mappingPath
        : mappingPath;

    const { matched, unmatched, stats } = matchResultsToTests(parsed.tests, resolvedPath);
    if (matched.length === 0) {
        warn('Nenhum teste pode ser mapeado. Mapping: ' + resolvedPath);
        return;
    }
    info('Mapeados: ' + matched.length + '/' + parsed.tests.length + ' testes');
    if (unmatched.length > 0) {
        warn(unmatched.length + ' teste(s) nao encontrados no mapping');
        unmatched.slice(0, 3).forEach(u => warn('  - ' + u.title));
    }

    const csvName = resolvedPath.replace(/-jira-mapping\.json$/, '').split(/[/\\]/).pop() || 'pipeline';

    try {
        const te = await withSpinner('Criando Test Execution no Jira...', async () => {
            const jiraRes = new JiraResource(jira.token, jira.base + '/rest/api/2');
            const linkJiraRes = new JiraResource(jira.token, jira.base + '/rest/api/2');
            const linkMgr = new JiraLinkManager(linkJiraRes);
            return await createTestExecutionFromResults(jiraRes, linkMgr, projectName, matched, csvName, { pipelineId, branch, provider: currentProvider });
        });
        success('Test Execution criado: ' + jira.base + '/browse/' + te.key);
        success(te.passed + ' passed / ' + te.failed + ' failed / ' + te.skipped + ' skipped');
        pushHistory('resultados', te.key + ': ' + te.passed + '/' + te.failed, 'ok');
    } catch (err) {
        printError('Falha ao criar Test Execution', err);
        pushHistory('resultados', 'erro', 'error');
    }
}

function _resolveGlob(pattern) {
    try {
        const matches = glob.sync(pattern);
        return matches.length > 0 ? path.resolve(matches[0]) : null;
    } catch (e) {
        return null;
    }
}

function providerLabel() {
    return currentProvider === 'github' ? 'GitHub' : 'GitLab';
}

function displayActions() {
    title(providerLabel().toUpperCase() + ' TOOLS' + sessionContext.buildContextLine());
    if (sessionContext.lastOperation) info('Última operação: ' + sessionContext.lastOperation);
    divider();
    print('  PIPELINES');
    print('   1  Disparar pipeline');
    if (currentProvider === 'gitlab') {
        print('   2  Listar schedules');
        print('   3  Disparar schedule');
    }
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    print('');
    print('  ' + prLabel + 's');
    print('   4  Criar ' + prLabel);
    print('   5  Listar ' + prLabel + 's aprovados');
    print('   6  Fazer merge por ID');
    print('   7  Nivelar branches (main -> rel_cand -> dev)');
    print('');
    print('  UTILITARIOS');
    print('   8  Exportar variaveis CI/CD');
    print('   9  Trocar de projeto');
    print('');
    const ok = sessionContext.sessionCounters.filter(c => c.status === 'ok').length;
    const er = sessionContext.sessionCounters.filter(c => c.status === 'error').length;
    if (ok > 0 || er > 0) {
        print('  ' + ok + ' ok' + (er > 0 ? ' · ' + er + ' erro' : ''));
    }
    print('   0  Sair');
    print('  /h  Ajuda');
    divider();
}

function buildContextLine() {
    return providerLabel().toUpperCase() + ' TOOLS' + sessionContext.buildContextLine();
}

/** @returns {Array<any>} */
function buildActionChoices() {
    const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
    const choices = [
        { type: 'separator', line: ' PIPELINES' },
        { name: '1  Disparar pipeline', value: '1' },
    ];
    if (currentProvider === 'gitlab') {
        choices.push(
            { name: '2  Listar schedules', value: '2' },
            { name: '3  Disparar schedule', value: '3' },
        );
    }
    choices.push(
        { type: 'separator', line: ' ' + prLabel + 'S' },
        { name: '4  Criar ' + prLabel, value: '4' },
        { name: '5  Listar ' + prLabel + 's aprovados', value: '5' },
        { name: '6  Fazer merge por ID', value: '6' },
        { name: '7  Nivelar branches', value: '7' },
        { type: 'separator', line: ' UTILITARIOS' },
        { name: '8  Exportar variaveis CI/CD', value: '8' },
        { name: '9  Trocar de projeto', value: '9' },
        { type: 'separator', line: '' },
        { name: '0  Sair', value: '0' },
        { type: 'separator', line: '' },
        { name: '/help  Ajuda', value: '/help' },
        { name: '/history  Historico', value: '/history' },
    );
    return choices;
}

async function displayRecentPipelines(m) {
    try {
        const pipelines = await m.getRecentPipelines(5);
        if (pipelines && pipelines.length > 0) {
            print('  Últimas pipelines:');
            pipelines.slice(0, 3).forEach(p => {
                const id = p.id || p.run_number || '?';
                const ref = p.ref || (p.head_branch || '');
                const s = p.status || p.conclusion || '?';
                const icon = s === 'success' ? '\u2713' : (s === 'failed' ? '\u2717' : '~');
                print('    #' + id + ' ' + ref + ' — ' + icon + ' ' + s);
            });
            print('');
        }
    } catch (err) {
        // non-critical
    }
}

async function main() {
    if (!projects) {
        process.exitCode = 1;
        return;
    }
    validateEnv();
    sessionLog.info('Sessão iniciada');

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
        : parseInt(firstChoice, 10);
    if (isNaN(firstIdx) || firstIdx < 1 || firstIdx > names.length) {
        error('Projeto inválido.');
        process.exitCode = 1;
        return;
    }
    const projectName = names[firstIdx - 1];
    projectId = projects[projectName];
    updateState(s => { s.lastProject = projectName; });
    success('Projeto selecionado: ' + projectName + ' (' + getProviderForProject(projectName) + ')');

    manager = createManagerForProject(projectName, projectId);
    const m = /** @type {import('../shared/types').GitProvider} */ (manager);
    let currentBranch = '';

    await displayRecentPipelines(m);

    const stateHint = loadState().lastChoice && loadState().lastChoice !== '0'
        ? 'Enter = ' + loadState().lastChoice : '0-9';

    while (true) {
        let finalChoice;
        if (process.stdout.isTTY && process.env.QUIET !== 'true') {
            const ctx = buildContextLine();
            print('== ' + ctx + ' ==');
            divider();
            const stateHint2 = loadState().lastChoice && loadState().lastChoice !== '0'
                ? loadState().lastChoice : undefined;
            finalChoice = await showSelect('Escolha uma opção', buildActionChoices(), {
                default: stateHint2,
            });
        } else {
            displayActions();
            const choice = prompt('Escolha uma opção', { hint: stateHint });
            const resolved = !choice.trim() && loadState().lastChoice && loadState().lastChoice !== '0'
                ? loadState().lastChoice : choice;
            if (resolved !== choice) info('Repetindo última opção: ' + resolved);
            finalChoice = resolved;
        }

        updateState(s => { s.lastChoice = finalChoice; });

        const cmd = finalChoice.trim().toLowerCase();
        if (cmd === '/h' || cmd === '/help') {
            title('Ajuda — Git Tools');
            info('Opcoes disponiveis no menu numerado acima.');
            info('/history - Exibe historico de operacoes da sessão.');
            divider();
            continue;
        }
        if (cmd === '/history') {
            const history = loadState().history || [];
            title('Historico de operacoes');
            const last10 = history.slice(-10);
            if (last10.length === 0) {
                warn('Nenhuma operação registrada.');
            } else {
                tableView(last10, ['ts', 'op', 'detail', 'status']);
            }
            divider();
            continue;
        }

        switch (finalChoice) {
            case '1': {
                currentBranch = prompt('Branch para disparar pipeline');
                /** @type {{ ref: string, variables: {key:string, value:string}[], workflow_id?: string }} */
                const payload = { ref: currentBranch, variables: [] };

                if (currentProvider === 'github') {
                    const wfId = prompt('Workflow ID (deixe vazio para auto-detectar)');
                    if (wfId.trim()) payload.workflow_id = wfId.trim();
                }

                const addVars = confirm('Adicionar variaveis?');
                if (addVars) {
                    const varsInput = prompt('Variaveis (chave=valor separadas por virgula)');
                    varsInput.split(',').forEach(v => {
                        const [key, ...rest] = v.trim().split('=');
                        if (key) payload.variables.push({ key, value: rest.join('=') });
                    });
                }

                title('Preview');
                print('  Projeto: ' + projectName);
                print('  Branch: ' + currentBranch);
                print('  Variaveis: ' + payload.variables.length);
                if (!confirm('Confirmar disparo de pipeline?')) {
                    warn('Operação cancelada.');
                    continue;
                }

                /** @type {any} */
                let pipelineResult = null;
                try {
                    pipelineResult = await withSpinner('Disparando pipeline em ' + currentBranch + '...', () => m.triggerPipeline(payload));
                    if (pipelineResult) { success('Pipeline disparado: ' + pipelineResult.web_url); pushHistory('pipeline', currentBranch, 'ok'); }
                } catch (err) {
                    printError('Falha ao disparar pipeline', err); pushHistory('pipeline', currentBranch, 'error');
                    break;
                }

                if (pipelineResult && confirm('Aguardar conclusao da pipeline?', true)) {
                    const id = pipelineResult.id || pipelineResult.run_number || '';
                    if (id) {
                        isBusy = true;
                        info('Aguardando pipeline #' + id + '...');
                        const pollResult = await pollPipeline(m, id);
                        isBusy = false;
                        const icon = pollResult.status === 'success' ? '\u2713' : '\u2717';
                        info('Pipeline #' + id + ': ' + icon + ' ' + pollResult.status);

                        if (pollResult.status !== 'canceled' && pollResult.status !== 'skipped'
                            && confirm('Coletar resultados para Jira?', false)) {
                            await collectTestResults(m, id, currentBranch, projectName);
                        }

                        if (pollResult.status === 'success' && confirm('Criar merge request de ' + currentBranch + ' para?', false)) {
                            const target = prompt('Branch de destino', { default: 'main' });
                            const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
                            const mrTitle = prompt('Titulo do ' + prLabel, { default: 'chore: merge ' + currentBranch + ' -> ' + target });
                            try {
                                const mr = await withSpinner('Criando ' + prLabel + ' ' + currentBranch + ' -> ' + target + '...', () => m.createMergeRequest(currentBranch, target, mrTitle, ''));
                                if (mr) {
                                    success(prLabel + ' criado: ' + mr.web_url);
                                    pushHistory('quick-mr', currentBranch + '->' + target, 'ok');

                                    if (confirm('Fazer merge de ' + currentBranch + ' em ' + target + ' agora?', false)) {
                                        try {
                                            const mergeResult = await withSpinner('Fazendo merge de ' + prLabel + ' #' + mr.iid + '...', () => m.acceptMergeRequest(mr.iid));
                                            if (mergeResult) {
                                                success('Merge realizado: ' + mergeResult.web_url);
                                                pushHistory('quick-merge', mr.iid, 'ok');
                                            }
                                        } catch (err) {
                                            printError('Falha ao fazer merge', err);
                                            pushHistory('quick-merge', mr.iid, 'error');
                                        }
                                    }
                                }
                            } catch (err) {
                                printError('Falha ao criar ' + prLabel, err);
                                pushHistory('quick-mr', currentBranch + '->' + target, 'error');
                            }
                        }
                    }
                }

                await displayRecentPipelines(m);
                break;
            }

            case '2': {
                if (currentProvider !== 'gitlab') {
                    warn('Opção nao disponivel para GitHub.');
                    continue;
                }
                try {
                    const schedules = await withSpinner('Buscando schedules...', () => m.getSchedules());
                    if (schedules && schedules.length > 0) {
                        info('Schedules encontrados:');
                        schedules.forEach(s => {
                            print('  ID: ' + s.id + '  ' + (s.description || 'sem descrição') + '  (proxima execução: ' + (s.next_run_at || 'N/A') + ')');
                        });
                        pushHistory('list-schedules', schedules.length + ' schedules', 'ok');
                    } else {
                        warn('Nenhum schedule encontrado.');
                        pushHistory('list-schedules', 'vazio', 'ok');
                    }
                } catch (err) {
                    printError('Erro ao listar schedules', err); pushHistory('list-schedules', 'erro', 'error');
                }
                break;
            }

            case '3': {
                if (currentProvider !== 'gitlab') {
                    warn('Opção nao disponivel para GitHub.');
                    continue;
                }
                const scheduleId = prompt('ID do schedule');
                try {
                    const result = await withSpinner('Disparando schedule ' + scheduleId + '...', () => m.runSchedule(scheduleId));
                    if (result) { success('Schedule disparado: ' + scheduleId); pushHistory('schedule-run', scheduleId, 'ok'); }
                } catch (err) {
                    printError('Erro ao disparar schedule', err); pushHistory('schedule-run', scheduleId, 'error');
                }
                break;
            }

            case '4': {
                const sourceBranch = prompt('Branch de origem');
                const targetBranch = prompt('Branch de destino');
                const mrTitle = prompt('Titulo do ' + (currentProvider === 'github' ? 'PR' : 'MR'));
                const description = prompt('Descrição');
                const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
                try {
                    const result = await withSpinner('Criando ' + prLabel + ' ' + sourceBranch + ' -> ' + targetBranch + '...', () => m.createMergeRequest(sourceBranch, targetBranch, mrTitle, description));
                    if (result) {
                        success(prLabel + ' criado: ' + result.web_url); pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'ok');
                    }
                } catch (err) {
                    printError('Falha ao criar ' + prLabel, err); pushHistory('pr-create', sourceBranch + '->' + targetBranch, 'error');
                }
                break;
            }

            case '5': {
                const status = prompt('Status dos ' + (currentProvider === 'github' ? 'PRs' : 'MRs'), { default: 'opened' });
                const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
                try {
                    const results = await m.searchMergeRequests('', '', status);
                    const approved = [];
                    for (const r of results) {
                        if (typeof m.isApproved === 'function' && await m.isApproved(r.iid || r.number)) {
                            approved.push(r);
                        }
                    }
                    if (approved.length > 0) {
                        info(prLabel + 's aprovados:');
                        approved.forEach(r => print('  ' + prLabel + ' #' + (r.iid || r.number) + ': ' + r.title));
                        pushHistory('prs-approved', approved.length + ' ' + prLabel + 's', 'ok');
                    } else {
                        warn('Nenhum ' + prLabel + ' aprovado encontrado.');
                        pushHistory('prs-approved', 'vazio', 'ok');
                    }
                } catch (err) {
                    printError('Erro ao listar ' + prLabel + 's aprovados', err); pushHistory('prs-approved', status, 'error');
                }
                break;
            }

            case '6': {
                const iid = prompt('ID do ' + (currentProvider === 'github' ? 'PR' : 'MR') + ' para merge');
                const prLabel = currentProvider === 'github' ? 'PR' : 'MR';
                try {
                    const result = await withSpinner('Fazendo merge de ' + prLabel + ' #' + iid + '...', () => m.acceptMergeRequest(iid));
                    if (result) { success('Merge realizado: ' + result.web_url); pushHistory('pr-merge', iid, 'ok'); }
                } catch (err) {
                    printError('Falha ao fazer merge', err); pushHistory('pr-merge', iid, 'error');
                }
                break;
            }

            case '7':
                await nivelarBranchesWrapper(m);
                break;

            case '8': {
                if (!confirm('Exportar TODAS as variaveis CI/CD (incluindo secrets)?', false)) {
                    warn('Operação cancelada.');
                    break;
                }
                try {
                    const variables = await withSpinner('Buscando variaveis CI/CD...', () => m.getCICDVariables());
                    if (variables) {
                        const envContent = variables.map(v => {
                            const safeValue = (v.value || '').replace(/\n/g, '\\n');
                            if (safeValue.includes('=')) {
                                return v.key + '="' + safeValue.replace(/"/g, '\\"') + '"';
                            }
                            return v.key + '=' + safeValue;
                        }).join('\n');

                        const tmpPath = path.join(os.tmpdir(), 'qa-vars-' + process.pid + '.env');
                        fs.writeFileSync(tmpPath, envContent, { mode: 0o600, encoding: 'utf8' });
                        success('Variaveis exportadas (' + variables.length + '):');
                        print('');
                        print(envContent);
                        print('');
                        warn('As variaveis acima foram exibidas no terminal e NAO foram salvas em disco.');
                        info('Uma copia temporaria foi salva em ' + tmpPath + ' (modo 600, apenas leitura)');
                        info('Ela sera removida ao encerrar esta sessão. Nao compartilhe este arquivo.');
                        fs.unlinkSync(tmpPath);
                        pushHistory('export-vars', variables.length + ' variaveis', 'ok');
                    }
                } catch (err) {
                    printError('Falha ao buscar variaveis CI/CD', err); pushHistory('export-vars', 'erro', 'error');
                }
                break;
            }

            case '9': {
                displayProjects();
                const newChoice = prompt('Escolha um projeto', { hint: '1-' + names.length });
                const newIdx = parseInt(newChoice, 10);
                if (!isNaN(newIdx) && newIdx >= 1 && newIdx <= names.length) {
                    const newName = names[newIdx - 1];
                    projectId = projects[newName];
                    manager = createManagerForProject(newName, projectId);
                    updateState(s => { s.lastProject = newName; });
                    success('Projeto alterado para: ' + newName + ' (' + getProviderForProject(newName) + ')');
                    const newM = /** @type {import('../shared/types').GitProvider} */ (manager);
                    await displayRecentPipelines(newM);
                    pushHistory('trocar-projeto', newName, 'ok');
                } else {
                    warn('Opção invalida.');
                }
                break;
            }

            case '0':
                title('Ate logo!');
                printSessionSummary();
                if (sessionContext.sessionCounters.some(c => c.status === 'error')) process.exitCode = 1;
                return;

            default:
                warn('Opção invalida.');
        }
    }
}

process.on('unhandledRejection', reason => {
    rootLogger.error('Unhandled Rejection', { reason: String(reason) });
    process.exitCode = 1;
});

main().catch(err => {
    printError('Erro inesperado', err);
    printSessionSummary();
    process.exitCode = 1;
});

module.exports = { nivelarBranchesWrapper };
