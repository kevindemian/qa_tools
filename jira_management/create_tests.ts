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

function _getPm(): typeof import('../shared/prompt') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../shared/prompt');
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
}): Promise<ReturnType<typeof createTestsFromTestCases>> {
    const { isQuiet, info, warn, printError } = _getPm();
    const csvPath = resolveCsvPath(csvPathInput);
    const jiraLabels = resolveLabels(jiraLabelsInput, 'csvLabels');

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
}): Promise<ReturnType<typeof createTestsFromTestCases>> {
    const { isQuiet, info, warn, printError } = _getPm();
    const jsonPath = resolveJsonPath(jsonPathInput);
    if (!jsonPath) return;

    const jiraLabels = resolveLabels(jiraLabelsInput, 'jsonLabels');

    if (!isQuiet()) info('Lendo JSON...');
    let tests: TestCase[];
    try {
        tests = parseJsonTests(jsonPath);
    } catch (err) {
        printError('Erro ao ler JSON', err);
        return;
    }

    if (tests.length === 0) {
        warn('Nenhum teste encontrado no JSON.');
        return;
    }

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
