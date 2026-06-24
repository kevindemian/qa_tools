vi.mock('../shared/prompt', () => ({
    print: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    printError: vi.fn(),
    withSpinner: vi.fn(<T>(_: string, fn: () => Promise<T>) => fn()),
    divider: vi.fn(),
}));

vi.mock('./session-state', () => ({
    currentProvider: 'gitlab',
    pushHistory: vi.fn(),
}));

vi.mock('./ai-pr-desc', () => ({ generatePrDescription: vi.fn() }));
vi.mock('./ai-test-impact', () => ({ assessTestImpact: vi.fn() }));
vi.mock('./nivelar', () => ({ nivelarBranches: vi.fn() }));

vi.mock('../shared/temp-dir', () => ({
    reportsDir: vi.fn(() => '/tmp/reports'),
}));

import { success, warn, info, prompt, confirm, printError } from '../shared/prompt.js';
import { pushHistory } from './session-state.js';
import { generatePrDescription } from './ai-pr-desc.js';
import { assessTestImpact } from './ai-test-impact.js';
import { nivelarBranches } from './nivelar.js';
import { handleCreateMR, handleListApprovedMRs, handleMergeMR, nivelarBranchesWrapper } from './mr-handler.js';
import type { MergeRequestInfo } from '../shared/types.js';
import { createMockGitProvider } from '../shared/test-utils/factories/index.js';

const mockPrompt = vi.mocked(prompt);
const mockConfirm = vi.mocked(confirm);
const mockPrintError = vi.mocked(printError);
const mockGeneratePrDesc = vi.mocked(generatePrDescription);
const mockAssessImpact = vi.mocked(assessTestImpact);
const mockNivelar = vi.mocked(nivelarBranches);

const mockM = createMockGitProvider();

beforeEach(() => {
    vi.clearAllMocks();
    mockPrompt.mockReturnValue('test-branch');
    mockConfirm.mockReturnValue(false);
});

describe('NivelarBranchesWrapper', () => {
    it('delegates to nivelarBranches', async () => {expect.hasAssertions();

        await nivelarBranchesWrapper(mockM);

        expect(mockNivelar).toHaveBeenCalledWith(mockM, expect.any(Object));
    });
});

describe('HandleCreateMR', () => {
    it('creates MR with manual description', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValueOnce(false);
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Manual desc');
        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'Manual desc');
        expect(success).toHaveBeenCalledWith(expect.stringContaining('https://gitlab.com/merge/1'));
    });

    it('uses AI description when available', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        mockGeneratePrDesc.mockResolvedValue('AI generated description');
        mockPrompt.mockReturnValueOnce('feat').mockReturnValueOnce('main').mockReturnValueOnce('Title');
        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

        expect(mockGeneratePrDesc).toHaveBeenCalled();
        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'AI generated description');
    });

    it('falls back to manual when AI returns empty', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValueOnce(true).mockReturnValueOnce(false);
        mockGeneratePrDesc.mockResolvedValue('');
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Manual desc');
        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

        expect(mockM.createMergeRequest).toHaveBeenCalledWith('feat', 'main', 'Title', 'Manual desc');
        expect(warn).toHaveBeenCalled();
    });

    it('includes test impact analysis when requested', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
        mockAssessImpact.mockResolvedValue('Impact: tests affected');
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        vi.spyOn(mockM, 'createMergeRequest').mockResolvedValue({ web_url: 'https://gitlab.com/merge/1' });

        await handleCreateMR(mockM);

        expect(mockAssessImpact).toHaveBeenCalled();
        expect(info).toHaveBeenCalledWith('Impacto nos testes:');
    });

    it('handles create error', async () => {expect.hasAssertions();

        mockConfirm.mockReturnValueOnce(false);
        mockPrompt
            .mockReturnValueOnce('feat')
            .mockReturnValueOnce('main')
            .mockReturnValueOnce('Title')
            .mockReturnValueOnce('Desc');
        vi.spyOn(mockM, 'createMergeRequest').mockRejectedValue(new Error('API error'));

        await handleCreateMR(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-create', expect.any(String), 'error');
    });
});

describe('HandleListApprovedMRs', () => {
    it('lists approved MRs', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('opened');
        const mrs = [
            { iid: 1, title: 'MR 1' },
            { iid: 2, title: 'MR 2' },
        ] as MergeRequestInfo[];
        vi.spyOn(mockM, 'searchMergeRequests').mockResolvedValue(mrs);
        vi.spyOn(mockM, 'isApproved').mockResolvedValue(true);

        await handleListApprovedMRs(mockM);

        expect(info).toHaveBeenCalledWith(expect.stringContaining('aprovados'));
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', expect.stringContaining('2'), 'ok');
    });

    it('warns when no approved MRs', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('opened');
        vi.spyOn(mockM, 'searchMergeRequests').mockResolvedValue([]);

        await handleListApprovedMRs(mockM);

        expect(warn).toHaveBeenCalled();
    });

    it('handles search error', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('opened');
        vi.spyOn(mockM, 'searchMergeRequests').mockRejectedValue(new Error('search fail'));

        await handleListApprovedMRs(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('prs-approved', 'opened', 'error');
    });

    it('handles provider without isApproved', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('opened');
        const mrs = [{ iid: 1, title: 'MR 1' }] as MergeRequestInfo[];
        vi.spyOn(mockM, 'searchMergeRequests').mockResolvedValue(mrs);
        Object.defineProperty(mockM, 'isApproved', { value: undefined, writable: true });

        await handleListApprovedMRs(mockM);

        expect(warn).toHaveBeenCalled();
    });
});

describe('HandleMergeMR', () => {
    it('merges MR successfully', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('42');
        vi.spyOn(mockM, 'acceptMergeRequest').mockResolvedValue({ web_url: 'https://gitlab.com/merge/42' });

        await handleMergeMR(mockM);

        expect(mockM.acceptMergeRequest).toHaveBeenCalledWith('42');
        expect(success).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'ok');
    });

    it('handles merge error', async () => {expect.hasAssertions();

        mockPrompt.mockReturnValue('42');
        vi.spyOn(mockM, 'acceptMergeRequest').mockRejectedValue(new Error('merge fail'));

        await handleMergeMR(mockM);

        expect(mockPrintError).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('pr-merge', '42', 'error');
    });
});
