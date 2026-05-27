jest.mock('../../shared/prompt', () => ({
    title: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../../shared/bug-report', () => ({
    collectManual: jest.fn(),
    interactiveBugReportFlow: jest.fn(),
}));

import { printError } from '../../shared/prompt';
import { collectManual, interactiveBugReportFlow } from '../../shared/bug-report';
import type { CommandContext } from './context';
import case20 from './case20';

const mockCollectManual = collectManual as jest.Mock;
const mockInteractiveBugReportFlow = interactiveBugReportFlow as jest.Mock;

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
    return {
        jiraResource: {} as never,
        jiraResourceXray: {} as never,
        linkManager: {} as never,
        linkManagerXray: {} as never,
        csvResource: {} as never,
        ctx: { project_name: 'TEST' } as never,
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: '',
        sessionLog: {} as never,
        ...overrides,
    };
}

describe('case20 - Bug Report handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('catches collectManual error with printError', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockCollectManual.mockRejectedValueOnce(new Error('Sumário obrigatório'));

        await case20.handler(ctx);

        expect(printError).toHaveBeenCalledWith('Erro ao criar bug report', expect.any(Error));
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('calls collectManual and interactiveBugReportFlow, pushes history on success', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockCollectManual.mockResolvedValueOnce({ summary: 'Bug A' });
        mockInteractiveBugReportFlow.mockResolvedValueOnce({
            status: 'ok',
            label: 'PROJ-1',
            message: 'Bug A',
        });

        await case20.handler(ctx);

        expect(mockCollectManual).toHaveBeenCalledTimes(1);
        expect(mockInteractiveBugReportFlow).toHaveBeenCalledWith(
            ctx.jiraResource,
            'TEST',
            { summary: 'Bug A' },
            ctx.linkManager,
        );
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-1: Bug A', 'ok');
    });

    it('does not push history when creation fails', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockCollectManual.mockResolvedValueOnce({ summary: 'Bug B' });
        mockInteractiveBugReportFlow.mockResolvedValueOnce(null);

        await case20.handler(ctx);

        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('passes linkManager to interactiveBugReportFlow', async () => {
        const pushHistory = jest.fn();
        const linkManager = { linkIssues: jest.fn() };
        const ctx = makeCtx({ pushHistory, linkManager: linkManager as never });

        mockCollectManual.mockResolvedValueOnce({ summary: 'Bug C' });
        mockInteractiveBugReportFlow.mockResolvedValueOnce(null);

        await case20.handler(ctx);

        expect(mockInteractiveBugReportFlow).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            expect.anything(),
            linkManager,
        );
    });
});
