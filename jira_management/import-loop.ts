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
    failedLinkKeys: string[];
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
    checkOnly?: boolean;
}

async function createIssueForTest(
    opts: CreateIssueOptions,
): Promise<
    { key: string | null; skipped: boolean; updated?: boolean; cleanSlateUsed?: boolean } | 'abort' | 'continue' | null
> {
    const { factory, test, testTitle, projectName, jiraLabels, t, total, opLog, results, checkOnly } = opts;
    const testData = buildTestData(test, projectName, jiraLabels);
    const issueResult = await factory.createIssue({
        testData,
        testTitle,
        testIdx: t,
        totalTests: total,
        opLog,
        skipExisting: true,
        ...(checkOnly !== undefined ? { checkOnly } : {}),
    });

    if (issueResult.updated) {
        return {
            key: issueResult.key ?? null,
            skipped: false,
            updated: true,
            ...(issueResult.cleanSlateUsed ? { cleanSlateUsed: true } : {}),
        };
    }

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
    replaceSteps?: boolean;
}

async function linkTestRelations(opts: LinkTestRelationsOptions): Promise<LinkRelationsResult> {
    const { linker, test, createdTestIssue, factory, opLog, testTitle, results, replaceSteps } = opts;
    let errored = false;
    const failedLinkKeys: string[] = [];

    const precOutcome = await _associatePrecondition(linker, test, createdTestIssue.key, opLog, testTitle, results);
    if (precOutcome) {
        if (precOutcome.abort) return { abort: true, errored: true, failedLinkKeys: precOutcome.keys };
        errored = true;
        failedLinkKeys.push(...precOutcome.keys);
    }

    const stepsResult = await factory.postSteps(createdTestIssue.key, test, opLog, replaceSteps);
    if (stepsResult && stepsResult.action === 'abort') {
        results.push({ status: 'error', label: testTitle, message: 'Falha ao criar steps' });
        return { abort: true, errored: true, failedLinkKeys };
    }

    const linkOutcome = await _linkReferencedIssues(linker, test, createdTestIssue.key, testTitle, results);
    if (linkOutcome) {
        if (linkOutcome.abort) return { abort: true, errored: true, failedLinkKeys: linkOutcome.keys };
    }

    return { abort: false, errored, failedLinkKeys };
}

interface RelationOutcome {
    abort: boolean;
    keys: string[];
}

async function _associatePrecondition(
    linker: IssueLinker,
    test: TestCase,
    createdKey: string,
    opLog: ReturnType<typeof rootLogger.child>,
    testTitle: string,
    results: TestResult[],
): Promise<RelationOutcome | null> {
    if (!test.precondition || !test.precondition.some((p) => p.type === 'reference')) return null;

    const refs = test.precondition.filter((p) => p.type === 'reference').map((p) => p.value);
    const precResult = await linker.associatePrecondition(test, createdKey, opLog);
    if (!precResult) return null;

    if (precResult.action === 'abort') {
        const keys = precResult.missingKey ? [precResult.missingKey] : refs;
        results.push({
            status: 'error',
            label: testTitle,
            message: 'Falha ao associar pre-condition: ' + keys.join(', '),
        });
        return { abort: true, keys };
    }

    return { abort: false, keys: refs };
}

async function _linkReferencedIssues(
    linker: IssueLinker,
    test: TestCase,
    createdKey: string,
    testTitle: string,
    results: TestResult[],
): Promise<RelationOutcome | null> {
    if (!test.linkedIssues || test.linkedIssues.length === 0) return null;

    const linkKeys = test.linkedIssues.map((l) => l.key);
    const linkResult = await linker.linkIssues(createdKey, test);
    if (!linkResult) return null;

    if (linkResult.action === 'abort') {
        const keys = linkResult.missingKey ? linkResult.missingKey.split(', ') : linkKeys;
        results.push({
            status: 'error',
            label: testTitle,
            message: 'Falha ao criar linked issues: ' + keys.join(', '),
        });
        return { abort: true, keys };
    }

    return { abort: false, keys: linkKeys };
}

