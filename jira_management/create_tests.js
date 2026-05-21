// @ts-check
const fs = require('fs');
const path = require('path');
const { success, error, warn, info, title, divider, prompt, confirm, smartPrompt, printError, printSummary, onError, ProgressBar, Spinner, isQuiet } = require('../shared/prompt');
const { rootLogger } = require('../shared/logger');
const { load: loadState, update: updateState } = require('../shared/state');

const csvDefaultPath = process.env.CSV_DEFAULT_PATH || path.join(__dirname, 'test_steps.csv');

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

        await delay(500);

        for (const member of group.members) {
            const others = group.members
                .filter(m => m.id !== member.id)
                .map(m => m.id)
                .join(', ');
            const refText = '\n\nThis test case is part of the set ' + group.name + ': ' + others;

            try {
                const current = await jiraResource.getJiraResource('issue/' + member.id);
                const currentDesc = current?.fields?.description || '';
                if (currentDesc.includes('faz parte do conjunto') || currentDesc.includes('This test case is part of the set')) {
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

async function _createIssue(jiraResource, testData, testTitle, testIdx, totalTests, opLog) {
    try {
        const issue = await jiraResource.postJiraResource('issue', testData);
        if (!isQuiet()) success('Issue criada: ' + issue.key);
        opLog.info('Issue criada', { key: issue.key });
        return { key: issue.key };
    } catch (err) {
        const action = await onError(
            '[' + (testIdx + 1) + '/' + totalTests + '] Criar issue "' + testTitle + '"',
            err,
            { retry: true, details: true }
        );
        return { action };
    }
}

async function _associatePrecondition(linkManager, test, issueKey, opLog) {
    try {
        await linkManager.associatePrecondition(issueKey, test.precondition.value);
        if (!isQuiet()) success('  Pre-condition ' + test.precondition.value + ' associada');
        return null;
    } catch (err) {
        const action = await onError(
            '  Pre-condition de "' + test.title + '"',
            err,
            { details: true }
        );
        return { action };
    }
}

async function _postSteps(jiraResourceXray, issueKey, test, opLog) {
    let abortSteps = false;
    const stepBar = !isQuiet() ? new ProgressBar(test.steps.length, { width: 15 }) : null;
    for (let i = 0; i < test.steps.length; i++) {
        try {
            await jiraResourceXray.postJiraResource('test/' + issueKey + '/steps', { index: i + 1, ...test.steps[i] });
            if (stepBar) stepBar.update(i + 1);
        } catch (err) {
            const action = await onError(
                '  Step ' + (i + 1) + ' de "' + test.title + '"',
                err,
                { details: true }
            );
            if (action === 'abort') { abortSteps = true; break; }
        }
    }
    if (stepBar) stepBar.stop();
    return abortSteps ? { action: 'abort' } : null;
}

async function _linkIssues(linkManager, issueKey, test) {
    try {
        await linkManager.linkIssues(issueKey, test.linkedIssues);
        if (!isQuiet()) success('  ' + test.linkedIssues.length + ' linked issue(s) criados');
        return null;
    } catch (err) {
        return {
            action: await onError(
                '  Linked issues de "' + test.title + '"',
                err,
                { details: true }
            )
        };
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateMappingFiles(sourcePath, project_name, tasksId, tests) {
    const cypressDir = process.env.CYPRESS_PROJECT_PATH || loadState().lastCypressPath;
    if (!cypressDir || !tasksId.length) return;

    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const outDir = path.resolve(cypressDir);

    try {
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
    } catch (err) {
        rootLogger.warn('Nao foi possivel criar diretorio de saida: ' + outDir);
        return;
    }

    const createdTests = tests.slice(0, tasksId.length);
    const mappings = tasksId.map((key, i) => {
        const test = createdTests[i] || {};
        /** @type {{title:string, key:string, description?:string, precondition?:string, steps?:Array<{Action:string, Data:string, ExpectedResult:string}>}} */
        const m = { title: test.title || '', key };
        if (test.description) m.description = test.description;
        if (test.precondition && test.precondition.value) {
            m.precondition = test.precondition.value;
        }
        if (test.steps && test.steps.length > 0) {
            m.steps = test.steps.map(s => ({
                Action: s.fields?.Action || '',
                Data: s.fields?.Data || '',
                ExpectedResult: s.fields?.ExpectedResult || '',
            }));
        }
        return m;
    });

    const jsonPath = path.join(outDir, baseName + '-jira-mapping.json');
    const jsonContent = JSON.stringify({
        project: project_name,
        source: baseName + path.extname(sourcePath),
        csv: baseName + '.csv',
        timestamp: new Date().toISOString(),
        tests: mappings
    }, null, 2);
    fs.writeFileSync(jsonPath, jsonContent, 'utf8');

    const mdPath = path.join(outDir, baseName + '-jira-mapping.md');
    let mdContent = '# Mapeamento Jira: ' + baseName + path.extname(sourcePath) + '\n' +
        '*Gerado em ' + new Date().toLocaleString('pt-BR') + '*\n\n';

    for (const m of mappings) {
        mdContent += '## ' + m.key + ' — ' + m.title + '\n\n';
        if (m.description) mdContent += '**Descrição:** ' + m.description + '\n\n';
        if (m.precondition) mdContent += '**Pre-condition:** ' + m.precondition + '\n\n';
        if (m.steps && m.steps.length > 0) {
            mdContent += '| # | Action | Data | Expected Result |\n';
            mdContent += '|---|--------|------|-----------------|\n';
            m.steps.forEach((s, i) => {
                mdContent += '| ' + (i + 1) + ' | ' + s.Action + ' | ' + s.Data + ' | ' + s.ExpectedResult + ' |\n';
            });
        }
        mdContent += '\n---\n\n';
    }

    fs.writeFileSync(mdPath, mdContent, 'utf8');

    const txtPath = path.join(outDir, baseName + '-summary.txt');
    const txtContent = tasksId.map((key, i) => {
        const test = createdTests[i] || {};
        return key + ': ' + (test.title || '(sem titulo)');
    }).join('\n') + '\n';
    fs.writeFileSync(txtPath, txtContent, 'utf8');

    if (!isQuiet()) {
        info('Mapeamento salvo: ' + path.basename(jsonPath));
        info('Sumario salvo: ' + path.basename(txtPath));
    }
}

async function createTestExecution(jiraResource, project_name, testKeys, csvName, titleOverride) {
    const timestamp = new Date().toLocaleString('pt-BR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
    const summary = titleOverride || (csvName || 'Automated Execution') + ' - ' + timestamp;

    const execLog = rootLogger.child({ operation: 'create-testexec' });
    execLog.info('Descobrindo issue type "Test Execution"...');
    const issueTypes = await jiraResource.getJiraResource('issuetype');
    if (!Array.isArray(issueTypes)) throw new Error('Falha ao obter tipos de issue do Jira');

    const execType = issueTypes.find(t => t.name === 'Test Execution');
    if (!execType) throw new Error(
        'Issue type "Test Execution" nao encontrado. ' +
        'Verifique se o Xray esta instalado e o issue type existe no scheme do projeto.'
    );
    execLog.info('Issue type encontrado: id=' + execType.id);

    execLog.info('Descobrindo custom field para tests...');
    const fields = await jiraResource.getJiraResource('field');
    if (!Array.isArray(fields)) throw new Error('Falha ao obter campos customizados do Jira');

    const testField = fields.find(
        f => f.schema?.custom === 'com.xpandit.plugins.xray:testexec-tests-custom-field'
    );
    if (!testField) throw new Error(
        'Campo "Tests association with a Test Execution" nao encontrado. ' +
        'Verifique se o Xray esta instalado corretamente.'
    );
    execLog.info('Custom field encontrado: ' + testField.id + ' (' + testField.name + ')');

    const payload = {
        fields: {
            project: { key: project_name },
            summary,
            issuetype: { id: execType.id },
            [testField.id]: testKeys
        }
    };

    const created = await jiraResource.postJiraResource('issue', payload);
    success('Test Execution criado: ' + created.key + ' — ' + summary);
    execLog.info('Test Execution criado', { key: created.key, summary });
    return { key: created.key, summary };
}

async function createTestExecutionWithLinks(jiraResource, linkManager, project_name, testKeys, csvName, execOpts) {
    const title = execOpts?.title || '';
    const description = execOpts?.description || '';
    const result = await createTestExecution(jiraResource, project_name, testKeys, csvName, title);

    if (result.key && testKeys.length > 0) {
        try {
            info('Vinculando testes ao Test Execution (link type: Tests)...');
            const linkedKeys = [];
            const keysToLink = [...testKeys];

            try {
                const te = await jiraResource.getJiraResource('issue/' + result.key);
                if (te?.fields?.issuelinks) {
                    for (const link of te.fields.issuelinks) {
                        if (link.outwardIssue?.key && keysToLink.includes(link.outwardIssue.key)) {
                            linkedKeys.push(link.outwardIssue.key);
                        }
                    }
                }
            } catch (err) {
                rootLogger.warn('Nao foi possivel verificar links existentes: ' + err.message);
            }

            const unlinked = keysToLink.filter(k => !linkedKeys.includes(k));
            if (unlinked.length === 0) {
                info('Todos os testes ja estao vinculados ao Test Execution.');
            } else {
                const spinner = !isQuiet() ? new Spinner() : null;
                if (spinner) spinner.start('Linkando ' + unlinked.length + ' teste(s)...');
                let linkCount = 0;
                for (const key of unlinked) {
                    try {
                        await linkManager.createIssueLink(key, result.key, 'Tests');
                        linkCount++;
                    } catch (err) {
                        rootLogger.warn('Falha ao linkar ' + key + ': ' + err.message);
                    }
                }
                if (spinner) spinner.stop();
                if (linkCount > 0) success(linkCount + '/' + unlinked.length + ' testes vinculados.');
            }
        } catch (err) {
            rootLogger.error('Erro ao vincular testes: ' + err.message);
        }
    }

    return result;
}

async function _createTestsFromTestCases({
    tests, jiraResource, jiraResourceXray, linkManager, linkManagerXray,
    project_name, base_url, sessionLog, onBusy,
    sourcePath, sourceType, jiraLabels
}) {
    const cp = loadState()._checkpoint;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    let resumeFrom = 0;
    let inMemoryTasksId = [];
    let inMemoryTasksText = [];
    if (cp && cp[cpKey] === sourcePath && cp.project === project_name && cp.testCount === tests.length && cp.done) {
        const age = Date.now() - new Date(cp.ts ?? '').getTime();
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

    if (resumeFrom === 0) {
        const { errors, warnings } = validateCsvTests(tests);
        if (warnings.length > 0) {
            warn('Avisos (' + warnings.length + '):');
            warnings.slice(0, 5).forEach(w => warn('  ' + w));
            if (warnings.length > 5) warn('  ... e mais ' + (warnings.length - 5) + ' aviso(s)');
        }
        if (errors.length > 0) {
            error('Erros (' + errors.length + '):');
            errors.forEach(e => error('  ' + e));
            warn('Corrija os dados antes de importar.');
            return;
        }
    }

    const opLog = sessionLog.child({ operation: sourceType + '-import', sourcePath });

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

    if (process.env.AUTO_CONFIRM !== 'true') {
        const filterText = prompt('Filtrar testes por titulo? (Enter para todos)');
        if (filterText.trim()) {
            const filtered = tests.filter(t =>
                t.title.toLowerCase().includes(filterText.trim().toLowerCase())
            );
            if (filtered.length === 0) {
                warn('Nenhum teste corresponde a "' + filterText.trim() + '".');
                return;
            }
            info(filtered.length + '/' + tests.length + ' testes correspondem a "' + filterText.trim() + '"');
            if (!confirm('Criar apenas estes ' + filtered.length + ' testes?')) {
                warn('Operacao cancelada.');
                return;
            }
            tests = filtered;
        }
    }

    if (process.env.AUTO_CONFIRM !== 'true' && !confirm('Criar estes testes no Jira?')) {
        warn('Operacao cancelada.');
        return;
    }

    const isDryRun = process.env.DRY_RUN === 'true';
    if (isDryRun) {
        warn('MODO DRY-RUN: Nenhuma operacao sera executada.');
        printSummary(
            /** @type {import('../shared/types').TestResult[]} */ (
                tests.map(t => ({ status: 'ok', label: t.title, message: 'simulado' }))
            )
        );
        onBusy(false);
        return {
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            summary: 'DRY-RUN: ' + tests.length + ' testes simulados',
            status: 'ok',
            sourcePath
        };
    }

    opLog.info('Iniciando criacao de ' + tests.length + ' teste(s)');

    const results = [];
    const testDurations = [];
    let testStart = Date.now();
    onBusy(true);
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

        const testLog = opLog.child({ test: t + 1, title: testTitle });
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

        const issueResult = await _createIssue(jiraResource, testData, testTitle, t, tests.length, opLog);
        if ('action' in issueResult) {
            if (issueResult.action === 'abort') {
                opLog.warn('Usuario abortou apos falha na criacao da issue');
                results.push({ status: 'error', label: testTitle, message: 'Falha na criacao da issue' });
                break outer;
            }
            if (issueResult.action === 'retry') { t--; continue; }
            results.push({ status: 'error', label: testTitle, message: 'Falha na criacao da issue' });
            continue;
        }
        const createdTestIssue = { key: issueResult.key };

        inMemoryTasksId.push(createdTestIssue.key);

        const cpSave = {};
        cpSave[cpKey] = sourcePath;
        cpSave.project = project_name;
        cpSave.ts = new Date().toISOString();
        cpSave.testCount = tests.length;
        cpSave.done = inMemoryTasksId.map((key, idx) => ({ key, title: inMemoryTasksText[idx] }));
        updateState(state => {
            if (!state._checkpoint) state._checkpoint = {};
            Object.assign(state._checkpoint, cpSave);
        });

        const testReport = { status: 'ok', label: testTitle, message: '' };

        if (test.precondition && test.precondition.type === 'reference') {
            const precResult = await _associatePrecondition(linkManager, test, createdTestIssue.key, opLog);
            if (precResult) {
                testReport.status = 'error';
                if (precResult.action === 'abort') {
                    testReport.message = 'Falha ao associar pre-condition';
                    results.push(testReport);
                    break outer;
                }
            }
        }

        const stepsResult = await _postSteps(jiraResourceXray, createdTestIssue.key, test, opLog);
        if (stepsResult && stepsResult.action === 'abort') {
            testReport.status = 'error';
            testReport.message = 'Falha ao criar steps';
            results.push(testReport);
            break outer;
        }

        if (test.linkedIssues && test.linkedIssues.length > 0) {
            const linkResult = await _linkIssues(linkManager, createdTestIssue.key, test);
            if (linkResult && linkResult.action === 'abort') {
                testReport.status = 'error';
                testReport.message = 'Falha ao criar linked issues';
                results.push(testReport);
                break outer;
            }
        }

        if (!isQuiet()) console.log('  -> ' + base_url + '/browse/' + createdTestIssue.key);
        results.push(testReport);

        testDurations.push(Date.now() - testStart);
        testStart = Date.now();
    }

    if (testBar) testBar.stop();

    if (results.filter(r => r.status === 'ok').length === tests.length) {
        updateState(state => { delete state._checkpoint; });
    }

    if (tests.some(t => t.group) && results.length > 0) {
        info('Atualizando descricoes com cross-references...');
        await updateCrossReferences(jiraResource, tests, inMemoryTasksId);
    }

    generateMappingFiles(sourcePath, project_name, inMemoryTasksId, tests);

    printSummary(/** @type {import('../shared/types').TestResult[]} */ (results));
    const okCount = results.filter(r => r.status === 'ok').length;
    const errored = results.some(r => r.status === 'error');
    const summary = okCount + '/' + tests.length + ' testes criados';
    opLog.info('Operacao concluida', {
        passed: okCount,
        failed: results.length - okCount,
        total: tests.length
    });

    const stateUpdate = { lastLabels: jiraLabels.join(',') };
    if (sourceType === 'json') {
        stateUpdate.lastJsonPath = sourcePath;
    } else {
        stateUpdate.lastCsvPath = sourcePath;
    }
    stateUpdate.lastProject = project_name;
    updateState(state => Object.assign(state, stateUpdate));

    onBusy(false);

    return {
        inMemoryTasksId,
        inMemoryTasksText,
        summary,
        status: errored ? 'error' : 'ok',
        sourcePath
    };
}

/**
 * @param {Object} options
 * @param {import('./jira_resource')} options.jiraResource
 * @param {import('./jira_resource')} options.jiraResourceXray
 * @param {import('./jira_link_manager')} options.linkManager
 * @param {import('./jira_link_manager')} options.linkManagerXray
 * @param {import('./csv_resource')} options.csvResource
 * @param {string} options.project_name
 * @param {string} options.base_url
 * @param {import('../shared/logger').Logger} options.sessionLog
 * @param {Function} options.onBusy
 */
async function createTestsFromCsv({ jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource, project_name, base_url, sessionLog, onBusy }) {
    const state = loadState();
    const csvPath = process.env.CSV_PATH || smartPrompt(
        'Caminho do arquivo CSV',
        { default: state.lastCsvPath || csvDefaultPath }
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
    try {
        tests = await csvResource.readBulkCsv(csvPath);
    } catch (err) {
        printError('Erro ao ler CSV', err);
        return;
    }

    if (tests.length === 0) {
        warn('Nenhum teste encontrado no CSV.');
        return;
    }

    return _createTestsFromTestCases({
        tests, jiraResource, jiraResourceXray, linkManager, linkManagerXray,
        project_name, base_url, sessionLog, onBusy,
        sourcePath: csvPath, sourceType: 'csv', jiraLabels
    });
}

/**
 * @param {Object} options
 * @param {import('./jira_resource')} options.jiraResource
 * @param {import('./jira_resource')} options.jiraResourceXray
 * @param {import('./jira_link_manager')} options.linkManager
 * @param {import('./jira_link_manager')} options.linkManagerXray
 * @param {string} options.project_name
 * @param {string} options.base_url
 * @param {import('../shared/logger').Logger} options.sessionLog
 * @param {Function} options.onBusy
 */
async function createTestsFromJson({ jiraResource, jiraResourceXray, linkManager, linkManagerXray, project_name, base_url, sessionLog, onBusy }) {
    const state = loadState();
    const jsonPathInput = process.env.JSON_PATH || smartPrompt(
        'Caminho do arquivo JSON ou TXT (formato JSON)',
        { default: state.lastJsonPath || '' }
    );

    let jsonPath = jsonPathInput.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operacao cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
    }

    const labelsHint = state.lastLabels
        ? 'ultimo: ' + state.lastLabels : 'vazio para nenhuma';
    const jiraLabelsInput = process.env.JSON_LABELS || prompt(
        'Labels Jira (separadas por virgula)',
        { hint: labelsHint, default: state.lastLabels || '' }
    );
    const jiraLabels = jiraLabelsInput
        .split(',')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (!isQuiet()) info('Lendo JSON...');
    let tests;
    try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array de casos de teste');
        tests = parsed.map((item, i) => {
            if (!item.title || !item.steps || !Array.isArray(item.steps)) {
                throw new Error('Item ' + (i + 1) + ': campos obrigatorios: title (string), steps (array)');
            }
            return {
                title: item.title,
                description: item.description || '',
                steps: item.steps.map(s => ({
                    fields: {
                        Action: s.Action || '',
                        Data: s.Data || '',
                        ExpectedResult: s.ExpectedResult || ''
                    }
                })),
                precondition: item.precondition
                    ? item.precondition.match(/^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/)
                        ? { type: 'reference', value: item.precondition }
                        : { type: 'inline', value: item.precondition }
                    : undefined,
                group: item.group || '',
                linkedIssues: Array.isArray(item.linkedIssues)
                    ? item.linkedIssues.map(li => {
                        if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                        return { key: li.key, linkType: li.linkType || 'Tests' };
                      })
                    : []
            };
        });
    } catch (err) {
        printError('Erro ao ler JSON', err);
        return;
    }

    if (tests.length === 0) {
        warn('Nenhum teste encontrado no JSON.');
        return;
    }

    return _createTestsFromTestCases({
        tests, jiraResource, jiraResourceXray, linkManager, linkManagerXray,
        project_name, base_url, sessionLog, onBusy,
        sourcePath: jsonPath, sourceType: 'json', jiraLabels
    });
}

module.exports = { createTestsFromCsv, createTestsFromJson, validateCsvTests, updateCrossReferences, createTestExecution, createTestExecutionWithLinks, generateMappingFiles };
