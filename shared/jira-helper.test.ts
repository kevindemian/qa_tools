/** Tests for shared/jira-helper.ts — safeJiraCall. */
import { safeJiraCall } from './jira-helper.js';
import type { printError as PrintErrorFn } from './prompt.js';
import type { rootLogger } from './logger.js';
type LoggerRoot = typeof rootLogger;

const mockPushHistory = vi.fn();
const mockPrintError = vi.fn();
const mockRootLoggerError = vi.fn();

vi.mock('./prompt', () => ({
    printError: vi.fn<(...args: Parameters<typeof PrintErrorFn>) => void>((label, error) => {
        mockPrintError(label, error);
    }),
}));

vi.mock('./logger', () => ({
    rootLogger: {
        error: vi.fn<(...args: Parameters<LoggerRoot['error']>) => void>((message, meta) => {
            mockRootLoggerError(message, meta);
        }),
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
    vi.clearAllMocks();
});

describe('safeJiraCall', () => {
    it('calls fn, pushes ok history on success', async () => {
        const fn = vi.fn().mockResolvedValue(undefined);
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        const result = await safeJiraCall(ctx, 'test-op', 'v1', fn);

        expect(result).toBeTruthy();
        expect(fn).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('test-op', 'v1', 'ok');
    });

    it('logs error, pushes error history on failure', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('API error'));
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        const result = await safeJiraCall(ctx, 'test-op', 'v1', fn);

        expect(result).toBeFalsy();
        expect(mockPrintError).toHaveBeenCalled();
        expect(mockRootLoggerError).toHaveBeenCalled();
        expect(mockPushHistory).toHaveBeenCalledWith('test-op', 'v1', 'error');
    });

    it('extracts HTTP status from error response', async () => {
        const fn = vi.fn().mockRejectedValue({ response: { status: 401 } });
        const ctx = makeCtx() as Parameters<typeof safeJiraCall>[0];
        await safeJiraCall(ctx, 'test-op', 'v1', fn);

        expect(mockRootLoggerError).toHaveBeenCalledWith(
            expect.stringContaining('Erro ao'),
            expect.objectContaining({ status: 401 }),
        );
    });
});