function buildTestData(test: TestCase, projectName: string, jiraLabels: string[]): TestDataPayload {
    let description = test.description || '';
    if (test.precondition && test.precondition.length > 0) {
        const inline = test.precondition.filter((p) => p.type === 'inline').map((p) => p.value);
        if (inline.length > 0) {
            description += (description ? '\n\n' : '') + 'Pre-condition: ' + inline.join('\n');
        }
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
        done: inMemoryTasksId.map((key, idx) => ({ key, title: Reflect.get(inMemoryTasksText, idx) })),
    };
    const cpSaveEntries = Object.entries(cpSave);
    cpSaveEntries.push([cpKey, sourcePath]);
    updateState((state) => {
        if (!state['_checkpoint']) state['_checkpoint'] = {};
        Object.assign(state['_checkpoint'] as JsonObject, Object.fromEntries(cpSaveEntries));
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
    failedLinks: string[];
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
    failedLinks: string[];
    isCheckpoint?: boolean;
}

function recordSkippedTest(results: TestResult[], testTitle: string): void {
    results.push({ status: 'ok', label: testTitle, message: 'skipped (already exists)' });
}

async function _finalizeAfterIssueCreation(
    opts: ProcessOneTestOptions & {
        createdTestIssue: { key: string };
        issueResult: { key: string | null; skipped: boolean; updated?: boolean; cleanSlateUsed?: boolean };
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
        failedLinks,
        createdTestIssue,
        issueResult,
    } = opts;
    if (!opts.isCheckpoint) inMemoryTasksId.push(createdTestIssue.key);
    if (issueResult.skipped && !issueResult.updated) {
        recordSkippedTest(results, testTitle);
        return 'continue';
    }
    if (!issueResult.skipped && !opts.isCheckpoint) {
        saveCheckpoint({ sourcePath, sourceType, projectName, tests, inMemoryTasksId, inMemoryTasksText });
    }

    // When clean-slate was used, all fields (steps, preconditions, links) were already
    // cleared and rebuilt atomically — skip linkTestRelations to avoid duplication.
    if (issueResult.cleanSlateUsed) {
        rootLogger.info(
            'clean-slate: pulando linkTestRelations para ' + createdTestIssue.key + ' (campos ja reescritos)',
        );
        if (!isQuiet()) reportPrint('  -> ' + baseUrl + '/browse/' + createdTestIssue.key);
        results.push({ status: 'ok', label: testTitle, message: 'clean-slate update' });
        if ((t - resumeFrom + 1) % BATCH_SIZE === 0 && t < tests.length - 1) {
            await notifyBatch(t, resumeFrom, tests.length, isQuiet, reportInfo);
        }
        return 'continue';
    }

    const linkState = await linkTestRelations({
        linker,
        test,
        createdTestIssue,
        factory,
        opLog,
        testTitle,
        results,
        ...(issueResult.updated ? { replaceSteps: true } : {}),
    });
    if (linkState.failedLinkKeys.length) failedLinks.push(...linkState.failedLinkKeys);
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
    const {
        test,
        testTitle,
        factory,
        projectName,
        jiraLabels,
        t,
        total,
        opLog,
        results,
        isCheckpoint,
        inMemoryTasksId,
    } = opts;
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
        ...(isCheckpoint !== undefined ? { checkOnly: isCheckpoint } : {}),
    });
    if (!issueResult || issueResult === 'continue') {
        if (!isCheckpoint) inMemoryTasksId.push('');
        return 'continue';
    }
    if (issueResult === 'abort') return 'abort';
    const { updated, cleanSlateUsed, ...rest } = issueResult;
    const issueResultTyped: { key: string | null; skipped: boolean; updated?: boolean; cleanSlateUsed?: boolean } = {
        ...rest,
        ...(updated !== undefined ? { updated } : {}),
        ...(cleanSlateUsed !== undefined ? { cleanSlateUsed } : {}),
    };
    if (isCheckpoint && !issueResult.updated) return 'continue';
    return _finalizeAfterIssueCreation({
        ...opts,
        createdTestIssue: { key: issueResult.key as string },
        issueResult: issueResultTyped,
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
        failedLinks,
    } = opts;

    for (let t = 0; t < tests.length; t++) {
        const test = Reflect.get(tests, t);
        const testTitle = test.title;
        const isCheckpoint = t < resumeFrom;
        if (!isQuiet()) reportInfo((isCheckpoint ? 'Verificando: ' : 'Criando: ') + testTitle);
        if (!isCheckpoint) inMemoryTasksText.push(testTitle);
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
            failedLinks,
            isCheckpoint,
        });
        if (signal === 'abort') break;
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
