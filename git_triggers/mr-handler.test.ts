jest.mock('../shared/prompt', () => ({
    print: jest.fn(),
    success: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    prompt: jest.fn(),
    confirm: jest.fn(),
    printError: jest.fn(),
    withSpinner: jest.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    divider: jest.fn(),
}));

jest.mock('./session-state', () => ({
    currentProvider: 'gitlab',
    pushHistory: jest.fn(),
}));

jest.mock('./ai-pr-desc', () => ({ generatePrDescription: jest.fn() }));
jest.mock('./ai-test-impact', () => ({ assessTestImpact: jest.fn() }));
jest.mock('./nivelar', () => ({ nivelarBranches: jest.fn() }));

jest.mock('../shared/config', () => ({
    default: { cypressProjectPath: '/cypress' },
}));

import { print, success, warn, info, prompt, confirm, printError, withSpinner, divider } from '../shared/prompt';
import { pushHistory } from './session-state';
import { generatePrDescription } from './ai-pr-desc';
import { assessTestImpact } from './ai-test-impact';
import { nivelarBranches } from './nivelar';
import { handleCreateMR, handleListApprovedMRs, handleMergeMR, nivelarBranchesWrapper } from './mr-handler';
import type { SessionContext } from '../shared/session-context';
import type { GitProvider, MergeRequestInfo } from '../shared/types';

const mockPrompt = prompt as jest.Mock;
const mockConfirm = confirm as jest.Mock;
const mockPrintError = printError as jest.Mock;
const mockGeneratePrDesc = generatePrDescription as jest.Mock;
const mockAssessImpact = assessTestImpact as jest.Mock;
const mockNivelar = nivelarBranches as jest.Mock;

const ctx = {} as SessionContext;
const mockM = {
    createMergeRequest: jest.fn(),
    searchMergeRequests: jest.fn(),
    isApproved: jest.fn(),
    acceptMergeRequest: jest.fn(),
} as unknown as GitProvider;

beforeEach(() => {
    jest.clearAllMocks();
    mockPrompt.mockReturnValue('test-branch');
    mockConfirm.mockReturnValue(false);
});

describe('nivelarBranchesWrapper', () => {
    it('delegates to nivelarBranches', async () => {
        await nivelarBranchesWrapper(mockM);
        expect(mockNivelar).toHaveBeenCalledWith(mockM, { pushHistory: expect.any(Function) });
    });
});

describe('handleCreateMR', () => {
    it('creates MR with manual description', async () => {
        mockConfirm.mockReturnValueOnce(false);
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Manual desc');
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(ctx, mockM);

        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'Manual desc');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/merge/1'));
    });

    it('uses AI description when available', async () => {
        mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        mockGeneratePrDesc.mockResolvedValue('AI generated description');
        mockPrompt.mockReturnValueOnce('feat').mockReturnValueOnce('main').mockReturnValueOnce('Title');
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(ctx, mockM);

        expect(mockGeneratePrDesc).toHaveBeenCalled();
        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'AI generated description');
    });

    it('falls back to manual when AI returns empty', async () => {
        mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        mockGeneratePrDesc.mockResolvedValue('');
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Manual desc');
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(ctx, mockM);

        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'Manual desc');
        expect(warn).toHaveBeenCalled();
    });

    it('includes test impact analysis when requested', async () => {
        mockConfirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockAssessImpact.mockResolvedValue('Impact: tests affected');
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        (mockM.createMergeRequest as jest.Mock).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(ctx, mockM);

        expect(mockAssessImpact).toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith('Impacto nos testes:');
    });

    it('handles create error', async () => {
        mockConfirm.mockReturnValueOnce(false);
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        (mockM.createMergeRequest as jest.Mock).mockRejectedValue(new Error('API error'));

        await handleCreateMR(ctx, mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-create', expect.any(String), 'error');
    });
});

describe('handleListApprovedMRs', () => {
    it('lists approved MRs', async () => {
        mockPrompt.mockReturnValue('opened');
        const mrs = [
            { iid: 1, title: 'MR 1' },
            { iid: 2, title: 'MR 2' },
        ] as MergeRequestInfo[];
        (mockM.searchMergeRequests as jest.Mock).mockResolvedValue(mrs);
        (mockM.isApproved as jest.Mock).mockResolvedValue(true);

        await handleListApprovedMRs(ctx, mockM);

        expect(info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', expect.stringContaining('2'), 'ok');
    });

    it('warns when no approved MRs', async () => {
        mockPrompt.mockReturnValue('opened');
        (mockM.searchMergeRequests as jest.Mock).mockResolvedValue([]);

        await handleListApprovedMRs(ctx, mockM);

        expect(warn).toHaveBeenCalled();
    });

    it('handles search error', async () => {
        mockPrompt.mockReturnValue('opened');
        (mockM.searchMergeRequests as jest.Mock).mockRejectedValue(new Error('search fail'));

        await handleListApprovedMRs(ctx, mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', 'opened', 'error');
    });

    it('handles provider without isApproved', async () => {
        mockPrompt.mockReturnValue('opened');
        const mrs = [{ iid: 1, title: 'MR 1' }] as MergeRequestInfo[];
        (mockM.searchMergeRequests as jest.Mock).mockResolvedValue(mrs);
        (mockM as unknown).isApproved = undefined;

        await handleListApprovedMRs(ctx, mockM);

        expect(warn).toHaveBeenCalled();
    });
});

describe('handleMergeMR', () => {
    it('merges MR successfully', async () => {
        mockPrompt.mockReturnValue('42');
        (mockM.acceptMergeRequest as jest.Mock).mockResolvedValue({ web_url: 'https://gitlab.com/merge/42' });

        await handleMergeMR(ctx, mockM);

        expect(mockM.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(success).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'ok');
    });

    it('handles merge error', async () => {
        mockPrompt.mockReturnValue('42');
        (mockM.acceptMergeRequest as jest.Mock).mockRejectedValue(new Error('merge fail'));

        await handleMergeMR(ctx, mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'error');
    });
});
