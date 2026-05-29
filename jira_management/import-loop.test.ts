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

import type { TestCase } from '../shared/types';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock objects
const makeLinker = (): any => ({
    associatePrecondition: jest.fn(),
    linkIssues: jest.fn(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock objects
const makeFactory = (): any => ({
    createIssue: jest.fn(),
    postSteps: jest.fn(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock logger
const opLog: any = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- result accumulator
const resultSink: any[] = [];

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
        const result = await linkTestRelations(linker, test, { key: 'T-1' }, factory, opLog, 'My Test', resultSink);
        expect(result).toEqual({ abort: true, errored: true });
        expect(resultSink[0].message).toContain('pre-condition');
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
        const result = await linkTestRelations(linker, test, { key: 'T-1' }, factory, opLog, 'My Test', resultSink);
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
        expect((result.fields as Record<string, unknown>).labels).toBeUndefined();
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
        saveCheckpoint('/path.csv', 'csv', 'PROJ', [testBase], ['T-1'], ['My Test']);
        expect(updateState).toHaveBeenCalledWith(expect.any(Function));
    });

    it('file error propagates', () => {
        jest.mocked(updateState).mockImplementationOnce(() => {
            throw new Error('write failed');
        });
        expect(() => saveCheckpoint('/path.csv', 'csv', 'PROJ', [testBase], ['T-1'], ['My Test'])).toThrow(
            'write failed',
        );
    });
});

describe('createIssueForTest', () => {
    it('abort branch', async () => {
        const factory = makeFactory();
        factory.createIssue.mockResolvedValue({ action: 'abort' });
        const result = await createIssueForTest(factory, testBase, 'My Test', 'PROJ', [], 0, 3, opLog, resultSink);
        expect(result).toBe('abort');
    });

    it('retry branch returns null', async () => {
        const factory = makeFactory();
        factory.createIssue.mockResolvedValue({ action: 'retry' });
        const result = await createIssueForTest(factory, testBase, 'My Test', 'PROJ', [], 0, 3, opLog, resultSink);
        expect(result).toBeNull();
    });

    it('continue branch', async () => {
        const factory = makeFactory();
        factory.createIssue.mockResolvedValue({ action: 'skip' });
        const result = await createIssueForTest(factory, testBase, 'My Test', 'PROJ', [], 0, 3, opLog, resultSink);
        expect(result).toBe('continue');
    });

    it('success returns key', async () => {
        const factory = makeFactory();
        factory.createIssue.mockResolvedValue({ key: 'TEST-100' });
        const result = await createIssueForTest(factory, testBase, 'My Test', 'PROJ', [], 0, 3, opLog, resultSink);
        expect(result).toEqual({ key: 'TEST-100' });
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

        await executeTestCreationLoop(
            tests,
            factory,
            linker,
            'PROJ',
            [],
            'http://jira',
            opLog,
            '/path.csv',
            'csv',
            inMemoryTasksId,
            inMemoryTasksText,
            resultSink,
            0,
            () => true,
            jest.fn(),
            jest.fn(),
        );

        expect(inMemoryTasksId).toEqual(['T-NEW']);
        expect(resultSink).toHaveLength(1);
        expect(resultSink[0].status).toBe('ok');
    });
});
