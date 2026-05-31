import {
    formatPR,
    glCreateMergeRequest,
    glUpdateMergeRequest,
    glGetMergeRequest,
    glSearchMergeRequests,
    glAcceptMergeRequest,
    glIsApproved,
} from './gitlab-pr';
import { apiGet, apiPost, apiPut, projectPath } from './gitlab-api';

jest.mock('./gitlab-api', () => ({
    apiGet: jest.fn(),
    apiPost: jest.fn(),
    apiPut: jest.fn(),
    projectPath: jest.fn(),
    formatDiffResponse: jest.fn(),
}));

jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
}));

jest.mock('../shared/git-provider-error', () => ({
    handleError: jest.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

const mockClient = { get: jest.fn(), post: jest.fn(), put: jest.fn() } as any;

beforeEach(() => {
    jest.clearAllMocks();
    (projectPath as jest.Mock).mockImplementation(
        (owner: string, repo: string) =>
            `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
    );
});

describe('formatPR', () => {
    it('formats a complete MR object', () => {
        const data = {
            iid: 5,
            title: 'MR Title',
            state: 'opened',
            web_url: 'https://...',
            description: 'desc',
            source_branch: 'feature',
            target_branch: 'main',
            approved: true,
        };
        const result = formatPR(data);
        expect(result).toMatchObject({
            iid: 5,
            number: 5,
            title: 'MR Title',
            state: 'opened',
            approved: true,
        });
    });

    it('returns null for null input', () => {
        expect(formatPR(null as any)).toBeNull();
    });

    it('returns null for undefined input', () => {
        expect(formatPR(undefined as any)).toBeNull();
    });

    it('coerces approved to boolean false', () => {
        const data = { iid: 1, approved: false };
        const result = formatPR(data);
        expect(result!.approved).toBe(false);
    });
});

describe('glCreateMergeRequest', () => {
    const args = ['owner', 'repo', 'feature', 'main', 'MR Title', 'MR Desc'] as const;

    it('calls apiPost and returns formatted MR', async () => {
        (apiPost as jest.Mock).mockResolvedValue({ iid: 10, web_url: 'https://...' });
        const result = await glCreateMergeRequest(mockClient, ...args);
        expect(result).toMatchObject({ iid: 10, number: 10 });
        expect(apiPost).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/merge_requests'),
            {
                id: 'owner/repo',
                source_branch: 'feature',
                target_branch: 'main',
                title: 'MR Title',
                description: 'MR Desc',
            },
            { operation: 'criar MR' },
        );
    });

    it('handles 409 by searching and updating existing MR', async () => {
        (apiPost as jest.Mock).mockRejectedValue(Object.assign(new Error('Conflict'), { response: { status: 409 } }));
        (apiGet as jest.Mock).mockResolvedValue([{ iid: 5 }]);
        (apiPut as jest.Mock).mockResolvedValue({ iid: 5 });

        const result = await glCreateMergeRequest(mockClient, ...args);
        expect(apiGet).toHaveBeenCalled();
        expect(apiPut).toHaveBeenCalled();
        expect(result).toMatchObject({ iid: 5 });
    });

    it('re-throws on 409 when no existing MR found', async () => {
        (apiPost as jest.Mock).mockRejectedValue(Object.assign(new Error('Conflict'), { response: { status: 409 } }));
        (apiGet as jest.Mock).mockResolvedValue([]);

        await expect(glCreateMergeRequest(mockClient, ...args)).rejects.toThrow('Conflict');
    });

    it('re-throws on non-409 error', async () => {
        (apiPost as jest.Mock).mockRejectedValue(
            Object.assign(new Error('Bad request'), { response: { status: 400 } }),
        );

        await expect(glCreateMergeRequest(mockClient, ...args)).rejects.toThrow('Bad request');
    });

    it('works without description', async () => {
        (apiPost as jest.Mock).mockResolvedValue({ iid: 11 });
        const result = await glCreateMergeRequest(mockClient, 'o', 'r', 'feature', 'main', 'Title');
        expect(result).toMatchObject({ iid: 11 });
    });
});

describe('glUpdateMergeRequest', () => {
    it('calls apiPut and returns formatted MR', async () => {
        (apiPut as jest.Mock).mockResolvedValue({ iid: 5, title: 'Updated' });
        const result = await glUpdateMergeRequest(mockClient, 'owner', 'repo', 5, 'Updated', 'New desc');
        expect(result).toMatchObject({ iid: 5, title: 'Updated' });
        expect(apiPut).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/merge_requests/5'),
            { title: 'Updated', description: 'New desc' },
            { operation: 'atualizar MR' },
        );
    });

    it('works with string IID', async () => {
        (apiPut as jest.Mock).mockResolvedValue({ iid: 5 });
        const result = await glUpdateMergeRequest(mockClient, 'owner', 'repo', '5', 'Title');
        expect(result).toMatchObject({ iid: 5 });
    });
});

describe('glGetMergeRequest', () => {
    it('returns formatted MR on success', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ iid: 5, state: 'opened' });
        const result = await glGetMergeRequest(mockClient, 'owner', 'repo', 5);
        expect(result).toMatchObject({ iid: 5, state: 'opened' });
    });

    it('returns null when apiGet returns null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glGetMergeRequest(mockClient, 'owner', 'repo', 5);
        expect(result).toBeNull();
    });

    it('passes returnNull: true to apiGet', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        await glGetMergeRequest(mockClient, 'owner', 'repo', 5);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/merge_requests/5'), {
            operation: 'buscar MR',
            returnNull: true,
        });
    });
});

describe('glSearchMergeRequests', () => {
    it('returns formatted MRs from apiGet', async () => {
        (apiGet as jest.Mock).mockResolvedValue([
            { iid: 1, title: 'First' },
            { iid: 2, title: 'Second' },
        ]);
        const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ iid: 1 });
        expect(result[1]).toMatchObject({ iid: 2 });
    });

    it('returns [] when apiGet returns null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');
        expect(result).toEqual([]);
    });

    it('returns [] when apiGet returns empty array', async () => {
        (apiGet as jest.Mock).mockResolvedValue([]);
        const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');
        expect(result).toEqual([]);
    });

    it('passes correct query params', async () => {
        (apiGet as jest.Mock).mockResolvedValue([]);
        await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');
        expect(apiGet).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/merge_requests'),
            expect.objectContaining({
                params: { state: 'opened', source_branch: 'feature', target_branch: 'main', per_page: 100 },
            }),
        );
    });
});

describe('glAcceptMergeRequest', () => {
    it('calls glGetMergeRequest then merge when opened', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ iid: 5, state: 'opened' });
        (apiPut as jest.Mock).mockResolvedValue({ web_url: 'https://merge' });

        const result = await glAcceptMergeRequest(mockClient, 'owner', 'repo', 5);
        expect(apiPut).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/merge_requests/5/merge'),
            { should_remove_source_branch: true },
            { operation: 'fazer merge' },
        );
        expect(result).toMatchObject({ web_url: 'https://merge' });
    });

    it('returns early when already merged', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ iid: 5, state: 'merged', web_url: 'https://...' });

        const result = await glAcceptMergeRequest(mockClient, 'owner', 'repo', 5);
        expect(apiPut).not.toHaveBeenCalled();
        expect(result).toMatchObject({ iid: 5, state: 'merged' });
    });

    it('throws when MR not found', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);

        await expect(glAcceptMergeRequest(mockClient, 'owner', 'repo', 999)).rejects.toThrow('MR #999 not found');
    });

    it('throws on merge API failure', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ iid: 5, state: 'opened' });
        (apiPut as jest.Mock).mockRejectedValue(new Error('Merge failed'));

        await expect(glAcceptMergeRequest(mockClient, 'owner', 'repo', 5)).rejects.toThrow('Merge failed');
    });

    it('passes should_remove_source_branch=false when specified', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ iid: 5, state: 'opened' });
        (apiPut as jest.Mock).mockResolvedValue({});

        await glAcceptMergeRequest(mockClient, 'owner', 'repo', 5, false);
        expect(apiPut).toHaveBeenCalledWith(
            mockClient,
            expect.stringContaining('/merge_requests/5/merge'),
            { should_remove_source_branch: false },
            { operation: 'fazer merge' },
        );
    });
});

describe('glIsApproved', () => {
    it('returns true when approved', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ approved: true });
        const result = await glIsApproved(mockClient, 'owner', 'repo', 42);
        expect(result).toBe(true);
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/merge_requests/42/approvals'), {
            operation: 'verificar aprovação',
            returnNull: true,
        });
    });

    it('returns false when not approved', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ approved: false });
        const result = await glIsApproved(mockClient, 'owner', 'repo', 42);
        expect(result).toBe(false);
    });

    it('returns false when apiGet returns null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glIsApproved(mockClient, 'owner', 'repo', 42);
        expect(result).toBe(false);
    });
});
