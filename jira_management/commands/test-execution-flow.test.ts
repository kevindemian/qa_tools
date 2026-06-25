import { offerTestExecutionAssociation, showResults } from './test-execution-flow.js';
import {
    createMockContext,
    createMockLinkManager,
    createMockTestExecutionCreator,
} from '../../shared/test-utils/factories/index.js';

vi.mock('../../shared/prompt', () => ({
    printError: vi.fn(),
    ask: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
}));

const { mockCreateTestExecutionWithLinks } = vi.hoisted(() => ({
    mockCreateTestExecutionWithLinks: vi.fn(),
}));

vi.mock('../create_tests', () => ({
    default: {
        createTestExecutionWithLinks: mockCreateTestExecutionWithLinks,
    },
    createTestExecutionWithLinks: mockCreateTestExecutionWithLinks,
}));

vi.mock('../test-execution-creator', () => ({
    default: vi.fn(function () {
        return { addTestsToExistingExecution: vi.fn() };
    }),
}));

import { ask, printError } from '../../shared/prompt.js';
import TestExecutionCreator from '../test-execution-creator.js';

describe('Test Execution Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('OfferTestExecutionAssociation', () => {
        it('returns not associated when testKeys is empty', async () => {expect.hasAssertions();

            const c = createMockContext();
            const result = await offerTestExecutionAssociation(c, [], 'src');

            expect(result.associated).toBeFalsy();
        });

        it('returns not associated when project_name is missing', async () => {expect.hasAssertions();

            const c = createMockContext();
            c.ctx.project_name = '';
            const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

            expect(result.associated).toBeFalsy();
        });

        describe('Option 1 — create new', () => {
            it('creates a Test Execution successfully', async () => {expect.hasAssertions();

                vi.mocked(ask)
                    .mockResolvedValueOnce('1')
                    .mockResolvedValueOnce('exec-name')
                    .mockResolvedValueOnce('exec-title')
                    .mockResolvedValueOnce('exec-desc');
                mockCreateTestExecutionWithLinks.mockResolvedValue({
                    key: 'TEST-TE-1',
                    summary: 'Test Execution 1',
                });
                const c = createMockContext();
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result).toStrictEqual({
                    associated: true,
                    key: 'TEST-TE-1',
                    summary: 'Test Execution 1',
                    mode: 'created',
                });
                expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'TEST-TE-1', 'ok');
            });

            it('handles error during creation', async () => {expect.hasAssertions();

                vi.mocked(ask)
                    .mockResolvedValueOnce('1')
                    .mockResolvedValueOnce('exec-name')
                    .mockResolvedValueOnce('exec-title')
                    .mockResolvedValueOnce('exec-desc');
                mockCreateTestExecutionWithLinks.mockRejectedValue(new Error('API error'));
                const c = createMockContext();
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
                expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'erro', 'error');
                expect(printError).toHaveBeenCalled();
            });
        });

        describe('Option 2 — use existing', () => {
            it('uses TE from list by numeric index', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi.fn().mockResolvedValue(undefined),
                    getTestCaseSummaries: vi.fn(),
                });
                const addTestsMock = vi.fn().mockResolvedValue({ key: 'TEST-TE-1', summary: 'TE 1' });
                vi.mocked(TestExecutionCreator).mockImplementationOnce(function () {
                    return createMockTestExecutionCreator({
                        addTestsToExistingExecution: addTestsMock,
                    });
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result).toStrictEqual({
                    associated: true,
                    key: 'TEST-TE-1',
                    summary: 'TE 1',
                    mode: 'existing',
                });
                expect(c.pushHistory).toHaveBeenCalledWith('associate-testexec', 'TEST-TE-1 (1 testes)', 'ok');
            });

            it('uses TE by manual key when list is empty', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('TEST-TE-999');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi.fn().mockResolvedValue([]),
                    validateTestExecutionKey: vi.fn().mockResolvedValue(undefined),
                    getTestCaseSummaries: vi.fn(),
                });
                const addTestsMock = vi.fn().mockResolvedValue({ key: 'TEST-TE-999', summary: 'Manual TE' });
                vi.mocked(TestExecutionCreator).mockImplementationOnce(function () {
                    return createMockTestExecutionCreator({
                        addTestsToExistingExecution: addTestsMock,
                    });
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeTruthy();
                expect(result.key).toBe('TEST-TE-999');
            });

            it('returns not associated when user enters empty key with empty list', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi.fn().mockResolvedValue([]),
                    validateTestExecutionKey: vi.fn(),
                    getTestCaseSummaries: vi.fn(),
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
            });

            it('returns not associated when invalid index format entered for list', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('garbage');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi.fn(),
                    getTestCaseSummaries: vi.fn(),
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
            });

            it('validates key and retries on failure', async () => {expect.hasAssertions();

                vi.mocked(ask)
                    .mockResolvedValueOnce('2')
                    .mockResolvedValueOnce('1')
                    .mockResolvedValueOnce('s')
                    .mockResolvedValueOnce('TEST-TE-2');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi
                        .fn()
                        .mockRejectedValueOnce(new Error('Invalid key'))
                        .mockResolvedValueOnce(undefined),
                    getTestCaseSummaries: vi.fn(),
                });
                const addTestsMock = vi.fn().mockResolvedValue({ key: 'TEST-TE-2', summary: 'TE 2' });
                vi.mocked(TestExecutionCreator).mockImplementationOnce(function () {
                    return createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock });
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeTruthy();
                expect(result.key).toBe('TEST-TE-2');
            });

            it('returns not associated when retry validation fails', async () => {expect.hasAssertions();

                vi.mocked(ask)
                    .mockResolvedValueOnce('2')
                    .mockResolvedValueOnce('1')
                    .mockResolvedValueOnce('s')
                    .mockResolvedValueOnce('INVALID-KEY');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi
                        .fn()
                        .mockRejectedValueOnce(new Error('Invalid key'))
                        .mockRejectedValueOnce(new Error('Still invalid')),
                    getTestCaseSummaries: vi.fn(),
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
                expect(printError).toHaveBeenCalled();
            });

            it('returns not associated when retry canceled', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1').mockResolvedValueOnce('');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi.fn().mockRejectedValue(new Error('Invalid')),
                    getTestCaseSummaries: vi.fn(),
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
            });

            it('handles listTestExecutions failure gracefully', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('TEST-TE-1');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi.fn().mockRejectedValue(new Error('Network error')),
                    validateTestExecutionKey: vi.fn().mockResolvedValue(undefined),
                    getTestCaseSummaries: vi.fn(),
                });
                const addTestsMock = vi.fn().mockResolvedValue({ key: 'TEST-TE-1', summary: 'TE 1' });
                vi.mocked(TestExecutionCreator).mockImplementationOnce(function () {
                    return createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock });
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeTruthy();
                expect(result.key).toBe('TEST-TE-1');
            });

            it('handles addTestsToExistingExecution error', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('2').mockResolvedValueOnce('1');
                const c = createMockContext();
                c.linkManager = createMockLinkManager({
                    listTestExecutions: vi
                        .fn()
                        .mockResolvedValue([{ key: 'TEST-TE-1', summary: 'TE 1', created: '2024-01-01', status: 'DONE' }]),
                    validateTestExecutionKey: vi.fn().mockResolvedValue(undefined),
                    getTestCaseSummaries: vi.fn(),
                });
                const addTestsMock = vi.fn().mockRejectedValue(new Error('Link error'));
                vi.mocked(TestExecutionCreator).mockImplementationOnce(function () {
                    return createMockTestExecutionCreator({ addTestsToExistingExecution: addTestsMock });
                });
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
                expect(c.pushHistory).toHaveBeenCalledWith('associate-testexec', 'erro', 'error');
            });
        });

        describe('Option skip', () => {
            it('returns not associated when user skips (empty choice)', async () => {expect.hasAssertions();

                vi.mocked(ask).mockResolvedValueOnce('');
                const c = createMockContext();
                const result = await offerTestExecutionAssociation(c, ['TEST-1'], 'src');

                expect(result.associated).toBeFalsy();
            });
        });
    });

    describe('ShowResults', () => {
        it('shows summaries when getTestCaseSummaries succeeds', async () => {expect.hasAssertions();

            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                getTestCaseSummaries: vi.fn().mockResolvedValue([
                    { key: 'TEST-1', summary: 'Login test' },
                    { key: 'TEST-2', summary: 'Logout test' },
                ]),
            });
            await showResults(c, ['TEST-1', 'TEST-2']);

            expect(c.linkManager['getTestCaseSummaries']).toHaveBeenCalledWith(['TEST-1', 'TEST-2']);
        });

        it('shows keys when getTestCaseSummaries fails', async () => {expect.hasAssertions();

            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                getTestCaseSummaries: vi.fn().mockRejectedValue(new Error('API error')),
            });
            await showResults(c, ['TEST-1']);

            const prompt = await import('../../shared/prompt.js');

            expect(prompt.info).toHaveBeenCalled();
        });

        it('includes TE association info when provided', async () => {expect.hasAssertions();

            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                getTestCaseSummaries: vi.fn().mockResolvedValue([]),
            });
            await showResults(c, ['TEST-1'], {
                associated: true,
                key: 'TEST-TE-1',
                summary: 'My TE',
                mode: 'created',
            });

            const prompt = await import('../../shared/prompt.js');

            expect(prompt.info).toHaveBeenCalled();
        });

        it('omits TE info when not associated', async () => {expect.hasAssertions();

            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                getTestCaseSummaries: vi.fn().mockResolvedValue([]),
            });
            await showResults(c, ['TEST-1'], { associated: false });

            const prompt = await import('../../shared/prompt.js');

            expect(prompt.info).toHaveBeenCalled();
        });

        it('limits summaries to 20 test keys', async () => {expect.hasAssertions();

            const keys = Array.from({ length: 25 }, (_, i) => 'TEST-' + (i + 1));
            const c = createMockContext();
            c.linkManager = createMockLinkManager({
                getTestCaseSummaries: vi
                    .fn()
                    .mockResolvedValue(keys.slice(0, 20).map((k: string) => ({ key: k, summary: 'Test ' + k }))),
            });
            await showResults(c, keys);

            expect(c.linkManager['getTestCaseSummaries']).toHaveBeenCalledWith(keys.slice(0, 20));
        });
    });

});
