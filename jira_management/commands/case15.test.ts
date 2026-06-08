vi.mock('../../shared/prompt');

vi.mock('../../shared/state', async () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

vi.mock('../../shared/config', () => {
    const mockGet = vi.fn();
    return {
        default: {
            get: mockGet,
            getInstance: vi.fn().mockReturnValue({ get: mockGet }),
        },
    };
});

vi.mock('../create_tests', async () => {
    const mockCreateTestsFromJson = vi.fn();
    return {
        default: {
            createTestsFromCsv: vi.fn(),
            createTestsFromJson: mockCreateTestsFromJson,
            createTestExecutionWithLinks: vi.fn(),
        },
    };
});

vi.mock('./test-execution-flow', async () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../shared/session-context', async () => ({
    resolveSessionContext: vi.fn(),
    resolveTestDataSource: vi.fn(),
}));

import type { FlatTest } from '../../shared/result_parser.js';
import type { ReportMeta, BranchEntry, Store } from '../../shared/store.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import case15 from './case15.js';
import { makeMockCommandContext } from '../../shared/test-utils.js';
import { resolveSessionContext, resolveTestDataSource } from '../../shared/session-context.js';
import createTests from '../create_tests.js';
import { showResults, offerTestExecutionAssociation } from './test-execution-flow.js';

function mockStore(): Store {
    return {
        lookup: vi.fn<(sha: string) => ReportMeta | null>().mockReturnValue(null),
        put: vi.fn<(sha: string, meta: ReportMeta) => void>(),
        saveReport: vi.fn<(sha: string, data: FlatTest[]) => void>(),
        flush: vi.fn<(message: string) => void>(),
        loadReport: vi.fn<(sha: string) => { tests: FlatTest[] } | null>().mockReturnValue(null),
        getBranch: vi.fn<(branch: string) => BranchEntry[]>().mockReturnValue([]),
        appendBranch: vi.fn<(branch: string, entry: BranchEntry) => void>(),
        listByProject: vi.fn<() => ReportMeta[]>().mockReturnValue([]),
        loadMetrics: vi.fn() as unknown as Store['loadMetrics'],
        saveMetrics: vi.fn() as unknown as Store['saveMetrics'],
    } as unknown as Store;
}

const mockContext = makeMockCommandContext();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSessionContext).mockReturnValue({
        sha: 'abc123def456',
        branch: 'main',
        store: mockStore(),
    });
    vi.mocked(createTests.createTestsFromJson).mockResolvedValue({
        inMemoryTasksId: ['TEST-1', 'TEST-2'],
        inMemoryTasksText: ['test 1', 'test 2'],
        summary: '2 testes importados',
        status: 'ok',
        sourcePath: '/tmp/resolve-abc123-12345.json',
    });
});

describe('case15 — create tests from JSON', () => {
    it('exports a handler function', async () => {
        expect(case15).toBeDefined();
        expect(typeof case15.handler).toBe('function');
    });

    it('warns and returns when no project is selected', async () => {
        const ctx = makeMockCommandContext();
        ctx.ctx.project_name = '';
        const result = await case15.handler(ctx);
        expect(result).toBeUndefined();
        expect(vi.mocked(resolveSessionContext)).not.toHaveBeenCalled();
    });

    it('uses resolveTestDataSource when SHA is available and data is found', async () => {
        const store = mockStore();
        vi.mocked(resolveSessionContext).mockReturnValue({
            sha: 'abc123def456',
            branch: 'main',
            store,
        });
        vi.mocked(resolveTestDataSource).mockResolvedValue({
            result: {
                tests: [
                    { title: 'Test 1', state: 'passed', duration: 100 },
                    { title: 'Test 2', state: 'failed', duration: 200 },
                ],
                stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 300 },
            },
            source: 'cache',
        });

        const result = await case15.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
        expect(vi.mocked(resolveTestDataSource)).toHaveBeenCalledWith(
            mockContext.ctx.project_name,
            'abc123def456',
            'main',
            store,
        );
        expect(vi.mocked(createTests.createTestsFromJson)).toHaveBeenCalled();
        expect(store.saveReport).toHaveBeenCalledWith('abc123def456', expect.any(Array));
        expect(store.put).toHaveBeenCalledWith('abc123def456', expect.objectContaining({ sha: 'abc123def456' }));
        expect(store.flush).toHaveBeenCalled();
    });

    it('falls back to CI download when cache misses', async () => {
        vi.mocked(resolveTestDataSource).mockResolvedValue({
            result: {
                tests: [{ title: 'CI Test', state: 'passed', duration: 50 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 50 },
            },
            source: 'ci',
        });

        const result = await case15.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
        expect(vi.mocked(createTests.createTestsFromJson)).toHaveBeenCalled();
    });

    it('falls back to manual path when resolveTestDataSource returns null', async () => {
        vi.mocked(resolveTestDataSource).mockResolvedValue(null);

        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('/manual/path.json');

        const result = await case15.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
        expect(vi.mocked(createTests.createTestsFromJson)).toHaveBeenCalled();
    });

    it('cancels when manual path is empty', async () => {
        vi.mocked(resolveTestDataSource).mockResolvedValue(null);
        const { ask, warn } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('');

        const result = await case15.handler(mockContext);
        expect(result).toBeUndefined();
        expect(vi.mocked(createTests.createTestsFromJson)).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalled();
    });

    it('does not call resolveTestDataSource when SHA is null', async () => {
        vi.mocked(resolveSessionContext).mockReturnValue({
            sha: null,
            branch: null,
            store: mockStore(),
        });

        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('/manual/path.json');

        const result = await case15.handler(mockContext);
        expect(result === undefined || result === true || result === false).toBe(true);
        expect(vi.mocked(resolveTestDataSource)).not.toHaveBeenCalled();
        expect(vi.mocked(createTests.createTestsFromJson)).toHaveBeenCalled();
    });

    it('displays results after successful import', async () => {
        vi.mocked(resolveTestDataSource).mockResolvedValue({
            result: {
                tests: [{ title: 'T1', state: 'passed', duration: 1 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 1 },
            },
            source: 'cache',
        });

        await case15.handler(mockContext);
        expect(offerTestExecutionAssociation).toHaveBeenCalled();
        expect(showResults).toHaveBeenCalled();
    });
});
