vi.mock('../shared/state', () => ({ update: vi.fn() }));
vi.mock('../shared/logger', () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    },
}));

import type { TestCase, TestResult } from '../shared/types.js';
import type { Mocked } from 'vitest';
import type IssueLinker from './issue-linker.js';
import type TestCaseFactory from './test-case-factory.js';
import type { JiraResourceLike } from '../shared/types.js';
import type { XrayStepImporter } from './xray-client.js';
import JiraLinkManager from './jira_link_manager.js';
import { nonNull } from '../shared/test-utils.js';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';
import { update as updateState } from '../shared/state.js';
import {
    linkTestRelations,
    buildTestData,
    saveCheckpoint,
    createIssueForTest,
    executeTestCreationLoop,
} from './import-loop.js';

const testBase: TestCase = {
    title: 'My Test',
    steps: [{ fields: { Action: 'Click', Data: '', 'Expected Result': 'OK' } }],
};

const makeLinker = (): Mocked<IssueLinker> => {
    const mockJiraResource: Mocked<JiraResourceLike> = createMockJiraResource();
    const realLinkMgr = new JiraLinkManager(mockJiraResource);
    const mockLinkMgr = vi.mocked(realLinkMgr);
    mockLinkMgr.associatePrecondition = vi.fn();
    mockLinkMgr.linkIssues = vi.fn();
    return {
        associatePrecondition: vi.fn(),
        linkIssues: vi.fn(),
        updateCrossReferences: vi.fn(),
        jiraResource: mockJiraResource,
        linkManager: mockLinkMgr,
    };
};

const makeFactory = (): Mocked<TestCaseFactory> => {
    const mockJiraResource: Mocked<JiraResourceLike> = createMockJiraResource();
    const stepImporter: XrayStepImporter = { importStep: vi.fn() };
    return {
        createIssue: vi.fn(),
        postSteps: vi.fn(),
        jiraResource: mockJiraResource,
        stepImporter,
    };
};

const opLog = vi.mocked({
    context: {},
    _logDir: null,
    _filePathCached: null,
    _fileError: false,
    _bytesWritten: 0,
    _maxLogSize: 0,
    _config: null,
    _ensureDir: vi.fn(),
    _rotateIfNeeded: vi.fn(),
    _writeConsole: vi.fn(),
    _writeFile: vi.fn(),
    _write: vi.fn(),
    child: vi.fn(),
    writeFileOnly: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    get filePath() {
        return '';
    },
});
const resultSink: TestResult[] = [];

