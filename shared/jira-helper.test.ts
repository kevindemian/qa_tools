/** Tests for shared/jira-helper.ts — safeJiraCall. */
import { safeJiraCall } from './jira-helper';

const mockPushHistory = jest.fn();
const mockPrintError = jest.fn();
const mockRootLoggerError = jest.fn();

jest.mock('./prompt', () => ({
    printError: jest.fn((...args: unknown[]) => mockPrintError(...args)),
}));

jest.mock('./logger', () => ({
    rootLogger: {
        error: jest.fn((...args: unknown[]) => mockRootLoggerError(...args)),
    },
}));

function makeCtx(overrides?: Record<string, unknown>) {
    return {
        jiraResource: {},
        ctx: { project_name: 'TEST', ...overrides },
        pushHistory: mockPushHistory,
    } as ReturnType<typeof safeJiraCall extends (c: infer C, ...rest: unknown[]) => unknown ? C : never>;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('safeJiraCall', () => {
    it('calls fn, pushes ok history on success', async () => {
        const fn = jest.fn().mockResolvedValue(undefined);
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        const result = await safeJiraCall(ctx, 'test-op', 'v1', fn);
        expect(result).toBe(true);
        expect(fn).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('test-op', 'v1', 'ok');
    });

    it('logs error, pushes error history on failure', async () => {
        const fn = jest.fn().mockRejectedValue(new Error('API error'));
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        const result = await safeJiraCall(ctx, 'test-op', 'v1', fn);
        expect(result).toBe(false);
        expect(mockPrintError).toHaveBeenCalled();
        expect(mockRootLoggerError).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('test-op', 'v1', 'error');
    });

    it('extracts HTTP status from error response', async () => {
        const fn = jest.fn().mockRejectedValue({ response: { status: 401 } });
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        await safeJiraCall(ctx, 'test-op', 'v1', fn);
        expect(mockRootLoggerError).toHaveBeenCalledWith(
            expect.stringContaining('Erro ao'),
            expect.objectContaining({ status: 401 }),
        );
    });
});
