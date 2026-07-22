/** Create tests — orchestrate CSV/JSON import, issue creation, linking, and test execution reporting.
 * @module Functions ordered by dependency: readers → creators → validators → linkers. 219 lines under the 300-line R2 limit. */

import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';
import type CsvResource from './csv_resource.js';
import type { TestCase } from '../shared/types.js';
import { TestCaseSchema } from './csv-import-schema.js';
import type TestExecutionCreator from './test-execution-creator.js';
import MappingFileGenerator from './mapping-file-generator.js';
import { rootLogger } from '../shared/logger.js';
import IssueLinker from './issue-linker.js';
import { resolveCsvPath, resolveJsonPath, resolveLabels, parseJsonTests } from './import-prep.js';
import { createTestsFromTestCases, type CreateTestsFromTestCasesResult } from './import-orchestrator.js';
import { isQuiet, info, warn, printError } from '../shared/ui/prompt.js';

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

/** Why a CSV/JSON read did not yield tests. Empty and missing must stay distinguishable (AGENTS.md §25). */
type ReadFailure = 'empty' | 'missing' | 'read-error';

type ReadTestsResult = { ok: true; tests: TestCase[] } | { ok: false; reason: ReadFailure; error?: string | undefined };

/** Outcome of a full import: either the created issues, or an explicit, distinguishable failure. */
type CsvImportOutcome =
    | { ok: true; result: CreateTestsFromTestCasesResult }
    | { ok: false; reason: ReadFailure; error?: string | undefined };

function _isMissingFile(err: unknown): boolean {
    return err instanceof Error && (err.message.includes('ENOENT') || err.message.includes('no such file'));
}

/** Read and parse test cases from a CSV file. Never returns undefined — failures are explicit. */
async function readCsvTests(csvResource: CsvResource, csvPath: string): Promise<ReadTestsResult> {
    if (!isQuiet()) info('Lendo CSV...');
    try {
        const tests = await csvResource.readBulkCsv(csvPath);
        if (tests.length === 0) {
            warn('Nenhum teste encontrado no CSV.');
            return { ok: false, reason: 'empty' };
        }
        return { ok: true, tests };
    } catch (err) {
        printError('Erro ao ler CSV', err);
        return {
            ok: false,
            reason: _isMissingFile(err) ? 'missing' : 'read-error',
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/** Read and validate test cases from a JSON file. Never returns undefined — failures are explicit. */
function readJsonTests(jsonPath: string): ReadTestsResult {
    if (!isQuiet()) info('Lendo JSON...');
    try {
        const tests = parseJsonTests(jsonPath);
        if (tests.length === 0) {
            warn('Nenhum teste encontrado no JSON.');
            return { ok: false, reason: 'empty' };
        }
        return { ok: true, tests };
    } catch (err) {
        printError('Erro ao ler JSON', err);
        return {
            ok: false,
            reason: _isMissingFile(err) ? 'missing' : 'read-error',
            error: err instanceof Error ? err.message : String(err),
        };
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
}): Promise<CsvImportOutcome> {
    const csvPath = await resolveCsvPath(csvPathInput);
    const jiraLabels = resolveLabels(jiraLabelsInput, 'csvLabels');
    const read = await readCsvTests(csvResource, csvPath);
    if (!read.ok) return { ok: false, reason: read.reason, error: read.error };

    const result = await createTestsFromTestCases({
        tests: read.tests,
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
    if (!result) return { ok: false, reason: 'read-error', error: 'Falha ao criar testes a partir do CSV.' };
    return { ok: true, result };
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
}): Promise<CsvImportOutcome> {
    const jsonPath = await resolveJsonPath(jsonPathInput);
    if (!jsonPath) return { ok: false, reason: 'missing', error: 'Caminho do arquivo JSON não informado.' };

    const jiraLabels = resolveLabels(jiraLabelsInput, 'jsonLabels');
    const read = readJsonTests(jsonPath);
    if (!read.ok) return { ok: false, reason: read.reason, error: read.error };

    const result = await createTestsFromTestCases({
        tests: read.tests,
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
    if (!result) return { ok: false, reason: 'read-error', error: 'Falha ao criar testes a partir do JSON.' };
    return { ok: true, result };
}

interface CreateTeOptions {
    testExecutionCreator: TestExecutionCreator;
    projectName: string;
    testKeys: string[];
    csvName: string;
    titleOverride?: string;
}

/** Create a Test Execution issue in Jira for the given test keys. */
async function createTestExecution(opts: CreateTeOptions): Promise<{ key: string; summary: string } | null> {
    const { testExecutionCreator, projectName, testKeys, csvName, titleOverride } = opts;
    return testExecutionCreator.create(projectName, testKeys, csvName, titleOverride);
}

interface CreateTeWithLinksOptions {
    testExecutionCreator: TestExecutionCreator;
    projectName: string;
    testKeys: string[];
    csvName: string;
    execOpts?: { title?: string; description?: string };
}

/** Create a Test Execution and link each test case to it. */
async function createTestExecutionWithLinks(
    opts: CreateTeWithLinksOptions,
): Promise<{ key: string; summary: string } | null> {
    const { testExecutionCreator, projectName, testKeys, csvName, execOpts } = opts;
    return testExecutionCreator.createWithLinks(projectName, testKeys, csvName, execOpts);
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
            const action = step.fields.Action || '';
            if (!action.trim()) {
                warnings.push('Teste ' + idx + ' "' + test.title + '": Step ' + (si + 1) + ' sem Action');
            }
        });
    });

    return { errors, warnings };
}

/** Update cross-references between test cases that reference each other by index. */
async function updateCrossReferences(linker: IssueLinker, tests: TestCase[], ids: string[]): Promise<string[]> {
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
