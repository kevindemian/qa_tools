import type JiraResource from './jira_resource';
import JiraLinkManager from './jira_link_manager';
import type { TestCase, TestResult } from '../shared/types';
import TestCaseFactory from './test-case-factory';
import IssueLinker from './issue-linker';
import MappingFileGenerator from './mapping-file-generator';
import { rootLogger } from '../shared/logger';
import { update as updateState } from '../shared/state';
import { showPreview, filterTests, confirmOrCancel, validateImportBatch, handleDryRun } from './import-prep';
import { executeTestCreationLoop, updateFinalState } from './import-loop';
import { OPERATION_CANCELLED } from './constants';

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

type CreateTestsFromTestCasesResult = {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
};

function _getPm(): typeof import('../shared/prompt') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../shared/prompt');
}

type PrepareTestRunResult =
    | CreateTestsFromTestCasesResult
    | {
          tests: TestCase[];
          resumeFrom: number;
          inMemoryTasksId: string[];
          inMemoryTasksText: string[];
          opLog: ReturnType<typeof rootLogger.child>;
      }
    | undefined;

function prepareTestRun(
    tests: TestCase[],
    sourcePath: string,
    sourceType: string,
    project_name: string,
    jiraLabels: string[],
    onBusy: (busy: boolean) => void,
    warn: (msg: string) => void,
): PrepareTestRunResult {
    const validationResult = validateImportBatch(tests, sourcePath, sourceType, project_name);
    if (validationResult === undefined) return;
    const { resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog } = validationResult;

    const totalSteps = tests.reduce((sum, t) => sum + t.steps.length, 0);
    const groupsCount = new Set(tests.map((t) => t.group).filter(Boolean)).size;

    showPreview(tests, jiraLabels, totalSteps, groupsCount);

    const filtered = filterTests(tests);
    if (filtered === null) return;

    if (!confirmOrCancel()) {
        warn(OPERATION_CANCELLED);
        return;
    }

    const dryRunResult = handleDryRun(filtered, onBusy, sourcePath);
    if (dryRunResult) return dryRunResult;

    return { tests: filtered, resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog };
}

interface FinalizeTestCreationParams {
    results: TestResult[];
    tests: TestCase[];
    linker: IssueLinker;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    sourcePath: string;
    sourceType: string;
    project_name: string;
    jiraLabels: string[];
    opLog: ReturnType<typeof rootLogger.child>;
    onBusy: (busy: boolean) => void;
    info: (msg: string) => void;
    printSummary: (results: TestResult[]) => void;
}

type FinalizeTestCreationResult = {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
};

async function finalizeTestCreation({
    results,
    tests,
    linker,
    inMemoryTasksId,
    inMemoryTasksText,
    sourcePath,
    sourceType,
    project_name: projectName,
    jiraLabels,
    opLog,
    onBusy,
    info,
    printSummary,
}: FinalizeTestCreationParams): Promise<FinalizeTestCreationResult | undefined> {
    await postProcessCheckpoint(
        results,
        tests,
        projectName,
        inMemoryTasksId,
        jiraLabels,
        sourcePath,
        sourceType,
        linker,
        info,
    );

    printSummary(results);

    const okCount = results.filter((r) => r.status === 'ok').length;
    const errored = results.some((r) => r.status === 'error');
    const summary = okCount + '/' + tests.length + ' testes criados';
    opLog.info('Operação concluída', {
        passed: okCount,
        failed: results.length - okCount,
        total: tests.length,
    });

    onBusy(false);

    return {
        inMemoryTasksId,
        inMemoryTasksText,
        summary,
        status: errored ? 'error' : 'ok',
        sourcePath,
    };
}

async function postProcessCheckpoint(
    results: TestResult[],
    tests: TestCase[],
    projectName: string,
    inMemoryTasksId: string[],
    jiraLabels: string[],
    sourcePath: string,
    sourceType: string,
    linker: IssueLinker,
    info: (msg: string) => void,
): Promise<void> {
    if (results.filter((r) => r.status === 'ok').length === tests.length) {
        updateState((state) => {
            delete state._checkpoint;
        });
    }

    if (tests.some((t) => t.group) && results.length > 0) {
        info('Atualizando descrições com cross-references...');
        await linker.updateCrossReferences(tests, inMemoryTasksId);
    }

    const mappingGen = new MappingFileGenerator();
    mappingGen.generate(sourcePath, projectName, inMemoryTasksId, tests);

    updateFinalState(sourceType, sourcePath, projectName, jiraLabels);
}

async function createTestsFromTestCases({
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
}: CreateTestsFromTestCasesParams): Promise<CreateTestsFromTestCasesResult | undefined> {
    const { warn, info, isQuiet, print, printSummary } = _getPm();

    const prepared = prepareTestRun(tests, sourcePath, sourceType, project_name, jiraLabels, onBusy, warn);
    if (prepared === undefined) return;
    if ('summary' in prepared) return prepared;
    const { tests: filtered, resumeFrom, inMemoryTasksId, inMemoryTasksText, opLog } = prepared;

    const factory = new TestCaseFactory(jiraResource, jiraResourceXray);
    const linker = new IssueLinker(jiraResource, linkManager);
    const results: TestResult[] = [];
    onBusy(true);

    opLog.info('Iniciando criação de ' + filtered.length + ' teste(s)');

    await executeTestCreationLoop(
        filtered,
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

    return finalizeTestCreation({
        results,
        tests: filtered,
        linker,
        inMemoryTasksId,
        inMemoryTasksText,
        sourcePath,
        sourceType,
        project_name,
        jiraLabels,
        opLog,
        onBusy,
        info,
        printSummary,
    });
}

export { createTestsFromTestCases, prepareTestRun, finalizeTestCreation, postProcessCheckpoint };
