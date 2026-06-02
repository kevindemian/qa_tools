jest.mock('../shared/state', () => ({ update: jest.fn() }));
jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
}));

import type { TestCase, TestResult } from '../shared/types';
import type IssueLinker from './issue-linker';
import type TestCaseFactory from './test-case-factory';
import type { Logger } from '../shared/logger';
import type { JiraResourceLike } from '../shared/types';
import type { XrayStepImporter } from './xray-client';
import JiraLinkManager from './jira_link_manager';
import { nonNull } from '../shared/test-utils';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory';
import { update as updateState } from '../shared/state';
import {
    linkTestRelations,
    buildTestData,
    saveCheckpoint,
    createIssueForTest,
    executeTestCreationLoop,
} from './import-loop';

const testBase: TestCase = {
    title: 'My Test',
    steps: [{ fields: { Action: 'Click', Data: '', 'Expected Result': 'OK' } }],
};

const makeLinker = (): jest.Mocked<IssueLinker> => {
    const mockJiraResource: jest.Mocked<JiraResourceLike> = createMockJiraResource();
    const realLinkMgr = new JiraLinkManager(mockJiraResource);
    const mockLinkMgr = jest.mocked(realLinkMgr);
    mockLinkMgr.associatePrecondition = jest.fn();
    mockLinkMgr.linkIssues = jest.fn();
    return {
        associatePrecondition: jest.fn(),
        linkIssues: jest.fn(),
        updateCrossReferences: jest.fn(),
        jiraResource: mockJiraResource,
        linkManager: mockLinkMgr,
    };
};

const makeFactory = (): jest.Mocked<TestCaseFactory> => {
    const mockJiraResource: jest.Mocked<JiraResourceLike> = createMockJiraResource();
    const stepImporter: XrayStepImporter = { importStep: jest.fn() };
    return {
        createIssue: jest.fn(),
        postSteps: jest.fn(),
        jiraResource: mockJiraResource,
        stepImporter,
    };
};

const opLog = jest.mocked<Logger>({
    context: {},
    _logDir: null,
    _filePathCached: null,
    _fileError: false,
    _bytesWritten: 0,
    _maxLogSize: 0,
    _config: null,
    _ensureDir: jest.fn(),
    _rotateIfNeeded: jest.fn(),
    _writeConsole: jest.fn(),
    _writeFile: jest.fn(),
    _write: jest.fn(),
    child: jest.fn(),
    writeFileOnly: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    get filePath() {
        return '';
    },
});
const resultSink: TestResult[] = [];

beforeEach(() => {
    jest.clearAllMocks();
    resultSink.length = 0;
});

describe('linkTestRelations', () => {
    it('associatePrecondition abort -> abort/errored', async () => {
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
        expect(result).toEqual({ abort: true, errored: true });
        expect(nonNull(resultSink[0]).message).toContain('pre-condition');
    });

    it('linkIssues abort -> abort/errored', async () => {
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
        expect(result).toEqual({ abort: true, errored: true });
    });
});

describe('buildTestData', () => {
    it('without jiraLabels', () => {
        const test: TestCase = { ...testBase, description: 'desc' };
        const result = buildTestData(test, 'PROJ', []);
        expect(result.fields).toMatchObject({
            project: { key: 'PROJ' },
            summary: 'My Test',
            description: 'desc',
            issuetype: { name: 'Test' },
        });
        expect((result.fields as Record<string, unknown>).labels).toEqual([]);
    });

    it('with jiraLabels', () => {
        const test: TestCase = { ...testBase, description: 'desc' };
        const result = buildTestData(test, 'PROJ', ['label1', 'label2']);
        expect((result.fields as Record<string, unknown>).labels).toEqual(['label1', 'label2']);
    });

    it('inline precondition appended to description', () => {
        const test: TestCase = { ...testBase, precondition: { type: 'inline', value: 'must login' } };
        const result = buildTestData(test, 'PROJ', []);
        expect((result.fields as Record<string, unknown>).description).toContain('Pre-condition: must login');
    });
});

describe('saveCheckpoint', () => {
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
        jest.mocked(updateState).mockImplementationOnce(() => {
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

describe('createIssueForTest', () => {
    it('abort branch', async () => {
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

    it('retry branch returns null', async () => {
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

    it('continue branch', async () => {
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

    it('success returns key', async () => {
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
        expect(result).toEqual({ key: 'TEST-100', skipped: false });
    });
});

describe('executeTestCreationLoop', () => {
    it('main loop flow with one test', async () => {
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
            baseUrl: 'http://jira',
            opLog,
            sourcePath: '/path.csv',
            sourceType: 'csv',
            inMemoryTasksId,
            inMemoryTasksText,
            results: resultSink,
            resumeFrom: 0,
            isQuiet: () => true,
            reportInfo: jest.fn(),
            reportPrint: jest.fn(),
        });

        expect(inMemoryTasksId).toEqual(['T-NEW']);
        expect(resultSink).toHaveLength(1);
        expect(nonNull(resultSink[0]).status).toBe('ok');
    });
});
