jest.mock('../../shared/prompt', () => ({
    title: jest.fn(),
    printError: jest.fn(),
    askConfirm: jest.fn(),
    ask: jest.fn(),
    info: jest.fn(),
}));

jest.mock('../../shared/bug-report', () => ({
    collectManual: jest.fn(),
    interactiveBugReportFlow: jest.fn(),
    generateBugReportFromDescription: jest.fn(),
}));

import { printError, askConfirm, ask } from '../../shared/prompt';
import { collectManual, interactiveBugReportFlow, generateBugReportFromDescription } from '../../shared/bug-report';
import type { CommandContext } from './context';
import case20 from './case20';

const mockCollectManual = collectManual as jest.Mock;
const mockInteractiveBugReportFlow = interactiveBugReportFlow as jest.Mock;
const mockAskConfirm = askConfirm as jest.Mock;
const mockAsk = ask as jest.Mock;
const mockGenerateAi = generateBugReportFromDescription as jest.Mock;

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

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockRejectedValueOnce(new Error('Sumário obrigatório'));

        await case20.handler(ctx);

        expect(printError).toHaveBeenCalledWith('Erro ao criar bug report', expect.any(Error));
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('calls collectManual and interactiveBugReportFlow, pushes history on success', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(false);
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

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockResolvedValueOnce({ summary: 'Bug B' });
        mockInteractiveBugReportFlow.mockResolvedValueOnce(null);

        await case20.handler(ctx);

        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('passes linkManager to interactiveBugReportFlow', async () => {
        const pushHistory = jest.fn();
        const linkManager = { linkIssues: jest.fn() };
        const ctx = makeCtx({ pushHistory, linkManager: linkManager as never });

        mockAskConfirm.mockResolvedValueOnce(false);
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

    it('uses AI path when askConfirm returns true', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAsk
            .mockResolvedValueOnce('Login button does nothing on Firefox 120 in production')
            .mockResolvedValueOnce('');
        mockGenerateAi.mockResolvedValueOnce({
            summary: 'Login fails',
            description: 'desc',
            source: 'manual',
            severity: 'major',
            stepsToReproduce: ['Step 1'],
            expectedResult: 'ER',
            actualResult: 'AR',
            llmEnrichment: { enrichedAt: '', model: 'fast' },
        });
        mockInteractiveBugReportFlow.mockResolvedValueOnce({
            status: 'ok',
            label: 'PROJ-2',
            message: 'Login fails',
        });

        await case20.handler(ctx);

        expect(mockGenerateAi).toHaveBeenCalledTimes(1);
        expect(mockInteractiveBugReportFlow).toHaveBeenCalledTimes(1);
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-2: Login fails', 'ok');
    });

    it('shows short description warning and cancels when user declines', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        mockAsk.mockResolvedValueOnce('Too short');

        await case20.handler(ctx);

        expect(mockGenerateAi).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('continues with AI generation after short description warning when user accepts', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
        mockAsk.mockResolvedValueOnce('Too short').mockResolvedValueOnce('');
        mockGenerateAi.mockResolvedValueOnce({
            summary: 'Short bug',
            description: 'desc',
            source: 'manual',
            severity: 'major',
            stepsToReproduce: ['Step 1'],
            expectedResult: 'ER',
            actualResult: 'AR',
            llmEnrichment: { enrichedAt: '', model: 'fast' },
        });
        mockInteractiveBugReportFlow.mockResolvedValueOnce({
            status: 'ok',
            label: 'PROJ-4',
            message: 'Short bug',
        });

        await case20.handler(ctx);

        expect(mockGenerateAi).toHaveBeenCalledTimes(1);
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-4: Short bug', 'ok');
    });

    it('parses linked issues from AI path', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAsk
            .mockResolvedValueOnce('Login button does nothing on Firefox 120 in production')
            .mockResolvedValueOnce('PROJ-123, PROJ-456');
        mockGenerateAi.mockResolvedValueOnce({
            summary: 'Login fails',
            description: 'desc',
            source: 'manual',
            severity: 'major',
            stepsToReproduce: ['Step 1'],
            expectedResult: 'ER',
            actualResult: 'AR',
            llmEnrichment: { enrichedAt: '', model: 'fast' },
        });
        mockInteractiveBugReportFlow.mockResolvedValueOnce({
            status: 'ok',
            label: 'PROJ-2',
            message: 'Login fails',
        });

        await case20.handler(ctx);

        expect(mockGenerateAi).toHaveBeenCalledTimes(1);
        const callArg = mockInteractiveBugReportFlow.mock.calls[0]![2]!;
        expect(callArg.linkedIssues).toEqual([
            { key: 'PROJ-123', linkType: 'Relates' },
            { key: 'PROJ-456', linkType: 'Relates' },
        ]);
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-2: Login fails', 'ok');
    });

    it('falls back to manual when AI generation returns null', async () => {
        const pushHistory = jest.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAsk.mockResolvedValueOnce('Checkout crashes on Safari when adding items to cart');
        mockGenerateAi.mockResolvedValueOnce(null);
        mockCollectManual.mockResolvedValueOnce({ summary: 'Manual fallback' });
        mockInteractiveBugReportFlow.mockResolvedValueOnce({
            status: 'ok',
            label: 'PROJ-3',
            message: 'Manual fallback',
        });

        await case20.handler(ctx);

        expect(mockCollectManual).toHaveBeenCalledTimes(1);
        expect(mockInteractiveBugReportFlow).toHaveBeenCalledTimes(1);
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-3: Manual fallback', 'ok');
    });
});
