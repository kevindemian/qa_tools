import { offerTestExecutionAssociation, showResults } from './test-execution-flow';
import {
    createMockContext,
    createMockLinkManager,
    createMockTestExecutionCreator,
} from '../../shared/test-utils/factories';

jest.mock('../../shared/prompt', () => ({
    printError: jest.fn(),
    ask: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    success: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
}));

jest.mock('../create_tests', () => ({
    __esModule: true,
    default: {
        createTestExecutionWithLinks: jest.fn(),
    },
}));

jest.mock('../test-execution-creator', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        addTestsToExistingExecution: jest.fn(),
    })),
}));

import { ask, printError } from '../../shared/prompt';
import createTests from '../create_tests';
import TestExecutionCreator from '../test-execution-creator';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('offerTestExecutionAssociation', () => {
    it('returns not associated when testKeys is empty', async () => {
        const c = createMockContext();
        const result = await offerTestExecutionAssociation(c, [], 'src');
        expect(result.associated).toBe(false);
    });

    it('returns not associated when project_name is missing', async () => {
        const c = createMockContext();
        c.ctx.project_name = '';
        const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
        expect(result.associated).toBe(false);
    });

    describe('option 1 — create new', () => {
        it('creates a Test Execution successfully', async () => {
            jest.mocked(ask)
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('exec-name')
                .mockResolvedValueOnce('exec-title')
                .mockResolvedValueOnce('exec-desc');
            jest.mocked(createTests.createTestExecutionWithLinks).mockResolvedValue({
                key: 'TEST-TE-1',
                summary: 'Test Execution 1',
            });
            const c = createMockContext();
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result).toEqual({
                associated: true,
                key: 'TEST-TE-1',
                summary: 'Test Execution 1',
                mode: 'created',
            });
            expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'TEST-TE-1', 'ok');
        });

        it('handles error during creation', async () => {
            jest.mocked(ask)
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('exec-name')
                .mockResolvedValueOnce('exec-title')
                .mockResolvedValueOnce('exec-desc');
            jest.mocked(createTests.createTestExecutionWithLinks).mockRejectedValue(new Error('API error'));
            const c = createMockContext();
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
            expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'erro', 'error');
            expect(printError).toHaveBeenCalled();
        });
    });

    describe('option 2 — use existing', () => {
        it('uses TE from list by numeric index', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest.fn().mockResolvedValue(undefined),
                getTestCaseSummaries: jest.fn(),
            });
            const addTestsMock = jest.fn().mockResolvedValue({ key: 'TEST-TE-1', summary: 'TE 1' });
            jest.mocked(TestExecutionCreator).mockImplementationOnce(() =>
                createMockTestExecutionCreator({
                    addTestsToExistingExecution: addTestsMock,
                }),
            );
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result).toEqual({
                associated: true,
                key: 'TEST-TE-1',
                summary: 'TE 1',
                mode: 'existing',
            });
            expect(c.pushHistory).toHaveBeenCalledWith('associate-testexec', 'TEST-TE-1 (1 testes)', 'ok');
        });

        it('uses TE by manual key when list is empty', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('TEST-TE-999');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest.fn().mockResolvedValue([]),
                validateTestExecutionKey: jest.fn().mockResolvedValue(undefined),
                getTestCaseSummaries: jest.fn(),
            });
            const addTestsMock = jest.fn().mockResolvedValue({ key: 'TEST-TE-999', summary: 'Manual TE' });
            jest.mocked(TestExecutionCreator).mockImplementationOnce(() =>
                createMockTestExecutionCreator({
                    addTestsToExistingExecution: addTestsMock,
                }),
            );
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(true);
            expect(result.key).toBe('TEST-TE-999');
        });

        it('returns not associated when user enters empty key with empty list', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest.fn().mockResolvedValue([]),
                validateTestExecutionKey: jest.fn(),
                getTestCaseSummaries: jest.fn(),
            });
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
        });

        it('returns not associated when invalid index format entered for list', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('garbage');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest.fn(),
                getTestCaseSummaries: jest.fn(),
            });
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
        });

        it('validates key and retries on failure', async () => {
            jest.mocked(ask)
                .mockResolvedValueOnce('2')
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('s')
                .mockResolvedValueOnce('TEST-TE-2');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest
                    .fn()
                    .mockRejectedValueOnce(new Error('Invalid key'))
                    .mockResolvedValueOnce(undefined),
                getTestCaseSummaries: jest.fn(),
            });
            const addTestsMock = jest.fn().mockResolvedValue({ key: 'TEST-TE-2', summary: 'TE 2' });
            jest.mocked(TestExecutionCreator).mockImplementationOnce(() =>
                createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock }),
            );
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(true);
            expect(result.key).toBe('TEST-TE-2');
        });

        it('returns not associated when retry validation fails', async () => {
            jest.mocked(ask)
                .mockResolvedValueOnce('2')
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('s')
                .mockResolvedValueOnce('INVALID-KEY');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest
                    .fn()
                    .mockRejectedValueOnce(new Error('Invalid key'))
                    .mockRejectedValueOnce(new Error('Still invalid')),
                getTestCaseSummaries: jest.fn(),
            });
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
            expect(printError).toHaveBeenCalled();
        });

        it('returns not associated when retry canceled', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1').mockResolvedValueOnce('');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest.fn().mockRejectedValue(new Error('Invalid')),
                getTestCaseSummaries: jest.fn(),
            });
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
        });

        it('handles listTestExecutions failure gracefully', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('TEST-TE-1');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest.fn().mockRejectedValue(new Error('Network error')),
                validateTestExecutionKey: jest.fn().mockResolvedValue(undefined),
                getTestCaseSummaries: jest.fn(),
            });
            const addTestsMock = jest.fn().mockResolvedValue({ key: 'TEST-TE-1', summary: 'TE 1' });
            jest.mocked(TestExecutionCreator).mockImplementationOnce(() =>
                createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock }),
            );
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(true);
            expect(result.key).toBe('TEST-TE-1');
        });

        it('handles addTestsToExistingExecution error', async () => {
            jest.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1');
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                listTestExecutions: jest
                    .fn()
                    .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                validateTestExecutionKey: jest.fn().mockResolvedValue(undefined),
                getTestCaseSummaries: jest.fn(),
            });
            const addTestsMock = jest.fn().mockRejectedValue(new Error('Link error'));
            jest.mocked(TestExecutionCreator).mockImplementationOnce(() =>
                createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock }),
            );
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
            expect(c.pushHistory).toHaveBeenCalledWith('associate-testexec', 'erro', 'error');
        });
    });

    describe('option skip', () => {
        it('returns not associated when user skips (empty choice)', async () => {
            jest.mocked(ask).mockResolvedValueOnce('');
            const c = createMockContext();
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');
            expect(result.associated).toBe(false);
        });
    });
});

