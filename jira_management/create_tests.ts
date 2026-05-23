import * as fs from 'fs';
import * as path from 'path';
import Config from '../shared/config';
import type JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import type CsvResource from './csv_resource';
import type { TestCase } from '../shared/types';
import TestCaseFactory from './test-case-factory';
import IssueLinker from './issue-linker';
import TestExecutionCreator from './test-execution-creator';
import TestCaseValidator from './test-case-validator';
import MappingFileGenerator from './mapping-file-generator';

import { rootLogger } from '../shared/logger';
import { load as loadState, update as updateState } from '../shared/state';

interface TestResult {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

interface CreateTestsFromTestCasesParams {
    tests: TestCase[];
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    sourcePath: string;
    sourceType: string;
    jiraLabels: string[];
}

const csvDefaultPath = Config.csvDefaultPath || path.join(__dirname, 'test_steps.csv');

function _getPm(): typeof import('../shared/prompt') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../shared/prompt');
}

function _checkResumeCheckpoint(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
): { resumeFrom: number; inMemoryTasksId: string[]; inMemoryTasksText: string[] } {
    const { confirm, info } = _getPm();
    const cp = loadState()._checkpoint as Record<string, unknown> | undefined;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    let resumeFrom = 0;
    const inMemoryTasksId: string[] = [];
    const inMemoryTasksText: string[] = [];

    if (
        cp &&
        cp[cpKey] === sourcePath &&
        cp.project === projectName &&
        cp.testCount === tests.length &&
        Array.isArray(cp.done)
    ) {
        const age = Date.now() - new Date((cp.ts as string) ?? '').getTime();
        if (age < 86400000 && (cp.done as Array<unknown>).length < tests.length) {
            const ans = confirm(
                (cp.done as Array<unknown>).length + '/' + tests.length + ' testes ja criados. Continuar?',
                true,
            );
            if (ans) {
                resumeFrom = (cp.done as Array<{ key: string; title: string }>).length;
                for (const d of cp.done as Array<{ key: string; title: string }>) {
                    inMemoryTasksId.push(d.key);
                    inMemoryTasksText.push(d.title);
                }
                info('Retomando do teste ' + (resumeFrom + 1) + '...');
            }
        }
    }

    return { resumeFrom, inMemoryTasksId, inMemoryTasksText };
}

function _showPreview(tests: TestCase[], jiraLabels: string[], totalSteps: number, groupsCount: number): void {
    const { title, print, divider, info } = _getPm();
    title('Preview dos testes a serem criados');
    tests.forEach((test, i) => {
        const desc = test.description ? ' — ' + test.description.substring(0, 60) : '';
        const pre = test.precondition ? ' [pre: ' + test.precondition.value.substring(0, 30) + ']' : '';
        const links = test.linkedIssues?.length ? ' [' + test.linkedIssues.length + ' link(s)]' : '';
        const group = test.group ? ' [grupo: ' + test.group + ']' : '';
        const stepsInfo = test.steps.length + ' step(s)';
        const firstStep = test.steps[0]?.fields?.Action?.substring(0, 30) || '';
        const lastStep =
            test.steps.length > 1 ? test.steps[test.steps.length - 1]?.fields?.Action?.substring(0, 30) || '' : '';
        const stepPreview =
            ' [' +
            stepsInfo +
            ': "' +
            firstStep +
            '"...' +
            (lastStep && lastStep !== firstStep ? ' "' + lastStep + '"' : '') +
            ']';
        print('  ' + (i + 1) + '. ' + test.title + desc + pre + links + group + stepPreview);
    });
    divider();

    if (jiraLabels.length > 0) {
        info('Labels: ' + jiraLabels.join(', '));
    }
    info(
        'Total: ' +
            tests.length +
            ' teste(s), ' +
            totalSteps +
            ' step(s)' +
            (groupsCount > 0 ? ', ' + groupsCount + ' grupo(s)' : ''),
    );
}

