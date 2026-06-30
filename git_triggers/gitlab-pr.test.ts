import type { JsonObject } from '../shared/types.js';
import { nonNull, nullAs, undefinedAs } from '../shared/test-utils.js';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import {
    formatPR,
    glCreateMergeRequest,
    glUpdateMergeRequest,
    glGetMergeRequest,
    glSearchMergeRequests,
    glAcceptMergeRequest,
    glIsApproved,
} from './gitlab-pr.js';
import { apiGet, apiPost, apiPut, projectPath } from './gitlab-api.js';

vi.mock('./gitlab-api', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    projectPath: vi.fn(),
    formatDiffResponse: vi.fn(),
}));

vi.mock('../shared/prompt', () => ({
    info: vi.fn(),
}));

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

const mockClient = createMockAxiosInstance();

describe('Gitlab Pr', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(projectPath).mockImplementation(
            (owner: string, repo: string) =>
                `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
        );
    });

    describe('FormatPR', () => {
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
            expect(formatPR(nullAs<JsonObject>())).toBeNull();
        });

        it('returns null for undefined input', () => {
            expect(formatPR(undefinedAs<JsonObject>())).toBeNull();
        });

        it('coerces approved to boolean false', () => {
            const data = { iid: 1, approved: false };
            const result = formatPR(data);

            expect(nonNull(result).approved).toBeFalsy();
        });
    });

    describe('GlCreateMergeRequest', () => {
        const args = ['owner', 'repo', 'feature', 'main', 'MR Title', 'MR Desc'] as const;

        it('calls apiPost and returns formatted MR', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue({ iid: 10, web_url: 'https://...' });
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
            expect.hasAssertions();

            vi.mocked(apiPost).mockRejectedValue(Object.assign(new Error('Conflict'), { response: { status: 409 } }));
            vi.mocked(apiGet).mockResolvedValue([{ iid: 5 }]);
            vi.mocked(apiPut).mockResolvedValue({ iid: 5 });

            const result = await glCreateMergeRequest(mockClient, ...args);

            expect(apiGet).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/merge_requests'),
                expect.objectContaining({ operation: 'buscar MRs' }),
            );
            expect(apiPut).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/merge_requests/5'),
                expect.objectContaining({ title: 'MR Title', description: 'MR Desc' }),
                { operation: 'atualizar MR' },
            );
            expect(result).toMatchObject({ iid: 5 });
        });

        it('re-throws on 409 when no existing MR found', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockRejectedValue(Object.assign(new Error('Conflict'), { response: { status: 409 } }));
            vi.mocked(apiGet).mockResolvedValue([]);

            await expect(glCreateMergeRequest(mockClient, ...args)).rejects.toThrow('Conflict');
        });

        it('re-throws on non-409 error', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockRejectedValue(
                Object.assign(new Error('Bad request'), { response: { status: 400 } }),
            );

            await expect(glCreateMergeRequest(mockClient, ...args)).rejects.toThrow('Bad request');
        });

        it('works without description', async () => {
            expect.hasAssertions();

            vi.mocked(apiPost).mockResolvedValue({ iid: 11 });
            const result = await glCreateMergeRequest(mockClient, 'o', 'r', 'feature', 'main', 'Title');

            expect(result).toMatchObject({ iid: 11 });
        });
    });

    describe('GlUpdateMergeRequest', () => {
        it('calls apiPut and returns formatted MR', async () => {
            expect.hasAssertions();

            vi.mocked(apiPut).mockResolvedValue({ iid: 5, title: 'Updated' });
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
            expect.hasAssertions();

            vi.mocked(apiPut).mockResolvedValue({ iid: 5 });
            const result = await glUpdateMergeRequest(mockClient, 'owner', 'repo', '5', 'Title');

            expect(result).toMatchObject({ iid: 5 });
        });
    });

    describe('GlGetMergeRequest', () => {
        it('returns formatted MR on success', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ iid: 5, state: 'opened' });
            const result = await glGetMergeRequest(mockClient, 'owner', 'repo', 5);

            expect(result).toMatchObject({ iid: 5, state: 'opened' });
        });

        it('returns null when apiGet returns null', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue(null);
            const result = await glGetMergeRequest(mockClient, 'owner', 'repo', 5);

            expect(result).toBeNull();
        });

        it('passes returnNull: true to apiGet', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue(null);
            await glGetMergeRequest(mockClient, 'owner', 'repo', 5);

            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/merge_requests/5'), {
                operation: 'buscar MR',
                returnNull: true,
            });
        });
    });

    describe('GlSearchMergeRequests', () => {
        it('returns formatted MRs from apiGet', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([
                { iid: 1, title: 'First' },
                { iid: 2, title: 'Second' },
            ]);
            const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ iid: 1 });
            expect(result[1]).toMatchObject({ iid: 2 });
        });

        it('returns [] when apiGet returns null', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue(null);
            const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toStrictEqual([]);
        });

        it('returns [] when apiGet returns empty array', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([]);
            const result = await glSearchMergeRequests(mockClient, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toStrictEqual([]);
        });

        it('passes correct query params', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue([]);
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

    describe('GlAcceptMergeRequest', () => {
        it('calls glGetMergeRequest then merge when opened', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ iid: 5, state: 'opened' });
            vi.mocked(apiPut).mockResolvedValue({ web_url: 'https://merge' });

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
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ iid: 5, state: 'merged', web_url: 'https://...' });

            const result = await glAcceptMergeRequest(mockClient, 'owner', 'repo', 5);

            expect(apiPut).not.toHaveBeenCalled();
            expect(result).toMatchObject({ iid: 5, state: 'merged' });
        });

        it('throws when MR not found', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue(null);

            await expect(glAcceptMergeRequest(mockClient, 'owner', 'repo', 999)).rejects.toThrow('MR #999 not found');
        });

        it('throws on merge API failure', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ iid: 5, state: 'opened' });
            vi.mocked(apiPut).mockRejectedValue(new Error('Merge failed'));

            await expect(glAcceptMergeRequest(mockClient, 'owner', 'repo', 5)).rejects.toThrow('Merge failed');
        });

        it('passes should_remove_source_branch=false when specified', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ iid: 5, state: 'opened' });
            vi.mocked(apiPut).mockResolvedValue({});

            await glAcceptMergeRequest(mockClient, 'owner', 'repo', 5, false);

            expect(apiPut).toHaveBeenCalledWith(
                mockClient,
                expect.stringContaining('/merge_requests/5/merge'),
                { should_remove_source_branch: false },
                { operation: 'fazer merge' },
            );
        });
    });

    describe('GlIsApproved', () => {
        it('returns true when approved', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ approved: true });
            const result = await glIsApproved(mockClient, 'owner', 'repo', 42);

            expect(result).toBeTruthy();
            expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/merge_requests/42/approvals'), {
                operation: 'verificar aprovação',
                returnNull: true,
            });
        });

        it('returns false when not approved', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue({ approved: false });
            const result = await glIsApproved(mockClient, 'owner', 'repo', 42);

            expect(result).toBeFalsy();
        });

        it('returns false when apiGet returns null', async () => {
            expect.hasAssertions();

            vi.mocked(apiGet).mockResolvedValue(null);
            const result = await glIsApproved(mockClient, 'owner', 'repo', 42);

            expect(result).toBeFalsy();
        });
    });
});
