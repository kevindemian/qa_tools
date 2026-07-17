vi.mock('../../../shared/prompt', () => ({
    ask: vi.fn(),
    askMultiline: vi.fn(),
    askConfirm: vi.fn(),
    info: vi.fn(),
    printError: vi.fn(),
    title: vi.fn(),
}));

vi.mock('../../../shared/bug-report', () => ({
    collectManual: vi.fn(),
    interactiveBugReportFlow: vi.fn(),
    generateBugReportFromDescription: vi.fn(),
}));

import { printError, askConfirm, ask, askMultiline } from '../../../shared/prompt.js';
import {
    collectManual,
    interactiveBugReportFlow,
    generateBugReportFromDescription,
} from '../../../shared/bug-report.js';
import type { CommandContext } from '../context.js';
import { nonNull } from '../../../shared/test-utils.js';
import { createMockContext } from '../../../shared/test-utils/factories/context-factory.js';
import { createMockLinkManager } from '../../../shared/test-utils/factories/link-manager-factory.js';
import case20 from '../case20.js';

const mockCollectManual = vi.mocked(collectManual);
const mockInteractiveBugReportFlow = vi.mocked(interactiveBugReportFlow);
const mockAskConfirm = vi.mocked(askConfirm);
const mockAsk = vi.mocked(ask);
const mockAskMultiline = vi.mocked(askMultiline);
const mockGenerateAi = vi.mocked(generateBugReportFromDescription);

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
    return { ...createMockContext({ base_url: '' }), ...overrides };
}

describe('Case20 - Bug Report handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('catches collectManual error with printError', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockRejectedValueOnce(new Error('Sumário obrigatório'));

        await case20.handler(ctx);

        expect(printError).toHaveBeenCalledWith('Erro ao criar bug report', expect.any(Error));
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('calls collectManual and interactiveBugReportFlow, pushes history on success', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockResolvedValueOnce({
            summary: 'Bug A',
            description: 'desc',
            source: 'manual',
            severity: 'major',
        });
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
            { summary: 'Bug A', description: 'desc', source: 'manual', severity: 'major' },
            ctx.linkManager,
        );
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-1: Bug A', 'ok');
    });

    it('does not push history when creation fails', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockResolvedValueOnce({
            summary: 'Bug B',
            description: 'desc',
            source: 'manual',
            severity: 'major',
        });
        mockInteractiveBugReportFlow.mockResolvedValueOnce(null);

        await case20.handler(ctx);

        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('passes linkManager to interactiveBugReportFlow', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const linkManager = createMockLinkManager();
        const ctx = makeCtx({ pushHistory, linkManager });

        mockAskConfirm.mockResolvedValueOnce(false);
        mockCollectManual.mockResolvedValueOnce({
            summary: 'Bug C',
            description: 'desc',
            source: 'manual',
            severity: 'major',
        });
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
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAskMultiline.mockResolvedValueOnce('Login button does nothing on Firefox 120 in production');
        mockAsk.mockResolvedValueOnce('');
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
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        mockAskMultiline.mockResolvedValueOnce('Too short');

        await case20.handler(ctx);

        expect(mockGenerateAi).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('continues with AI generation after short description warning when user accepts', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
        mockAskMultiline.mockResolvedValueOnce('Too short');
        mockAsk.mockResolvedValueOnce('');
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
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAskMultiline.mockResolvedValueOnce('Login button does nothing on Firefox 120 in production');
        mockAsk.mockResolvedValueOnce('PROJ-123, PROJ-456');
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

        const callArg = nonNull(nonNull(mockInteractiveBugReportFlow.mock.calls[0])[2]);

        expect(callArg.linkedIssues).toStrictEqual([
            { key: 'PROJ-123', linkType: 'Relates' },
            { key: 'PROJ-456', linkType: 'Relates' },
        ]);
        expect(pushHistory).toHaveBeenCalledWith('bug-report', 'PROJ-2: Login fails', 'ok');
    });

    it('falls back to manual when AI generation returns null', async () => {
        expect.hasAssertions();

        const pushHistory = vi.fn();
        const ctx = makeCtx({ pushHistory });

        mockAskConfirm.mockResolvedValueOnce(true);
        mockAskMultiline.mockResolvedValueOnce('Checkout crashes on Safari when adding items to cart');
        mockGenerateAi.mockResolvedValueOnce(null);
        mockCollectManual.mockResolvedValueOnce({
            summary: 'Manual fallback',
            description: 'desc',
            source: 'manual',
            severity: 'major',
        });
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
