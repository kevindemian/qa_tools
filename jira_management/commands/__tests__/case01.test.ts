vi.mock('../../../shared/ui/prompt.js', () => ({
    ask: vi.fn(),
    askFilePath: vi.fn(),
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

vi.mock('../../../shared/config-accessor.js', () => {
    const mockGet = vi.fn(() => '');
    return {
        default: {
            get: mockGet,
            getInstance: vi.fn().mockReturnValue({ get: mockGet }),
        },
    };
});

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
const mockCreateTests = vi.mocked(createTestsModule.default.createTestsFromCsv);
const mockOfferAssoc = vi.mocked(testExecModule.offerTestExecutionAssociation);
const mockShowResults = vi.mocked(testExecModule.showResults);
const mockLoadTypedState = vi.mocked(loadTypedState);

describe('Case01', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAsk.mockResolvedValue('label1,label2');
        mockAskFilePath.mockResolvedValue('./test_steps.csv');
    });

    describe('Case01 — create tests from CSV', () => {
        it('exports a handler function for menu registration', () => {
            expect(case01).toBeDefined();
            expect(typeof case01.handler).toBe('function');
        });

        it('runs full CSV import flow and surfaces created tasks via side effects', async () => {
            expect.hasAssertions();

            mockLoadTypedState.mockReturnValue({ lastCsvPath: '', lastLabels: '' });
            mockCreateTests.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: ['task-1'],
                    inMemoryTasksText: ['text'],
                    parentIssues: [],
                    sourcePath: './test_steps.csv',
                    failedLinks: [],
                    summary: '2 testes criados',
                    status: 'ok',
                },
            });

            await case01.handler(mockContext);

            // (a) createTestsFromCsv chamado com args reais derivados do contexto
            expect(mockCreateTests).toHaveBeenCalledWith(
                expect.objectContaining({
                    csvPath: './test_steps.csv',
                    jiraLabels: ['label1', 'label2'],
                    project_name: 'TEST',
                }),
            );
            // (b) efeito colateral real: tasks surfaced ao usuário
            expect(mockOfferAssoc).toHaveBeenCalledWith(mockContext, ['task-1'], expect.any(String), []);
            expect(mockShowResults).toHaveBeenCalledWith(mockContext, ['task-1'], expect.any(Object));
            // (c) histórico registrado com o summary real (não silenciado)
            expect(mockContext.pushHistory).toHaveBeenCalledWith('csv-import', '2 testes criados', 'ok');
        });

        it('auto-creates Test Execution when declared in file', async () => {
            expect.hasAssertions();

            mockLoadTypedState.mockReturnValue({ lastCsvPath: '', lastLabels: '' });
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
            createTeWithLinks.mockResolvedValue({
                key: 'TE-1',
                summary: 'TE-Smoke',
                linkedParentCount: 0,
            });

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

        it('reports associated:false and surfaces results when TE creation returns null', async () => {
            expect.hasAssertions();

            mockLoadTypedState.mockReturnValue({ lastCsvPath: '', lastLabels: '' });
            mockCreateTests.mockResolvedValue({
                ok: true,
                testExecution: { title: 'TE-Fail' },
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
            createTeWithLinks.mockResolvedValue(null);

            await case01.handler(mockContext);

            expect(mockOfferAssoc).not.toHaveBeenCalled();
            expect(mockShowResults).toHaveBeenCalledWith(mockContext, ['task-1'], { associated: false });
        });

        it('warns and records history when CSV import fails', async () => {
            expect.hasAssertions();

            mockLoadTypedState.mockReturnValue({ lastCsvPath: '', lastLabels: '' });
            mockCreateTests.mockResolvedValue({ ok: false, reason: 'missing' });

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
