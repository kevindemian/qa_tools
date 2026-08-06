vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');
vi.mock('../../../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    loadTypedState: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));
vi.mock('../../../shared/config-accessor.js', () => {
    const mockGet = vi.fn();
    return {
        default: { get: mockGet, set: vi.fn(), getInstance: vi.fn().mockReturnValue({ get: mockGet }) },
    };
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import case01 from '../case01.js';
import { makeMockCommandContext } from '../../../shared/test-utils.js';
import configModule from '../../../shared/config-accessor.js';
import createTestsModule from '../../create_tests.js';
import * as testExecFlow from '../test-execution-flow.js';
import { ask, onError, warn } from '../../../shared/ui/prompt.js';

const mockConfigGet = vi.spyOn(configModule, 'get');
const mockCreateTestsFromCsv = vi
    .spyOn(createTestsModule, 'createTestsFromCsv')
    .mockResolvedValue({ ok: false, reason: 'read-error' });
const mockOfferTE = vi.spyOn(testExecFlow, 'offerTestExecutionAssociation').mockResolvedValue({ associated: false });

function makeContext(overrides: Record<string, unknown> = {}) {
    return makeMockCommandContext(overrides);
}

describe('Case01.Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('FT-41a: reads config and prompts for CSV path', () => {
        it('uses Config.get csvPath when set', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvPath') return '/custom/path.csv';
                if (key === 'csvDefaultPath') return '/default/path.csv';
                return undefined;
            });
            mockCreateTestsFromCsv.mockResolvedValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'imported',
                status: 'OK',
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(
                expect.objectContaining({ csvPath: '/custom/path.csv' }),
            );
        });

        it('falls back to askFilePath when csvPath is not set', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'imported',
                status: 'OK',
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(expect.objectContaining({}));

            const csvPath = mockCreateTestsFromCsv.mock.calls[0]?.[0]?.csvPath;

            expect(typeof csvPath).toBe('string');
        });
    });

    describe('FT-41b: parses Jira labels correctly', () => {
        it('splits comma-separated labels into trimmed array', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvLabels') return ' label1 , label2 , label3 ';
                return undefined;
            });
            mockCreateTestsFromCsv.mockResolvedValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'imported',
                status: 'OK',
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(
                expect.objectContaining({ jiraLabels: ['label1', 'label2', 'label3'] }),
            );
        });

        it('passes empty array when labels input is empty', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'imported',
                status: 'OK',
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(expect.objectContaining({ jiraLabels: [] }));
        });
    });

    describe('FT-41c: stores in-memory tasks when result is truthy', () => {
        it('sets ctx inMemoryTasksId and inMemoryTasksText', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: ['TEST-1', 'TEST-2'],
                    inMemoryTasksText: ['test 1', 'test 2'],
                    summary: '2 tests imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                },
            } as never);

            const ctx = makeContext();
            await case01.handler(ctx);

            expect(ctx.ctx.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
            expect(ctx.ctx.inMemoryTasksText).toStrictEqual(['test 1', 'test 2']);
            expect(ctx.ctx.lastOperation).toBe('2 tests imported');
            expect(ctx.pushHistory).toHaveBeenCalledWith('csv-import', '2 tests imported', 'OK');
        });

        it('does not call offerTestExecution when inMemoryTasksId is empty', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: [],
                    inMemoryTasksText: [],
                    summary: 'imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                },
            } as never);

            await case01.handler(makeContext());

            expect(mockOfferTE).not.toHaveBeenCalled();
        });

        it('calls offerTestExecution when inMemoryTasksId is non-empty', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: ['TEST-1'],
                    inMemoryTasksText: ['test 1'],
                    summary: 'imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                    parentIssues: [],
                },
            } as never);

            const ctx = makeContext();
            await case01.handler(ctx);

            expect(mockOfferTE).toHaveBeenCalledWith(ctx, ['TEST-1'], expect.any(String), expect.any(Array));
        });
    });

    describe('FT-41d: handles null/undefined result from createTestsFromCsv', () => {
        it('does not throw when createTestsFromCsv returns undefined', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockResolvedValue({ ok: false, reason: 'read-error' });

            await expect(case01.handler(makeContext())).resolves.toBeUndefined();
        });

        it('does not throw when createTestsFromCsv throws', async () => {
            expect.hasAssertions();

            mockConfigGet.mockReturnValue(undefined);
            mockCreateTestsFromCsv.mockRejectedValue(new Error('Jira API error'));

            await expect(case01.handler(makeContext())).resolves.toBeUndefined();
        });
    });

    describe('FT-41e: count-driven import mode', () => {
        it('derives hybrid mode and passes targetKeys when N < total', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvPath') return '/custom/path.csv';
                if (key === 'csvDefaultPath') return '/default/path.csv';
                return undefined;
            });
            vi.mocked(ask).mockResolvedValueOnce('1');
            vi.mocked(ask).mockResolvedValueOnce('JIRA-77');
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: [],
                    inMemoryTasksText: [],
                    summary: 'imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                },
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(
                expect.objectContaining({ csvPath: '/custom/path.csv', importMode: 'hybrid', targetKeys: ['JIRA-77'] }),
            );
        });

        it('derives update mode when N equals total', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvPath') return '/custom/path.csv';
                return undefined;
            });
            vi.mocked(ask).mockResolvedValueOnce('2');
            vi.mocked(ask).mockResolvedValueOnce('JIRA-1,JIRA-2');
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: [],
                    inMemoryTasksText: [],
                    summary: 'imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                },
            } as never);

            await case01.handler(makeContext());

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'update', targetKeys: ['JIRA-1', 'JIRA-2'] }),
            );
        });

        it('aborts the import when a declared key does not exist', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvPath') return '/custom/path.csv';
                return undefined;
            });
            vi.mocked(ask).mockResolvedValueOnce('1');
            vi.mocked(ask).mockResolvedValueOnce('JIRA-404');
            const ctx = makeContext();
            vi.mocked(ctx.jiraResource.getJiraResource).mockRejectedValue(new Error('404'));

            await case01.handler(ctx);

            expect(mockCreateTestsFromCsv).not.toHaveBeenCalled();
            expect(ctx.pushHistory).toHaveBeenCalledWith('csv-import', 'cancelada pelo usuário', 'error');
        });

        it('skips a nonexistent key, keeps it in targetKeys, and warns at the end', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'csvPath') return '/custom/path.csv';
                return undefined;
            });
            vi.mocked(ask).mockResolvedValueOnce('1');
            vi.mocked(ask).mockResolvedValueOnce('JIRA-404');
            vi.mocked(onError).mockReturnValue('skip' as never);
            const ctx = makeContext();
            vi.mocked(ctx.jiraResource.getJiraResource).mockRejectedValue(new Error('404'));
            mockCreateTestsFromCsv.mockResolvedValue({
                ok: true,
                result: {
                    inMemoryTasksId: [],
                    inMemoryTasksText: [],
                    summary: 'imported',
                    status: 'OK',
                    sourcePath: '/x.csv',
                    failedLinks: [],
                },
            } as never);

            await case01.handler(ctx);

            expect(mockCreateTestsFromCsv).toHaveBeenCalledWith(
                expect.objectContaining({ importMode: 'hybrid', targetKeys: ['JIRA-404'] }),
            );
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignoradas'));
        });
    });
});
