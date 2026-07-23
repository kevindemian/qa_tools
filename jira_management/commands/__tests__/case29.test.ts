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
    const store: Record<string, unknown> = {};
    const mockGet = vi.fn((key: string) => store[key] ?? '');
    const mockSet = vi.fn((key: string, value: unknown) => {
        store[key] = value;
    });
    return {
        default: {
            get: mockGet,
            set: mockSet,
            getInstance: vi.fn().mockReturnValue({ get: mockGet, set: mockSet }),
        },
    };
});
vi.mock('../../create_tests', () => ({
    default: {
        createTestsFromCsv: vi.fn(),
    },
}));

import case29 from '../case29.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import * as promptModule from '../../../shared/ui/prompt.js';
import * as createTestsModule from '../../create_tests.js';
import * as CONFIG from '../../../shared/config-accessor.js';

const mockContext = makeMockCommandContext();
const mockAsk = vi.mocked(promptModule.ask);
const mockAskFilePath = vi.mocked(promptModule.askFilePath);
const mockCreateTests = vi.mocked(createTestsModule.default.createTestsFromCsv);
const mockConfigSet = vi.mocked(CONFIG.default.set);

describe('Case29', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAsk.mockResolvedValue('');
        mockAskFilePath.mockResolvedValue('./test_steps.csv');
    });

    it('exports a handler function for menu registration', () => {
        expect(case29).toBeDefined();
        expect(typeof case29.handler).toBe('function');
    });

    it('sets dryRun=true before import and resets after success', async () => {
        expect.hasAssertions();

        mockCreateTests.mockResolvedValue({
            ok: true,
            result: {
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                sourcePath: './test_steps.csv',
                failedLinks: [],
                summary: 'DRY-RUN: 2 testes simulados',
                status: 'ok',
            },
        });

        await case29.handler(mockContext);

        const setCalls = mockConfigSet.mock.calls.map(([k]) => k);
        expect(setCalls).toContain('dryRun');

        const dryRunTrueCall = mockConfigSet.mock.calls.find(([k, v]) => k === 'dryRun' && v === true);
        expect(dryRunTrueCall).toBeDefined();

        const resetCall = mockConfigSet.mock.calls.find(([k, v]) => k === 'dryRun' && v === false);
        expect(resetCall).toBeDefined();
    });

    it('resets dryRun=false even when import fails', async () => {
        expect.hasAssertions();

        mockCreateTests.mockResolvedValue({ ok: false, reason: 'missing' });

        await case29.handler(mockContext);

        const resetCall = mockConfigSet.mock.calls.find(([k, v]) => k === 'dryRun' && v === false);
        expect(resetCall).toBeDefined();
    });

    it('resets dryRun=false even when import throws', async () => {
        expect.hasAssertions();

        mockCreateTests.mockRejectedValue(new Error('network error'));

        await case29.handler(mockContext);

        const resetCall = mockConfigSet.mock.calls.find(([k, v]) => k === 'dryRun' && v === false);
        expect(resetCall).toBeDefined();
    });

    it('parses target-keys from comma-separated input', async () => {
        expect.hasAssertions();

        mockAsk.mockImplementation(async (q: string) => {
            if (q.includes('Target-keys')) return 'KEY-1,KEY-2';
            return '';
        });
        mockCreateTests.mockResolvedValue({
            ok: true,
            result: {
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                sourcePath: './test_steps.csv',
                failedLinks: [],
                summary: 'DRY-RUN: 0 testes simulados',
                status: 'ok',
            },
        });

        await case29.handler(mockContext);

        expect(mockConfigSet).toHaveBeenCalledWith('targetKeys', 'KEY-1,KEY-2');
    });

    it('does not set targetKeys to a value when input is empty', async () => {
        expect.hasAssertions();

        mockAsk.mockResolvedValue('');
        mockCreateTests.mockResolvedValue({
            ok: true,
            result: {
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                sourcePath: './test_steps.csv',
                failedLinks: [],
                summary: 'DRY-RUN: 0 testes simulados',
                status: 'ok',
            },
        });

        await case29.handler(mockContext);

        const setTargetKeysCalls = mockConfigSet.mock.calls.filter(([k]) => k === 'targetKeys');
        const nonEmptySets = setTargetKeysCalls.filter(([, v]) => v !== '');
        expect(nonEmptySets).toHaveLength(0);
    });

    it('records history on success', async () => {
        expect.hasAssertions();

        mockCreateTests.mockResolvedValue({
            ok: true,
            result: {
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                sourcePath: './test_steps.csv',
                failedLinks: [],
                summary: 'DRY-RUN: 1 teste simulado',
                status: 'ok',
            },
        });

        await case29.handler(mockContext);

        expect(mockContext.pushHistory).toHaveBeenCalledWith('dry-run', 'DRY-RUN: 1 teste simulado', 'ok');
    });

    it('records history on CSV failure', async () => {
        expect.hasAssertions();

        mockCreateTests.mockResolvedValue({ ok: false, reason: 'missing' });

        await case29.handler(mockContext);

        expect(mockContext.pushHistory).toHaveBeenCalledWith(
            'dry-run',
            expect.stringContaining('não encontrado'),
            'error',
        );
    });

    it('records history on exception', async () => {
        expect.hasAssertions();

        mockCreateTests.mockRejectedValue(new Error('boom'));

        await case29.handler(mockContext);

        expect(mockContext.pushHistory).toHaveBeenCalledWith('dry-run', 'erro', 'error');
    });

    it('resets targetKeys after completion', async () => {
        expect.hasAssertions();

        mockAsk.mockImplementation(async (q: string) => {
            if (q.includes('Target-keys')) return 'KEY-1';
            return '';
        });
        mockCreateTests.mockResolvedValue({
            ok: true,
            result: {
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                sourcePath: './test_steps.csv',
                failedLinks: [],
                summary: 'DRY-RUN: 0 testes simulados',
                status: 'ok',
            },
        });

        await case29.handler(mockContext);

        const resetKeys = mockConfigSet.mock.calls.find(([k, v]) => k === 'targetKeys' && v === '');
        expect(resetKeys).toBeDefined();
    });
});
