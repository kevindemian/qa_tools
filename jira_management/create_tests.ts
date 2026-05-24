import type JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import type CsvResource from './csv_resource';
import type { TestCase } from '../shared/types';
import TestCaseValidator from './test-case-validator';
import TestExecutionCreator from './test-execution-creator';
import MappingFileGenerator from './mapping-file-generator';
import { rootLogger } from '../shared/logger';
import IssueLinker from './issue-linker';
import { resolveCsvPath, resolveJsonPath, resolveLabels, parseJsonTests } from './import-prep';
import { createTestsFromTestCases } from './import-orchestrator';

interface CreateFromFileParams {
    jiraResource: JiraResource;
    jiraResourceXray: JiraResource;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    filePath?: string;
    jiraLabels?: string[];
}

function _getPm(): typeof import('../shared/prompt') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../shared/prompt');
}

async function readCsvTests(csvResource: CsvResource, csvPath: string): Promise<TestCase[] | undefined> {
    const { isQuiet, info, warn, printError } = _getPm();
    if (!isQuiet()) info('Lendo CSV...');
    try {
        const tests = await csvResource.readBulkCsv(csvPath);
        if (tests.length === 0) {
            warn('Nenhum teste encontrado no CSV.');
            return undefined;
        }
        return tests;
    } catch (err) {
        printError('Erro ao ler CSV', err);
        return undefined;
    }
}

function readJsonTests(jsonPath: string): TestCase[] | undefined {
    const { isQuiet, info, warn, printError } = _getPm();
    if (!isQuiet()) info('Lendo JSON...');
    try {
        const tests = parseJsonTests(jsonPath);
        if (tests.length === 0) {
            warn('Nenhum teste encontrado no JSON.');
            return undefined;
        }
        return tests;
    } catch (err) {
        printError('Erro ao ler JSON', err);
        return undefined;
    }
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
}: CreateFromFileParams & {
    csvResource: CsvResource;
    csvPath?: string;
}): Promise<ReturnType<typeof createTestsFromTestCases>> {
    const csvPath = resolveCsvPath(csvPathInput);
    const jiraLabels = resolveLabels(jiraLabelsInput, 'csvLabels');
    const tests = await readCsvTests(csvResource, csvPath);
    if (!tests) return;

    return createTestsFromTestCases({
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
}: CreateFromFileParams & {
    jsonPath?: string;
}): Promise<ReturnType<typeof createTestsFromTestCases>> {
    const jsonPath = resolveJsonPath(jsonPathInput);
    if (!jsonPath) return;

    const jiraLabels = resolveLabels(jiraLabelsInput, 'jsonLabels');
    const tests = readJsonTests(jsonPath);
    if (!tests) return;

    return createTestsFromTestCases({
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

function updateCrossReferences(linker: IssueLinker, tests: TestCase[], ids: string[]): Promise<void> {
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
