vi.mock('../../../shared/ui/prompt.js', () => ({
    ask: vi.fn(),
    askFilePath: vi.fn(),
    onError: vi.fn(),
    printError: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    print: vi.fn(),
}));
vi.mock('../../../shared/logger', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    loadTypedState: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
    get: vi.fn((key?: string) => {
        if (key === 'importMode') return 'create';
        return '';
    }),
    set: vi.fn(),
}));

vi.mock('../../../shared/config-accessor.js', () => ({
    default: {
        get: configMocks.get,
        set: configMocks.set,
        getInstance: vi.fn().mockReturnValue({ get: configMocks.get }),
    },
}));

vi.mock('../../create_tests', () => ({
    default: {
        createTestsFromCsv: vi.fn(),
        createTestsFromJson: vi.fn(),
        createTestExecutionWithLinks: vi.fn(),
    },
}));

vi.mock('../test-execution-flow', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

import case01 from '../case01.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import * as promptModule from '../../../shared/ui/prompt.js';
import * as createTestsModule from '../../create_tests.js';
import * as testExecModule from '../test-execution-flow.js';
import { loadTypedState } from '../../../shared/state.js';

const mockContext = makeMockCommandContext();
const mockAsk = vi.mocked(promptModule.ask);
const mockAskFilePath = vi.mocked(promptModule.askFilePath);
const mockOnError = vi.mocked(promptModule.onError);
const mockCreateTests = vi.mocked(createTestsModule.default.createTestsFromCsv);
const mockOfferAssoc = vi.mocked(testExecModule.offerTestExecutionAssociation);
const mockShowResults = vi.mocked(testExecModule.showResults);
const mockLoadTypedState = vi.mocked(loadTypedState);
const mockReadBulk = vi.mocked(mockContext.csvResource.readBulkCsvWithMeta);
const mockGetJiraResource = vi.mocked(mockContext.jiraResource.getJiraResource);

const okResult = (inMemoryTasksId: string[] = ['task-1']) =>
    ({
        ok: true,
        result: {
            inMemoryTasksId,
            inMemoryTasksText: ['text'],
            parentIssues: [],
            sourcePath: './test_steps.csv',
            failedLinks: [],
            summary: 'imported',
            status: 'ok',
        },
    }) as never;

describe('Case01', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAsk.mockReset().mockResolvedValue('');
        mockAskFilePath.mockReset().mockResolvedValue('./test_steps.csv');
        mockOnError.mockReset();
        mockReadBulk.mockReset().mockResolvedValue({
            tests: [
                { title: 'Test 1', steps: [{ fields: { Action: 'a' } }] },
                { title: 'Test 2', steps: [{ fields: { Action: 'b' } }] },
            ],
        });
        mockGetJiraResource.mockReset();
        mockLoadTypedState.mockReturnValue({ lastCsvPath: '', lastLabels: '' });
    });

    describe('Case01 — count-driven import mode', () => {
        it('exports a handler function for menu registration', () => {
            expect(case01).toBeDefined();
            expect(typeof case01.handler).toBe('function');
        });

        it('N=0 (create all): derives create mode, no targetKeys, no key prompts', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValueOnce('0').mockResolvedValueOnce('label1,label2').mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue(okResult());

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({
                    csvPath: './test_steps.csv',
                    jiraLabels: ['label1', 'label2'],
                    project_name: 'TEST',
                    importMode: 'create',
                }),
            );
            expect(mockCreateTests.mock.calls[0]?.[0]).not.toHaveProperty('targetKeys');
            expect(configMocks.set).toHaveBeenCalledWith('targetKeys', '');
            expect(configMocks.set).toHaveBeenCalledWith('importMode', 'create');
            expect(mockGetJiraResource).not.toHaveBeenCalled();
        });

        it('Enter (empty N): derives create mode like N=0', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValue('');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(expect.objectContaining({ importMode: 'create' }));
        });

        it('N<total: derives hybrid mode and passes targetKeys in CSV order', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('JIRA-77')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockGetJiraResource.mockResolvedValue({ id: '1', fields: { summary: 'Existing' } } as never);
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'hybrid', targetKeys: ['JIRA-77'] }),
            );
            expect(configMocks.set).toHaveBeenCalledWith('targetKeys', 'JIRA-77');
            expect(configMocks.set).toHaveBeenCalledWith('importMode', 'hybrid');
            expect(mockGetJiraResource).toHaveBeenCalledWith('issue/JIRA-77');
        });

        it('N=total: derives update mode', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('2')
                .mockResolvedValueOnce('JIRA-1,JIRA-2')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockGetJiraResource.mockResolvedValue(undefined as never);
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'update', targetKeys: ['JIRA-1', 'JIRA-2'] }),
            );
        });

        it('N>total: warns and re-asks until a valid count is given', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('99')
                .mockResolvedValueOnce('0')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('maior'));
            expect(mockCreateTests).toHaveBeenCalledWith(expect.objectContaining({ importMode: 'create' }));
        });

        it('non-integer N: warns and re-asks', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('abc')
                .mockResolvedValueOnce('0')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('Valor inválido'));
            expect(mockCreateTests).toHaveBeenCalledWith(expect.objectContaining({ importMode: 'create' }));
        });

        it('declared count differs from provided keys: warns and re-asks N with collected keys hint', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('2')
                .mockResolvedValueOnce('JIRA-1')
                .mockResolvedValueOnce('0')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('exatamente'));
            expect(mockCreateTests).toHaveBeenCalledWith(expect.objectContaining({ importMode: 'create' }));
        });

        it('nonexistent key: skip keeps the key and warns only at the end', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('JIRA-404')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockGetJiraResource.mockRejectedValue(new Error('404'));
            mockOnError.mockReturnValue('skip');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'hybrid', targetKeys: ['JIRA-404'] }),
            );
            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('ignoradas'));
        });

        it('nonexistent key: abort cancels the import without calling createTestsFromCsv', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValueOnce('1').mockResolvedValueOnce('JIRA-404');
            mockGetJiraResource.mockRejectedValue(new Error('404'));
            mockOnError.mockReturnValue('abort');

            await case01.handler(mockContext);

            expect(mockCreateTests).not.toHaveBeenCalled();
            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('cancelada'));
            expect(mockContext.pushHistory).toHaveBeenCalledWith('csv-import', 'cancelada pelo usuário', 'error');
        });

        it('nonexistent key: retry re-checks until success', async () => {
            expect.hasAssertions();

            mockAsk
                .mockResolvedValueOnce('1')
                .mockResolvedValueOnce('JIRA-77')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockGetJiraResource.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({ id: '1' } as never);
            mockOnError.mockReturnValue('retry');
            mockCreateTests.mockResolvedValue(okResult([]));

            await case01.handler(mockContext);

            expect(mockGetJiraResource).toHaveBeenCalledTimes(2);
            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'hybrid', targetKeys: ['JIRA-77'] }),
            );
        });

        it('CSV pre-read failure: warns with distinguishable message and never reaches createTestsFromCsv', async () => {
            expect.hasAssertions();

            mockReadBulk.mockRejectedValueOnce(new Error('ENOENT: no such file'));
            mockAsk.mockResolvedValue('');

            await case01.handler(mockContext);

            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
            expect(mockContext.pushHistory).toHaveBeenCalledWith(
                'csv-import',
                expect.stringContaining('não encontrado'),
                'error',
            );
            expect(mockCreateTests).not.toHaveBeenCalled();
        });

        it('runs full CSV import flow and surfaces created tasks via side effects', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValueOnce('0').mockResolvedValueOnce('label1,label2').mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue(okResult(['task-1']));

            await case01.handler(mockContext);

            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({
                    csvPath: './test_steps.csv',
                    jiraLabels: ['label1', 'label2'],
                    project_name: 'TEST',
                    importMode: 'create',
                }),
            );
            expect(mockOfferAssoc).toHaveBeenCalledWith(mockContext, ['task-1'], expect.any(String), []);
            expect(mockShowResults).toHaveBeenCalledWith(mockContext, ['task-1'], expect.any(Object));
            expect(mockContext.pushHistory).toHaveBeenCalledWith('csv-import', 'imported', 'ok');
        });

        it('auto-creates Test Execution when declared in file', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValueOnce('0').mockResolvedValueOnce('label1,label2').mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue({
                ok: true,
                testExecution: { title: 'TE-Smoke', description: 'desc', labels: ['smoke'] },
                result: {
                    inMemoryTasksId: ['task-1'],
                    inMemoryTasksText: ['text'],
                    parentIssues: [],
                    sourcePath: './test_steps.csv',
                    failedLinks: [],
                    summary: '1 teste criado',
                    status: 'ok',
                },
            });
            const createTeWithLinks = vi.mocked(createTestsModule.default.createTestExecutionWithLinks);
            createTeWithLinks.mockResolvedValue({ key: 'TE-1', summary: 'TE-Smoke', linkedParentCount: 0 });

            await case01.handler(mockContext);

            expect(createTeWithLinks).toHaveBeenCalledWith(
                expect.objectContaining({
                    testKeys: ['task-1'],
                    execOpts: { title: 'TE-Smoke', description: 'desc', labels: ['smoke'] },
                }),
            );
            expect(mockOfferAssoc).not.toHaveBeenCalled();
            expect(mockShowResults).toHaveBeenCalledWith(mockContext, ['task-1'], expect.any(Object));
        });

        it('warns and records history when CSV import fails', async () => {
            expect.hasAssertions();

            mockAsk.mockResolvedValueOnce('0').mockResolvedValueOnce('label1,label2').mockResolvedValueOnce('');
            mockCreateTests.mockResolvedValue({ ok: false, reason: 'missing' } as never);

            await case01.handler(mockContext);

            expect(promptModule.warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado'));
            expect(mockContext.pushHistory).toHaveBeenCalledWith(
                'csv-import',
                expect.stringContaining('não encontrado'),
                'error',
            );
            expect(mockShowResults).not.toHaveBeenCalled();
        });
    });
});
