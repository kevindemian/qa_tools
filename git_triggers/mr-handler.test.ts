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

jest.mock('../shared/temp-dir', () => ({
    reportsDir: jest.fn(() => '/tmp/reports'),
}));

import { success, warn, info, prompt, confirm, printError } from '../shared/prompt';
import { pushHistory } from './session-state';
import { generatePrDescription } from './ai-pr-desc';
import { assessTestImpact } from './ai-test-impact';
import { nivelarBranches } from './nivelar';
import { handleCreateMR, handleListApprovedMRs, handleMergeMR, nivelarBranchesWrapper } from './mr-handler';
import type { MergeRequestInfo } from '../shared/types';
import { createMockGitProvider } from '../shared/test-utils/factories';

const mockPrompt = jest.mocked(prompt);
const mockConfirm = jest.mocked(confirm);
const mockPrintError = jest.mocked(printError);
const mockGeneratePrDesc = jest.mocked(generatePrDescription);
const mockAssessImpact = jest.mocked(assessTestImpact);
const mockNivelar = jest.mocked(nivelarBranches);

const mockM = createMockGitProvider();

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
        jest.mocked(mockM.createMergeRequest).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'Manual desc');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/merge/1'));
    });

    it('uses AI description when available', async () => {
        mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        mockGeneratePrDesc.mockResolvedValue('AI generated description');
        mockPrompt.mockReturnValueOnce('feat').mockReturnValueOnce('main').mockReturnValueOnce('Title');
        jest.mocked(mockM.createMergeRequest).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

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
        jest.mocked(mockM.createMergeRequest).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

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
        jest.mocked(mockM.createMergeRequest).mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

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
        jest.mocked(mockM.createMergeRequest).mockRejectedValue(new Error('API error'));

        await handleCreateMR(mockM);

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
        jest.mocked(mockM.searchMergeRequests).mockResolvedValue(mrs);
        jest.mocked(mockM.isApproved).mockResolvedValue(true);

        await handleListApprovedMRs(mockM);

        expect(info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', expect.stringContaining('2'), 'ok');
    });

    it('warns when no approved MRs', async () => {
        mockPrompt.mockReturnValue('opened');
        jest.mocked(mockM.searchMergeRequests).mockResolvedValue([]);

        await handleListApprovedMRs(mockM);

        expect(warn).toHaveBeenCalled();
    });

    it('handles search error', async () => {
        mockPrompt.mockReturnValue('opened');
        jest.mocked(mockM.searchMergeRequests).mockRejectedValue(new Error('search fail'));

        await handleListApprovedMRs(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', 'opened', 'error');
    });

    it('handles provider without isApproved', async () => {
        mockPrompt.mockReturnValue('opened');
        const mrs = [{ iid: 1, title: 'MR 1' }] as MergeRequestInfo[];
        jest.mocked(mockM.searchMergeRequests).mockResolvedValue(mrs);
        Object.defineProperty(mockM, 'isApproved', { value: undefined, writable: true });

        await handleListApprovedMRs(mockM);

        expect(warn).toHaveBeenCalled();
    });
});

describe('handleMergeMR', () => {
    it('merges MR successfully', async () => {
        mockPrompt.mockReturnValue('42');
        jest.mocked(mockM.acceptMergeRequest).mockResolvedValue({ web_url: 'https://gitlab.com/merge/42' });

        await handleMergeMR(mockM);

        expect(mockM.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(success).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'ok');
    });

    it('handles merge error', async () => {
        mockPrompt.mockReturnValue('42');
        jest.mocked(mockM.acceptMergeRequest).mockRejectedValue(new Error('merge fail'));

        await handleMergeMR(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'error');
    });
});