describe('Import Loop', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resultSink.length = 0;
    });

    describe('LinkTestRelations', () => {
        it('associatePrecondition abort -> abort/errored', async () => {expect.hasAssertions();

            const linker = makeLinker();
            const factory = makeFactory();
            linker.associatePrecondition.mockResolvedValue({ action: 'abort' });
            factory.postSteps.mockResolvedValue(null);
            const test: TestCase = { ...testBase, precondition: { type: 'reference', value: 'PREC-1' } };
            const result = await linkTestRelations({
                linker,
                test,
                createdTestIssue: { key: 'T-1' },
                factory,
                opLog,
                testTitle: 'My Test',
                results: resultSink,
            });

            expect(result).toStrictEqual({ abort: true, errored: true });
            expect(nonNull(resultSink[0]).message).toContain('pre-condition');
        });

        it('linkIssues abort -> abort/errored', async () => {expect.hasAssertions();

            const linker = makeLinker();
            const factory = makeFactory();
            linker.associatePrecondition.mockResolvedValue(null);
            factory.postSteps.mockResolvedValue(null);
            linker.linkIssues.mockResolvedValue({ action: 'abort' });
            const test: TestCase = {
                ...testBase,
                linkedIssues: [{ key: 'BUG-1', linkType: 'Tests' }],
            };
            const result = await linkTestRelations({
                linker,
                test,
                createdTestIssue: { key: 'T-1' },
                factory,
                opLog,
                testTitle: 'My Test',
                results: resultSink,
            });

            expect(result).toStrictEqual({ abort: true, errored: true });
        });
    });

    describe('BuildTestData', () => {
        it('without jiraLabels', () => {
            const test: TestCase = { ...testBase, description: 'desc' };
            const result = buildTestData(test, 'PROJ', []);

            expect(result.fields).toMatchObject({
                project: { key: 'PROJ' },
                summary: 'My Test',
                description: 'desc',
                issuetype: { name: 'Test' },
            });
            expect((result.fields as Record<string, unknown>)['labels']).toStrictEqual([]);
        });

        it('with jiraLabels', () => {
            const test: TestCase = { ...testBase, description: 'desc' };
            const result = buildTestData(test, 'PROJ', ['label1', 'label2']);

            expect((result.fields as Record<string, unknown>)['labels']).toStrictEqual(['label1', 'label2']);
        });

        it('inline precondition appended to description', () => {
            const test: TestCase = { ...testBase, precondition: { type: 'inline', value: 'must login' } };
            const result = buildTestData(test, 'PROJ', []);

            expect((result.fields as Record<string, unknown>)['description']).toContain('Pre-condition: must login');
        });
    });

    describe('SaveCheckpoint', () => {
        it('happy path', () => {
            saveCheckpoint({
                sourcePath: '/path.csv',
                sourceType: 'csv',
                projectName: 'PROJ',
                tests: [testBase],
                inMemoryTasksId: ['T-1'],
                inMemoryTasksText: ['My Test'],
            });

            expect(updateState).toHaveBeenCalledWith(expect.any(Function));
        });

        it('file error propagates', () => {
            vi.mocked(updateState).mockImplementationOnce(() => {
                throw new Error('write failed');
            });

            expect(() =>
                saveCheckpoint({
                    sourcePath: '/path.csv',
                    sourceType: 'csv',
                    projectName: 'PROJ',
                    tests: [testBase],
                    inMemoryTasksId: ['T-1'],
                    inMemoryTasksText: ['My Test'],
                }),
            ).toThrow('write failed');
        });
    });

    describe('CreateIssueForTest', () => {
        it('abort branch', async () => {expect.hasAssertions();

            const factory = makeFactory();
            factory.createIssue.mockResolvedValue({ action: 'abort' });
            const result = await createIssueForTest({
                factory,
                test: testBase,
                testTitle: 'My Test',
                projectName: 'PROJ',
                jiraLabels: [],
                t: 0,
                total: 3,
                opLog,
                results: resultSink,
            });

            expect(result).toBe('abort');
        });

        it('retry branch returns null', async () => {expect.hasAssertions();

            const factory = makeFactory();
            factory.createIssue.mockResolvedValue({ action: 'retry' });
            const result = await createIssueForTest({
                factory,
                test: testBase,
                testTitle: 'My Test',
                projectName: 'PROJ',
                jiraLabels: [],
                t: 0,
                total: 3,
                opLog,
                results: resultSink,
            });

            expect(result).toBeNull();
        });

        it('continue branch', async () => {expect.hasAssertions();

            const factory = makeFactory();
            factory.createIssue.mockResolvedValue({ action: 'skip' });
            const result = await createIssueForTest({
                factory,
                test: testBase,
                testTitle: 'My Test',
                projectName: 'PROJ',
                jiraLabels: [],
                t: 0,
                total: 3,
                opLog,
                results: resultSink,
            });

            expect(result).toBe('continue');
        });

        it('success returns key', async () => {expect.hasAssertions();

            const factory = makeFactory();
            factory.createIssue.mockResolvedValue({ key: 'TEST-100' });
            const result = await createIssueForTest({
                factory,
                test: testBase,
                testTitle: 'My Test',
                projectName: 'PROJ',
                jiraLabels: [],
                t: 0,
                total: 3,
                opLog,
                results: resultSink,
            });

            expect(result).toStrictEqual({ key: 'TEST-100', skipped: false });
        });
    });

    describe('ExecuteTestCreationLoop', () => {
        it('main loop flow with one test', async () => {expect.hasAssertions();

            const factory = makeFactory();
            const linker = makeLinker();
            factory.createIssue.mockResolvedValue({ key: 'T-NEW' });
            linker.associatePrecondition.mockResolvedValue(null);
            factory.postSteps.mockResolvedValue(null);

            const tests = [testBase];
            const inMemoryTasksId: string[] = [];
            const inMemoryTasksText: string[] = [];

            await executeTestCreationLoop({
                tests,
                factory,
                linker,
                projectName: 'PROJ',
                jiraLabels: [],
                baseUrl: 'https://jira',
                opLog,
                sourcePath: '/path.csv',
                sourceType: 'csv',
                inMemoryTasksId,
                inMemoryTasksText,
                results: resultSink,
                resumeFrom: 0,
                isQuiet: () => true,
                reportInfo: vi.fn(),
                reportPrint: vi.fn(),
            });

            expect(inMemoryTasksId).toStrictEqual(['T-NEW']);
            expect(resultSink).toHaveLength(1);
            expect(nonNull(resultSink[0]).status).toBe('ok');
        });
    });

});