describe('showResults', () => {
    it('shows summaries when getTestCaseSummaries succeeds', async () => {
        const c = createMockContext();
        c.linkManager = createMockLinkManager({
            getTestCaseSummaries: jest.fn().mockResolvedValue([
                { key: 'TEST-1', summary: 'Login test' },
                { key: 'TEST-2', summary: 'Logout test' },
            ]),
        });
        await showResults(c, ['TEST-1', 'TEST-2']);
        expect(c.linkManager.getTestCaseSummaries).toHaveBeenCalledWith(['TEST-1', 'TEST-2']);
    });

    it('shows keys when getTestCaseSummaries fails', async () => {
        const c = createMockContext();
        c.linkManager = createMockLinkManager({
            getTestCaseSummaries: jest.fn().mockRejectedValue(new Error('API error')),
        });
        await showResults(c, ['TEST-1']);
    });

    it('includes TE association info when provided', async () => {
        const c = createMockContext();
        c.linkManager = createMockLinkManager({
            getTestCaseSummaries: jest.fn().mockResolvedValue([]),
        });
        await showResults(c, ['TEST-1'], {
            associated: true,
            key: 'TEST-TE-1',
            summary: 'My TE',
            mode: 'created',
        });
    });

    it('omits TE info when not associated', async () => {
        const c = createMockContext();
        c.linkManager = createMockLinkManager({
            getTestCaseSummaries: jest.fn().mockResolvedValue([]),
        });
        await showResults(c, ['TEST-1'], { associated: false });
    });

    it('limits summaries to 20 test keys', async () => {
        const keys = Array.from({ length: 25 }, (_, i) => 'TEST-' + (i + 1));
        const c = createMockContext();
        c.linkManager = createMockLinkManager({
            getTestCaseSummaries: jest
                .fn()
                .mockResolvedValue(keys.slice(0, 20).map((k: string) => ({ key: k, summary: 'Test ' + k }))),
        });
        await showResults(c, keys);
        expect(c.linkManager.getTestCaseSummaries).toHaveBeenCalledWith(keys.slice(0, 20));
    });
});
