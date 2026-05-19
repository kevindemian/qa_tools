// @ts-check
const path = require('path');
const { success, error, warn, info, title, divider, prompt, confirm, smartPrompt, printError, printSummary, onError, ProgressBar, isQuiet } = require('../shared/prompt');
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
 * @param {Function} options.onPushHistory
 * @param {Function} options.onLastOperation
 * @param {Function} options.onBusy
 */
async function createTestsFromCsv({ jiraResource, jiraResourceXray, linkManager, linkManagerXray, csvResource, project_name, base_url, sessionLog, onPushHistory, onLastOperation, onBusy }) {
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

    const cp = loadState()._checkpoint;
    let resumeFrom = 0;
    let inMemoryTasksId = [];
    let inMemoryTasksText = [];
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
            return;
        }
    }

    const opLog = sessionLog.child({ operation: 'csv-import', csvPath });

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
                opLog.warn('Usuario abortou apos falha na criacao da issue');
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

        updateState(state => {
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
                    opLog.warn('Usuario abortou apos falha na pre-condition');
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
            opLog.warn('Usuario abortou apos falha no step');
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

    if (results.filter(r => r.status === 'ok').length === tests.length) {
        updateState(state => { delete state._checkpoint; });
    }

    if (tests.some(t => t.group) && results.length > 0) {
        info('Atualizando descricoes com cross-references...');
        await updateCrossReferences(jiraResource, tests, inMemoryTasksId);
    }

    printSummary(results);
    const opResult = results.filter(r => r.status === 'ok').length + '/' + tests.length + ' testes criados';
    onLastOperation(opResult);
    onPushHistory('csv-import', opResult,
        results.some(r => r.status === 'error') ? 'error' : 'ok');
    opLog.info('Operacao concluida', {
        passed: results.filter(r => r.status === 'ok').length,
        failed: results.filter(r => r.status === 'error').length,
        total: tests.length
    });

    updateState(state => {
        state.lastLabels = jiraLabels.join(',');
        state.lastCsvPath = csvPath;
        state.lastProject = project_name;
    });

    onBusy(false);

    return { inMemoryTasksId, inMemoryTasksText };
}

module.exports = { createTestsFromCsv, validateCsvTests, updateCrossReferences };
