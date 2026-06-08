/** Import loop — iterates over test cases, creates/fetches issues, and updates state. */
import type { JsonObject, TestCase, TestResult } from '../shared/types.js';
import type TestCaseFactory from './test-case-factory.js';
import type IssueLinker from './issue-linker.js';
import { rootLogger } from '../shared/logger.js';
import { update as updateState } from '../shared/state.js';
import { JiraPayloadSchema } from './csv-import-schema.js';

interface LinkRelationsResult {
    abort: boolean;
    errored: boolean;
}

interface TestDataPayload {
    fields: {
        project: { key: string };
        summary: string;
        description: string;
        issuetype: { name: string };
        labels?: string[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

interface CheckpointData {
    project: string;
    ts: string;
    testCount: number;
    done: Array<{ key: string; title: string }>;
    jsonPath?: string;
    csvPath?: string;
}

interface StateUpdateData {
    lastLabels: string;
    lastProject: string;
    lastCsvPath?: string;
}

interface CreateIssueOptions {
    factory: TestCaseFactory;
    test: TestCase;
    testTitle: string;
    projectName: string;
    jiraLabels: string[];
    t: number;
    total: number;
    opLog: ReturnType<typeof rootLogger.child>;
    results: TestResult[];
}

async function createIssueForTest(
    opts: CreateIssueOptions,
): Promise<{ key: string | null; skipped: boolean } | 'abort' | 'continue' | null> {
    const { factory, test, testTitle, projectName, jiraLabels, t, total, opLog, results } = opts;
    const testData = buildTestData(test, projectName, jiraLabels);
    const issueResult = await factory.createIssue({
        testData,
        testTitle,
        testIdx: t,
        totalTests: total,
        opLog,
        skipExisting: true,
    });

    if (issueResult.skipped) {
        return { key: issueResult.key ?? null, skipped: true };
    }

    if ('action' in issueResult) {
        if (issueResult.action === 'abort') {
            opLog.warn('Usuario abortou apos falha na criação da issue');
            results.push({ status: 'error', label: testTitle, message: 'Falha na criação da issue' });
            return 'abort';
        }
        if (issueResult.action === 'retry') return null;
        results.push({ status: 'error', label: testTitle, message: 'Falha na criação da issue' });
        return 'continue';
    }
    return { key: issueResult.key ?? null, skipped: false };
}

interface LinkTestRelationsOptions {
    linker: IssueLinker;
    test: TestCase;
    createdTestIssue: { key: string };
    factory: TestCaseFactory;
    opLog: ReturnType<typeof rootLogger.child>;
    testTitle: string;
    results: TestResult[];
}

async function linkTestRelations(opts: LinkTestRelationsOptions): Promise<LinkRelationsResult> {
    const { linker, test, createdTestIssue, factory, opLog, testTitle, results } = opts;
    let errored = false;

    if (test.precondition && test.precondition.type === 'reference') {
        const precResult = await linker.associatePrecondition(test, createdTestIssue.key, opLog);
        if (precResult) {
            if (precResult.action === 'abort') {
                results.push({ status: 'error', label: testTitle, message: 'Falha ao associar pre-condition' });
                return { abort: true, errored: true };
            }
            errored = true;
        }
    }

    const stepsResult = await factory.postSteps(createdTestIssue.key, test, opLog);
    if (stepsResult && stepsResult.action === 'abort') {
        results.push({ status: 'error', label: testTitle, message: 'Falha ao criar steps' });
        return { abort: true, errored: true };
    }

    if (test.linkedIssues && test.linkedIssues.length > 0) {
        const linkResult = await linker.linkIssues(createdTestIssue.key, test);
        if (linkResult && linkResult.action === 'abort') {
            results.push({ status: 'error', label: testTitle, message: 'Falha ao criar linked issues' });
            return { abort: true, errored: true };
        }
    }

    return { abort: false, errored };
}

function buildTestData(test: TestCase, projectName: string, jiraLabels: string[]): TestDataPayload {
    let description = test.description || '';
    if (test.precondition && test.precondition.type === 'inline') {
        description += (description ? '\n\n' : '') + 'Pre-condition: ' + test.precondition.value;
    }

    return JiraPayloadSchema.parse({
        fields: {
            project: { key: projectName },
            summary: test.title,
            description,
            issuetype: { name: 'Test' as const },
            labels: jiraLabels,
        },
    }) as TestDataPayload;
}

interface SaveCheckpointOptions {
    sourcePath: string;
    sourceType: string;
    projectName: string;
    tests: TestCase[];
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
}

function saveCheckpoint(opts: SaveCheckpointOptions): void {
    const { sourcePath, sourceType, projectName, tests, inMemoryTasksId, inMemoryTasksText } = opts;
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    const cpSave: CheckpointData = {
        project: projectName,
        ts: new Date().toISOString(),
        testCount: tests.length,
        done: inMemoryTasksId.map((key, idx) => ({ key, title: inMemoryTasksText[idx] as string })),
    };
    cpSave[cpKey] = sourcePath;
    updateState((state) => {
        if (!state._checkpoint) state._checkpoint = {};
        Object.assign(state._checkpoint as JsonObject, cpSave);
    });
}

const BATCH_SIZE = 50;

function yieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
}

function updateFinalState(sourceType: string, sourcePath: string, projectName: string, jiraLabels: string[]): void {
    const stateUpdate: StateUpdateData = { lastLabels: jiraLabels.join(','), lastProject: projectName };
    if (sourceType !== 'json') {
        stateUpdate.lastCsvPath = sourcePath;
    }
    updateState((state) => Object.assign(state, stateUpdate));
}

export interface TestCreationLoopOptions {
    tests: TestCase[];
    factory: TestCaseFactory;
    linker: IssueLinker;
    projectName: string;
    jiraLabels: string[];
    baseUrl: string;
    opLog: ReturnType<typeof rootLogger.child>;
    sourcePath: string;
    sourceType: string;
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    results: TestResult[];
    resumeFrom: number;
    isQuiet: () => boolean;
    reportInfo: (msg: string) => void;
    reportPrint: (msg: string) => void;
}

async function notifyBatch(
    t: number,
    resumeFrom: number,
    length: number,
    isQuiet: () => boolean,
    reportInfo: (msg: string) => void,
): Promise<void> {
    if (!isQuiet())
        reportInfo('Processados ' + (t - resumeFrom + 1) + '/' + length + ' testes. Pausa para liberar memória...');
    await yieldToEventLoop();
}

interface ProcessOneTestOptions {
    t: number;
    test: TestCase;
    testTitle: string;
    factory: TestCaseFactory;
    projectName: string;
    jiraLabels: string[];
    opLog: ReturnType<typeof rootLogger.child>;
    results: TestResult[];
    linker: IssueLinker;
    baseUrl: string;
    sourcePath: string;
    sourceType: string;
    total: number;
    tests: TestCase[];
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    resumeFrom: number;
    isQuiet: () => boolean;
    reportInfo: (msg: string) => void;
    reportPrint: (msg: string) => void;
}

function recordSkippedTest(results: TestResult[], testTitle: string): void {
    results.push({ status: 'ok', label: testTitle, message: 'skipped (already exists)' });
}

async function _finalizeAfterIssueCreation(
    opts: ProcessOneTestOptions & {
        createdTestIssue: { key: string };
        issueResult: { key: string | null; skipped: boolean };
    },
): Promise<'abort' | 'continue'> {
    const {
        t,
        test,
        testTitle,
        projectName,
        factory,
        opLog,
        results,
        linker,
        baseUrl,
        sourcePath,
        sourceType,
        tests,
        inMemoryTasksId,
        inMemoryTasksText,
        resumeFrom,
        isQuiet,
        reportInfo,
        reportPrint,
        createdTestIssue,
        issueResult,
    } = opts;
    inMemoryTasksId.push(createdTestIssue.key);
    if (issueResult.skipped) {
        recordSkippedTest(results, testTitle);
        return 'continue';
    }
    saveCheckpoint({ sourcePath, sourceType, projectName, tests, inMemoryTasksId, inMemoryTasksText });
    const linkState = await linkTestRelations({ linker, test, createdTestIssue, factory, opLog, testTitle, results });
    if (linkState.abort) return 'abort';
    const testStatus = linkState.errored ? 'error' : 'ok';
    if (!isQuiet()) reportPrint('  -> ' + baseUrl + '/browse/' + createdTestIssue.key);
    results.push({ status: testStatus, label: testTitle, message: '' });
    if ((t - resumeFrom + 1) % BATCH_SIZE === 0 && t < tests.length - 1) {
        await notifyBatch(t, resumeFrom, tests.length, isQuiet, reportInfo);
    }
    return 'continue';
}

async function processCreationAndLinking(opts: ProcessOneTestOptions): Promise<'abort' | 'continue'> {
    const { test, testTitle, factory, projectName, jiraLabels, t, total, opLog, results } = opts;
    const issueResult = await createIssueForTest({
        factory,
        test,
        testTitle,
        projectName,
        jiraLabels,
        t,
        total,
        opLog,
        results,
    });
    if (!issueResult || issueResult === 'continue') return 'continue';
    if (issueResult === 'abort') return 'abort';
    return _finalizeAfterIssueCreation({
        ...opts,
        createdTestIssue: { key: issueResult.key as string },
        issueResult,
    });
}

async function executeTestCreationLoop(opts: TestCreationLoopOptions): Promise<void> {
    const {
        tests,
        factory,
        linker,
        projectName,
        jiraLabels,
        baseUrl,
        opLog,
        sourcePath,
        sourceType,
        inMemoryTasksId,
        inMemoryTasksText,
        results,
        resumeFrom,
        isQuiet,
        reportInfo,
        reportPrint,
    } = opts;

    outer: for (let t = resumeFrom; t < tests.length; t++) {
        const test = tests[t] as NonNullable<(typeof tests)[number]>;
        const testTitle = test.title;
        if (!isQuiet()) reportInfo('Criando: ' + testTitle);
        inMemoryTasksText.push(testTitle);

        const signal = await processCreationAndLinking({
            t,
            test,
            testTitle,
            factory,
            projectName,
            jiraLabels,
            opLog,
            results,
            linker,
            baseUrl,
            sourcePath,
            sourceType,
            total: tests.length,
            tests,
            inMemoryTasksId,
            inMemoryTasksText,
            resumeFrom,
            isQuiet,
            reportInfo,
            reportPrint,
        });
        if (signal === 'abort') break outer;
    }
}

export {
    createIssueForTest,
    linkTestRelations,
    buildTestData,
    saveCheckpoint,
    updateFinalState,
    executeTestCreationLoop,
};