function _filterTests(tests: TestCase[]): TestCase[] | null {
    const { prompt, warn, info, confirm } = _getPm();
    if (Config.autoConfirm) return tests;

    const filterText = prompt('Filtrar testes por titulo? (Enter para todos)');
    if (!filterText.trim()) return tests;

    const filtered = tests.filter((t) => t.title.toLowerCase().includes(filterText.trim().toLowerCase()));
    if (filtered.length === 0) {
        warn('Nenhum teste corresponde a "' + filterText.trim() + '".');
        return null;
    }
    info(filtered.length + '/' + tests.length + ' testes correspondem a "' + filterText.trim() + '"');
    if (!confirm('Criar apenas estes ' + filtered.length + ' testes?')) {
        warn('Operação cancelada.');
        return null;
    }
    return filtered;
}

function _confirmOrCancel(): boolean {
    const { confirm } = _getPm();
    if (Config.autoConfirm) return true;
    return confirm('Criar estes testes no Jira?');
}

function _validateImportBatch(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    projectName: string,
):
    | {
          resumeFrom: number;
          inMemoryTasksId: string[];
          inMemoryTasksText: string[];
          opLog: ReturnType<typeof rootLogger.child>;
      }
    | undefined {
    const { warn, error } = _getPm();
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText } = _checkResumeCheckpoint(
        tests,
        sourcePath,
        sourceType,
        projectName,
    );

    if (resumeFrom === 0) {
        const validator = new TestCaseValidator();
        const { errors, warnings } = validator.validate(tests);
        if (warnings.length > 0) {
            warn('Avisos (' + warnings.length + '):');
            warnings.slice(0, 5).forEach((w) => warn('  ' + w));
            if (warnings.length > 5) warn('  ... e mais ' + (warnings.length - 5) + ' aviso(s)');
        }
        if (errors.length > 0) {
            error('Erros (' + errors.length + '):');
            errors.forEach((e) => error('  ' + e));
            warn('Corrija os dados antes de importar.');
            return;
        }
    }

    const opLog = rootLogger.child({ operation: sourceType + '-import', sourcePath });
    return { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog };
}

function _handleDryRun(
    tests: TestCase[],
    onBusy: (busy: boolean) => void,
    sourcePath: string,
): {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
} | null {
    const { warn, printSummary } = _getPm();
    if (!Config.dryRun) return null;

    warn('MODO DRY-RUN: Nenhuma operação sera executada.');
    printSummary(tests.map((t) => ({ status: 'ok' as const, label: t.title, message: 'simulado' })));
    onBusy(false);
    return {
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        summary: 'DRY-RUN: ' + tests.length + ' testes simulados',
        status: 'ok',
        sourcePath,
    };
}

async function _executeTestCreationLoop(
    tests: TestCase[],
    factory: TestCaseFactory,
    linker: IssueLinker,
    projectName: string,
    jiraLabels: string[],
    baseUrl: string,
    opLog: ReturnType<typeof rootLogger.child>,
    sourcePath: string,
    sourceType: string,
    inMemoryTasksId: string[],
    inMemoryTasksText: string[],
    results: TestResult[],
    resumeFrom: number,
    isQuiet: () => boolean,
    info: (msg: string) => void,
    print: (msg: string) => void,
): Promise<void> {
    outer: for (let t = resumeFrom; t < tests.length; t++) {
        const test = tests[t];
        const testTitle = test.title;

        if (!isQuiet()) info('Criando: ' + testTitle);
        inMemoryTasksText.push(testTitle);

        const testData = _buildTestData(test, projectName, jiraLabels);

        const issueResult = await factory.createIssue(testData, testTitle, t, tests.length, opLog);
        if ('action' in issueResult) {
            if (issueResult.action === 'abort') {
                opLog.warn('Usuario abortou apos falha na criação da issue');
                results.push({ status: 'error', label: testTitle, message: 'Falha na criação da issue' });
                break outer;
            }
            if (issueResult.action === 'retry') {
                t--;
                continue;
            }
            results.push({ status: 'error', label: testTitle, message: 'Falha na criação da issue' });
            continue;
        }
        const createdTestIssue = { key: issueResult.key! };

        inMemoryTasksId.push(createdTestIssue.key);

        _saveCheckpoint(sourcePath, sourceType, projectName, tests, inMemoryTasksId, inMemoryTasksText);

        const testReport: TestResult = { status: 'ok', label: testTitle, message: '' };

        if (test.precondition && test.precondition.type === 'reference') {
            const precResult = await linker.associatePrecondition(test, createdTestIssue.key, opLog);
            if (precResult) {
                testReport.status = 'error';
                if (precResult.action === 'abort') {
                    testReport.message = 'Falha ao associar pre-condition';
                    results.push(testReport);
                    break outer;
                }
            }
        }

        const stepsResult = await factory.postSteps(createdTestIssue.key, test, opLog);
        if (stepsResult && stepsResult.action === 'abort') {
            testReport.status = 'error';
            testReport.message = 'Falha ao criar steps';
            results.push(testReport);
            break outer;
        }

        if (test.linkedIssues && test.linkedIssues.length > 0) {
            const linkResult = await linker.linkIssues(createdTestIssue.key, test);
            if (linkResult && linkResult.action === 'abort') {
                testReport.status = 'error';
                testReport.message = 'Falha ao criar linked issues';
                results.push(testReport);
                break outer;
            }
        }

        if (!isQuiet()) print('  -> ' + baseUrl + '/browse/' + createdTestIssue.key);
        results.push(testReport);
    }
}

