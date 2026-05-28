/** Import loop — iterates over test cases, creates/fetches issues, and updates state. */
import type { JsonObject, TestCase, TestResult } from '../shared/types';
import type TestCaseFactory from './test-case-factory';
import type IssueLinker from './issue-linker';
import { rootLogger } from '../shared/logger';
import { update as updateState } from '../shared/state';
import { JiraPayloadSchema } from './csv-import-schema';

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
    lastJsonPath?: string;
    lastCsvPath?: string;
}

async function createIssueForTest(
    factory: TestCaseFactory,
    test: TestCase,
    testTitle: string,
    projectName: string,
    jiraLabels: string[],
    t: number,
    total: number,
    opLog: ReturnType<typeof rootLogger.child>,
    results: TestResult[],
): Promise<{ key: string | null } | 'abort' | 'continue' | null> {
    const testData = buildTestData(test, projectName, jiraLabels);
    const issueResult = await factory.createIssue(testData, testTitle, t, total, opLog);
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
    return { key: issueResult.key ?? null };
}

async function linkTestRelations(
    linker: IssueLinker,
    test: TestCase,
    createdTestIssue: { key: string },
    factory: TestCaseFactory,
    opLog: ReturnType<typeof rootLogger.child>,
    testTitle: string,
    results: TestResult[],
): Promise<LinkRelationsResult> {
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

    const testData: TestDataPayload = {
        fields: {
            project: { key: projectName },
            summary: test.title,
            description,
            issuetype: { name: 'Test' },
        },
    };

    if (jiraLabels.length > 0) {
        testData.fields.labels = jiraLabels;
    }

    return JiraPayloadSchema.parse(testData);
}

function saveCheckpoint(
    sourcePath: string,
    sourceType: string,
    projectName: string,
    tests: TestCase[],
    inMemoryTasksId: string[],
    inMemoryTasksText: string[],
): void {
    const cpKey = sourceType === 'json' ? 'jsonPath' : 'csvPath';
    const cpSave: CheckpointData = {
        project: projectName,
        ts: new Date().toISOString(),
        testCount: tests.length,
        done: inMemoryTasksId.map((key, idx) => ({ key, title: inMemoryTasksText[idx]! })),
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
    if (sourceType === 'json') {
        stateUpdate.lastJsonPath = sourcePath;
    } else {
        stateUpdate.lastCsvPath = sourcePath;
    }
    updateState((state) => Object.assign(state, stateUpdate));
}

async function executeTestCreationLoop(
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
        const test = tests[t]!;
        const testTitle = test.title;

        if (!isQuiet()) info('Criando: ' + testTitle);
        inMemoryTasksText.push(testTitle);

        const issueResult = await createIssueForTest(
            factory,
            test,
            testTitle,
            projectName,
            jiraLabels,
            t,
            tests.length,
            opLog,
            results,
        );
        if (!issueResult || issueResult === 'continue') continue;
        if (issueResult === 'abort') break outer;

        const createdTestIssue = { key: issueResult.key! };
        inMemoryTasksId.push(createdTestIssue.key);
        saveCheckpoint(sourcePath, sourceType, projectName, tests, inMemoryTasksId, inMemoryTasksText);

        const linkState = await linkTestRelations(linker, test, createdTestIssue, factory, opLog, testTitle, results);
        if (linkState.abort) break outer;

        const testStatus = linkState.errored ? 'error' : 'ok';
        if (!isQuiet()) print('  -> ' + baseUrl + '/browse/' + createdTestIssue.key);
        results.push({ status: testStatus, label: testTitle, message: '' });

        // Batch: yield to event loop every BATCH_SIZE items to prevent OOM
        if ((t - resumeFrom + 1) % BATCH_SIZE === 0 && t < tests.length - 1) {
            if (!isQuiet())
                info(
                    'Processados ' +
                        (t - resumeFrom + 1) +
                        '/' +
                        tests.length +
                        ' testes. Pausa para liberar memória...',
                );
            await yieldToEventLoop();
        }
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
