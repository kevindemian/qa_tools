/** Create tests — orchestrate CSV/JSON import, issue creation, linking, and test execution reporting.
 * @module Functions ordered by dependency: readers → creators → validators → linkers. 219 lines under the 300-line R2 limit. */

import type { JiraResourceLike } from '../shared/types';
import JiraLinkManager from './jira_link_manager';
import type CsvResource from './csv_resource';
import type { TestCase } from '../shared/types';
import { TestCaseSchema } from './csv-import-schema';
import TestExecutionCreator from './test-execution-creator';
import MappingFileGenerator from './mapping-file-generator';
import { rootLogger } from '../shared/logger';
import IssueLinker from './issue-linker';
import { resolveCsvPath, resolveJsonPath, resolveLabels, parseJsonTests } from './import-prep';
import { createTestsFromTestCases } from './import-orchestrator';
import { isQuiet, info, warn, printError } from '../shared/prompt';

interface CreateFromFileParams {
    jiraResource: JiraResourceLike;
    jiraResourceXray: JiraResourceLike;
    linkManager: JiraLinkManager;
    linkManagerXray: JiraLinkManager;
    project_name: string;
    base_url: string;
    sessionLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    filePath?: string;
    jiraLabels?: string[];
}

/** Read and parse test cases from a CSV file. Returns undefined on error. */
async function readCsvTests(csvResource: CsvResource, csvPath: string): Promise<TestCase[] | undefined> {
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

/** Read and validate test cases from a JSON file. Returns undefined on error. */
function readJsonTests(jsonPath: string): TestCase[] | undefined {
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

/** Full CSV import flow: read, validate, create issues, link, and optionally create test execution. */
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
    const csvPath = await resolveCsvPath(csvPathInput);
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

/** Full JSON import flow: read, validate, create issues, link, and optionally create test execution. */
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
    const jsonPath = await resolveJsonPath(jsonPathInput);
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

interface CreateTeOptions {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;
    projectName: string;
    testKeys: string[];
    csvName: string;
    titleOverride?: string;
}

/** Create a Test Execution issue in Jira for the given test keys. */
async function createTestExecution(opts: CreateTeOptions): Promise<{ key: string; summary: string } | null> {
    const { jiraResource, linkManager, projectName, testKeys, csvName, titleOverride } = opts;
    const creator = new TestExecutionCreator(jiraResource, linkManager);
    return creator.create(projectName, testKeys, csvName, titleOverride);
}

interface CreateTeWithLinksOptions {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;
    projectName: string;
    testKeys: string[];
    csvName: string;
    execOpts?: { title?: string; description?: string };
}

/** Create a Test Execution and link each test case to it. */
async function createTestExecutionWithLinks(
    opts: CreateTeWithLinksOptions,
): Promise<{ key: string; summary: string } | null> {
    const { jiraResource, linkManager, projectName, testKeys, csvName, execOpts } = opts;
    const creator = new TestExecutionCreator(jiraResource, linkManager);
    return creator.createWithLinks(projectName, testKeys, csvName, execOpts);
}

/** Validate test cases against TestCaseSchema. Returns errors and warnings separately. */
function validateCsvTests(tests: TestCase[]): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const titles = new Set<string>();

    tests.forEach((test, i) => {
        const idx = i + 1;
        const result = TestCaseSchema.safeParse(test);
        if (!result.success) {
            result.error.issues.forEach((issue) => {
                const path = issue.path.join('.');
                errors.push('Teste ' + idx + ': ' + path + ' ' + issue.message);
            });
            return;
        }

        if (test.title && titles.has(test.title)) {
            warnings.push('Teste ' + idx + ': Titulo duplicado "' + test.title + '"');
        }
        if (test.title) titles.add(test.title);

        test.steps.forEach((step, si) => {
            const action = step.fields?.Action || '';
            if (!action.trim()) {
                warnings.push('Teste ' + idx + ' "' + test.title + '": Step ' + (si + 1) + ' sem Action');
            }
        });
    });

    return { errors, warnings };
}

/** Update cross-references between test cases that reference each other by index. */
async function updateCrossReferences(linker: IssueLinker, tests: TestCase[], ids: string[]): Promise<void> {
    return linker.updateCrossReferences(tests, ids);
}

/** Generate CSV/JSON mapping files for the created test issues. */
function generateMappingFiles(sourcePath: string, projectName: string, tasksId: string[], tests: TestCase[]): void {
    const gen = new MappingFileGenerator();
    gen.generate(sourcePath, projectName, tasksId, tests);
}

export default {
    readCsvTests,
    createTestsFromCsv,
    createTestsFromJson,
    createTestExecution,
    createTestExecutionWithLinks,
    validateCsvTests,
    updateCrossReferences,
    generateMappingFiles,
};