function _buildTestData(test: TestCase, projectName: string, jiraLabels: string[]): Record<string, unknown> {
    let description = test.description || '';
    if (test.precondition && test.precondition.type === 'inline') {
        description += (description ? '\n\n' : '') + 'Pre-condition: ' + test.precondition.value;
    }

    const testData: Record<string, unknown> = {
        fields: {
            project: { key: projectName },
            summary: test.title,
            description,
            issuetype: { name: 'Test' },
        },
    };

    if (jiraLabels.length > 0) {
        (testData.fields as Record<string, unknown>).labels = jiraLabels;
    }

    return testData;
}

function _saveCheckpoint(
    sourcePath: string,
    sourceType: string,
    projectName: string,
    tests: TestCase[],
    inMemoryTasksId: string[],
    inMemoryTasksText: string[],
): void {
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    const cpSave: Record<string, unknown> = {};
    cpSave[cpKey] = sourcePath;
    cpSave.project = projectName;
    cpSave.ts = new Date().toISOString();
    cpSave.testCount = tests.length;
    cpSave.done = inMemoryTasksId.map((key, idx) => ({ key, title: inMemoryTasksText[idx] }));
    updateState((state) => {
        if (!state._checkpoint) state._checkpoint = {};
        Object.assign(state._checkpoint as Record<string, unknown>, cpSave);
    });
}

function _updateFinalState(sourceType: string, sourcePath: string, projectName: string, jiraLabels: string[]): void {
    const stateUpdate: Record<string, unknown> = { lastLabels: jiraLabels.join(',') };
    if (sourceType === 'json') {
        stateUpdate.lastJsonPath = sourcePath;
    } else {
        stateUpdate.lastCsvPath = sourcePath;
    }
    stateUpdate.lastProject = projectName;
    updateState((state) => Object.assign(state, stateUpdate));
}

async function _createTestsFromTestCases({
    tests,
    jiraResource,
    jiraResourceXray,
    linkManager,
    project_name,
    base_url,
    sessionLog: _sessionLog,
    onBusy,
    sourcePath,
    sourceType,
    jiraLabels,
}: CreateTestsFromTestCasesParams): Promise<
    | {
          inMemoryTasksId: string[];
          inMemoryTasksText: string[];
          summary: string;
          status: string;
          sourcePath: string;
      }
    | undefined
