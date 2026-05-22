// @ts-check
const { success, error, warn, info, title, divider, prompt, confirm, smartPrompt, printError, printSummary } = require('../../shared/prompt');
const { load: loadState, update: updateState } = require('../../shared/state');
const { rootLogger } = require('../../shared/logger');
const path = require('path');
const fs = require('fs');

/** @param {import('./context').CommandContext} c */
async function handler(c) {
    const state = loadState();
    const jsonPathInput = process.env.JSON_PATH || smartPrompt(
        'Caminho do arquivo JSON ou TXT (formato JSON)',
        { default: state.lastJsonPath || '' }
    );

    let jsonPath = jsonPathInput.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
    }

    const createTestsFromJson = require('../create_tests').createTestsFromJson;
    const result = await createTestsFromJson({
        jiraResource: c.jiraResource, jiraResourceXray: c.jiraResourceXray,
        linkManager: c.linkManager, linkManagerXray: c.linkManagerXray,
        project_name: c.ctx.project_name, base_url: c.base_url,
        sessionLog: c.sessionLog,
        onBusy: (val) => { c.ctx.isBusy = val; }
    });
    if (result) {
        c.ctx.inMemoryTasksId = result.inMemoryTasksId;
        c.ctx.inMemoryTasksText = result.inMemoryTasksText;
        const okCount = result.inMemoryTasksId.length;
        success('Importacao JSON concluída: ' + okCount + ' testes');
        c.ctx.results = result.inMemoryTasksId.map(key => ({ status: 'ok', label: key, message: '' }));
        c.pushHistory('importar-json', okCount + ' testes', 'ok');

        if (confirm('Criar Test Execution para estes testes?', true)) {
            const keys = result.inMemoryTasksId;
            const srcName = result.sourcePath ? path.basename(result.sourcePath, '.json') : 'json-import';
            const nameInput = prompt('Nome da execução', { hint: 'Enter = ' + srcName });
            const csvName = nameInput.trim() || srcName;
            const execTitle = prompt('Titulo do Test Execution', { hint: 'Enter = ' + csvName });
            const execDesc = prompt('Descrição (opcional)');
            const createTestExecutionWithLinks = require('../create_tests').createTestExecutionWithLinks;
            try {
                const execResult = await createTestExecutionWithLinks(
                    c.jiraResource, c.linkManager, c.ctx.project_name, keys, csvName,
                    { title: execTitle, description: execDesc }
                );
                c.pushHistory('create-testexec', execResult.key, 'ok');
            } catch (err) {
                printError('Erro ao criar Test Execution', err);
                c.pushHistory('create-testexec', 'erro', 'error');
            }
        }
    }
}

module.exports = { handler };