> {
    const { warn, info, isQuiet, print, printSummary } = _getPm();

    const validationResult = _validateImportBatch(tests, sourcePath, sourceType, project_name);
    if (validationResult === undefined) return;
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog } = validationResult;

    const totalSteps = tests.reduce((sum, t) => sum + t.steps.length, 0);
    const groupsCount = new Set(tests.map((t) => t.group).filter(Boolean)).size;

    _showPreview(tests, jiraLabels, totalSteps, groupsCount);

    const filtered = _filterTests(tests);
    if (filtered === null) return;
    tests = filtered;

    if (!_confirmOrCancel()) {
        warn('Operação cancelada.');
        return;
    }

    const dryRunResult = _handleDryRun(tests, onBusy, sourcePath);
    if (dryRunResult) return dryRunResult;

    opLog.info('Iniciando criação de ' + tests.length + ' teste(s)');

    const factory = new TestCaseFactory(jiraResource, jiraResourceXray);
    const linker = new IssueLinker(jiraResource, linkManager);
    const results: TestResult[] = [];
    onBusy(true);

    await _executeTestCreationLoop(
        tests,
        factory,
        linker,
        project_name,
        jiraLabels,
        base_url,
        opLog,
        sourcePath,
        sourceType,
        inMemoryTasksId,
        inMemoryTasksText,
        results,
        resumeFrom,
        isQuiet,
        info,
        print,
    );

    if (results.filter((r) => r.status === 'ok').length === tests.length) {
        updateState((state) => {
            delete state._checkpoint;
        });
    }

    if (tests.some((t) => t.group) && results.length > 0) {
        info('Atualizando descricoes com cross-references...');
        await linker.updateCrossReferences(tests, inMemoryTasksId);
    }

    const mappingGen = new MappingFileGenerator();
    mappingGen.generate(sourcePath, project_name, inMemoryTasksId, tests);

    printSummary(results);
    const okCount = results.filter((r) => r.status === 'ok').length;
    const errored = results.some((r) => r.status === 'error');
    const summary = okCount + '/' + tests.length + ' testes criados';
    opLog.info('Operação concluída', {
        passed: okCount,
        failed: results.length - okCount,
        total: tests.length,
    });

    _updateFinalState(sourceType, sourcePath, project_name, jiraLabels);

    onBusy(false);

    return {
        inMemoryTasksId,
        inMemoryTasksText,
        summary,
        status: errored ? 'error' : 'ok',
        sourcePath,
    };
}

function _resolveCsvPath(csvPathInput: string | undefined): string {
    const state = loadState();
    return (
        csvPathInput ||
        Config.csvPath ||
        _getPm().smartPrompt('Caminho do arquivo CSV', { default: (state.lastCsvPath as string) || csvDefaultPath })
    );
}

function _resolveLabels(jiraLabelsInput: string[] | undefined, configKey: 'csvLabels' | 'jsonLabels'): string[] {
    if (jiraLabelsInput) return jiraLabelsInput;
    const state = loadState();
    const configValue = Config[configKey === 'csvLabels' ? 'csvLabels' : 'jsonLabels'] as string | undefined;
    const labels =
        configValue ||
        _getPm().prompt('Labels Jira (separadas por virgula)', {
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            hint: state.lastLabels ? 'último: ' + String(state.lastLabels) : 'vazio para nenhuma',
            default: (state.lastLabels as string) || '',
        });
    return labels
        .split(',')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
}

async function createTestsFromCsv({
    jiraResource,
    jiraResourceXray,
    linkManager,
    linkManagerXray,
    csvResource,
    project_name,
    base_url,
    sessionLog,
    onBusy,
    csvPath: csvPathInput,
    jiraLabels: jiraLabelsInput,
}: {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    csvResource: CsvResource;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    csvPath?: string;
    jiraLabels?: string[];
}): Promise<ReturnType<typeof _createTestsFromTestCases>> {
    const { isQuiet, info, warn, printError } = _getPm();
    const csvPath = _resolveCsvPath(csvPathInput);
    const jiraLabels = _resolveLabels(jiraLabelsInput, 'csvLabels');

    if (!isQuiet()) info('Lendo CSV...');
    let tests: TestCase[];
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
        tests,
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        project_name,
        base_url,
        sessionLog,
        onBusy,
        sourcePath: csvPath,
        sourceType: 'csv',
        jiraLabels,
    });
}

function _resolveJsonPath(jsonPathInput: string | undefined): string | undefined {
    const state = loadState();
    const { warn, smartPrompt } = _getPm();
    const rawPath =
        jsonPathInput ||
        Config.jsonPath ||
        smartPrompt('Caminho do arquivo JSON ou TXT (formato JSON)', { default: (state.lastJsonPath as string) || '' });

    let jsonPath = rawPath.trim();
    if (!jsonPath) {
        warn('Caminho do JSON vazio. Operação cancelada.');
        return;
    }
    if (state.lastJsonDir && !path.isAbsolute(jsonPath)) {
        const potential = path.resolve(state.lastJsonDir as string, jsonPath);
        if (fs.existsSync(potential)) {
            jsonPath = potential;
        }
    }
    return jsonPath;
}

function _parseJsonTests(jsonPath: string): TestCase[] {
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array de casos de teste');
    return parsed.map((item: Record<string, unknown>, i: number) => {
        if (!item.title || !item.steps || !Array.isArray(item.steps)) {
            throw new Error('Item ' + (i + 1) + ': campos obrigatórios: title (string), steps (array)');
        }
        return {
            title: item.title as string,
            description: (item.description as string) || '',
            steps: (item.steps as Array<Record<string, string>>).map((s) => ({
                fields: {
                    Action: s.Action || '',
                    Data: s.Data || '',
                    ExpectedResult: s.ExpectedResult || '',
                },
            })),
            precondition: item.precondition
                ? (item.precondition as string).match(/^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/)
                    ? { type: 'reference' as const, value: item.precondition as string }
                    : { type: 'inline' as const, value: item.precondition as string }
                : undefined,
            group: (item.group as string) || '',
            linkedIssues: Array.isArray(item.linkedIssues)
                ? (item.linkedIssues as Array<unknown>).map((li) => {
                      if (typeof li === 'string') return { key: li, linkType: 'Tests' };
                      const liObj = li as { key: string; linkType?: string };
                      return { key: liObj.key, linkType: liObj.linkType || 'Tests' };
                  })
                : [],
        };
    });
}

async function createTestsFromJson({
    jiraResource,
    jiraResourceXray,
    linkManager,
    linkManagerXray,
    project_name,
    base_url,
    sessionLog,
    onBusy,
    jsonPath: jsonPathInput,
    jiraLabels: jiraLabelsInput,
}: {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    jsonPath?: string;
    jiraLabels?: string[];
}): Promise<ReturnType<typeof _createTestsFromTestCases>> {
    const { isQuiet, info, warn, printError } = _getPm();
    const jsonPath = _resolveJsonPath(jsonPathInput);
    if (!jsonPath) return;

    const jiraLabels = _resolveLabels(jiraLabelsInput, 'jsonLabels');

    if (!isQuiet()) info('Lendo JSON...');
    let tests: TestCase[];
    try {
        tests = _parseJsonTests(jsonPath);
    } catch (err) {
        printError('Erro ao ler JSON', err);
        return;
    }

    if (tests.length === 0) {
        warn('Nenhum teste encontrado no JSON.');
        return;
    }

    return _createTestsFromTestCases({
        tests,
        jiraResource,
        jiraResourceXray,
        linkManager,
        linkManagerXray,
        project_name,
        base_url,
        sessionLog,
        onBusy,
        sourcePath: jsonPath,
        sourceType: 'json',
        jiraLabels,
    });
}

async function createTestExecution(
    jiraResource: JiraResource,
    linkManager: JiraLinkManager,
    projectName: string,
    testKeys: string[],
    csvName: string,
    titleOverride?: string,
): Promise<{ key: string; summary: string }> {
    const creator = new TestExecutionCreator(jiraResource, linkManager);
    return creator.create(projectName, testKeys, csvName, titleOverride);
}

async function createTestExecutionWithLinks(
    jiraResource: JiraResource,
    linkManager: JiraLinkManager,
    projectName: string,
    testKeys: string[],
    csvName: string,
    execOpts?: { title?: string; description?: string },
): Promise<{ key: string; summary: string }> {
    const creator = new TestExecutionCreator(jiraResource, linkManager);
    return creator.createWithLinks(projectName, testKeys, csvName, execOpts);
}

function validateCsvTests(tests: TestCase[]): { errors: string[]; warnings: string[] } {
    const validator = new TestCaseValidator();
    return validator.validate(tests);
}

function updateCrossReferences(jiraResource: JiraResource, tests: TestCase[], ids: string[]): Promise<void> {
    const linker = new IssueLinker(jiraResource, new JiraLinkManager(jiraResource));
    return linker.updateCrossReferences(tests, ids);
}

function generateMappingFiles(sourcePath: string, projectName: string, tasksId: string[], tests: TestCase[]): void {
    const gen = new MappingFileGenerator();
    gen.generate(sourcePath, projectName, tasksId, tests);
}

export = {
    createTestsFromCsv,
    createTestsFromJson,
    createTestExecution,
    createTestExecutionWithLinks,
    validateCsvTests,
    updateCrossReferences,
    generateMappingFiles,
};
