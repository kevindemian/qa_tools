import {
    formatPR,
    prCreateMergeRequest,
    prUpdateMergeRequest,
    prGetMergeRequest,
    prSearchMergeRequests,
    prAcceptMergeRequest,
    prIsApproved,
} from './github-pr.js';
import { nullAs, nonNull } from '../shared/test-utils.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../shared/deps.js';
import * as prompt from '../shared/prompt.js';

import type { apiGet as ApiGetFn, apiPost as ApiPostFn, apiPatch as ApiPatchFn } from './github-api.js';

vi.mock('./github-api', () => ({
    apiGet: vi.fn<(...args: Parameters<typeof ApiGetFn>) => ReturnType<typeof ApiGetFn>>(),
    apiPost: vi.fn<(...args: Parameters<typeof ApiPostFn>) => ReturnType<typeof ApiPostFn>>(),
    apiPatch: vi.fn<(...args: Parameters<typeof ApiPatchFn>) => ReturnType<typeof ApiPatchFn>>(),
}));

vi.mock('../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(() => ({
        error: vi.fn<(...args: [string]) => void>(),
        warn: vi.fn<(...args: [string]) => void>(),
    })),
    rootLogger: { error: vi.fn<(...args: [string]) => void>(), warn: vi.fn<(...args: [string]) => void>() },
}));

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn<(...args: [error: unknown, options?: { returnNull?: boolean }]) => void>(
        (err: unknown, opts?: { returnNull?: boolean }) => {
            if (opts?.returnNull) return null;
            throw err;
        },
    ),
}));

vi.mock('../shared/prompt', () => ({
    info: vi.fn<(...args: [string]) => void>(),
    extractErrorMessage: vi.fn<(...args: [Error]) => string>((err: Error) => err.message || 'Erro desconhecido'),
}));

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn<(...args: [error: unknown, options?: { returnNull?: boolean }]) => void>(
        (err: unknown, opts?: { returnNull?: boolean }) => {
            if (opts?.returnNull) return null;
            throw err;
        },
    ),
}));

vi.mock('../shared/prompt', () => ({
    info: vi.fn<(...args: [string]) => void>(),
    extractErrorMessage: vi.fn<(...args: [Error]) => string>((err: Error) => err.message || 'Erro desconhecido'),
}));

import * as githubApi from './github-api.js';
const mockApiGet = vi.spyOn(githubApi, 'apiGet');
const mockApiPost = vi.spyOn(githubApi, 'apiPost');
const mockApiPatch = vi.spyOn(githubApi, 'apiPatch');

describe('FormatPR', () => {
    it('returns MergeRequestInfo for open PR', () => {
        const data = {
            number: 1,
            title: 'My PR',
            body: 'Desc',
            html_url: 'https://github.com/org/repo/pull/1',
            state: 'open',
            merged: false,
            head: { ref: 'feature' },
            base: { ref: 'main' },
        };
        const result = formatPR(data);

        expect(result).not.toBeNull();
        expect(nonNull(result).iid).toBe(1);
        expect(nonNull(result).number).toBe(1);
        expect(nonNull(result).state).toBe('opened');
        expect(nonNull(result).source_branch).toBe('feature');
        expect(nonNull(result).target_branch).toBe('main');
        expect(nonNull(result).web_url).toBe('https://github.com/org/repo/pull/1');
        expect(nonNull(result).description).toBe('Desc');
    });

    it('returns state merged when merged is true', () => {
        const data = {
            number: 2,
            title: 'Merged PR',
            body: '',
            html_url: '',
            state: 'closed',
            merged: true,
            head: { ref: 'f' },
            base: { ref: 'm' },
        };
        const result = formatPR(data);

        expect(nonNull(result).state).toBe('merged');
    });

    it('returns state closed when not merged and state is closed', () => {
        const data = {
            number: 3,
            title: 'Closed PR',
            body: '',
            html_url: '',
            state: 'closed',
            merged: false,
            head: { ref: 'f' },
            base: { ref: 'm' },
        };
        const result = formatPR(data);

        expect(nonNull(result).state).toBe('closed');
    });

    it('returns null for null input', () => {
        expect(formatPR(nullAs<Record<string, unknown>>())).toBeNull();
    });

    it('handles missing head/base gracefully', () => {
        const data = {
            number: 4,
            title: 'No head',
            body: '',
            html_url: '',
            state: 'open',
            merged: false,
        };
        const result = formatPR(data);

        expect(nonNull(result).source_branch).toBeUndefined();
        expect(nonNull(result).target_branch).toBeUndefined();
    });
});

describe('PrCreateMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
        mockApiPost.mockClear();
        mockApiPatch.mockClear();
        vi.spyOn(prompt, 'info').mockClear();
    });

    it('calls POST /pulls and returns formatted PR on success', async () => {
        expect.hasAssertions();

        const mockData = {
            number: 10,
            title: 'PR Title',
            body: 'PR Desc',
            html_url: 'https://pr',
            state: 'open',
            merged: false,
            head: { ref: 'feature' },
            base: { ref: 'main' },
        };
        mockApiPost.mockResolvedValue(mockData);
        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'PR Title', 'PR Desc');

        expect(mockApiPost).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls',
            { head: 'feature', base: 'main', title: 'PR Title', body: 'PR Desc' },
            { operation: 'criar PR' },
        );
        expect(nonNull(result).iid).toBe(10);
        expect(nonNull(result).title).toBe('PR Title');
    });

    it('handles 422 (already exists) by searching and updating existing PR', async () => {
        expect.hasAssertions();

        const err = Object.assign(new Error('Unprocessable'), {
            response: { status: 422, data: { errors: [{ message: 'already exists' }] } },
        });
        mockApiPost.mockRejectedValue(err);
        mockApiGet.mockResolvedValue([
            {
                number: 5,
                title: 'old',
                body: 'old',
                html_url: '',
                state: 'open',
                merged: false,
                head: { ref: 'feature' },
                base: { ref: 'main' },
            },
        ]);
        mockApiPatch.mockResolvedValue({
            number: 5,
            title: 'PR Title',
            body: 'PR Desc',
            html_url: '',
            state: 'open',
            merged: false,
            head: { ref: 'feature' },
            base: { ref: 'main' },
        });

        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'PR Title', 'PR Desc');

        expect(mockApiPatch).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls/5',
            { title: 'PR Title', body: 'PR Desc' },
            { operation: 'atualizar PR' },
        );
        expect(nonNull(result).iid).toBe(5);
        expect(vi.spyOn(prompt, 'info')).toHaveBeenCalledWith('PR already exists. Searching for existing...');
    });

    it('throws on 422 without already_exists error', async () => {
        expect.hasAssertions();

        const err = Object.assign(new Error('Unprocessable'), {
            response: { status: 422, data: { errors: [{ message: 'other error' }] } },
        });
        mockApiPost.mockRejectedValue(err);

        await expect(prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title')).rejects.toThrow(
            'Unprocessable',
        );
    });

    it('throws on non-422 error', async () => {
        expect.hasAssertions();

        const err = Object.assign(new Error('Bad request'), { response: { status: 400 } });
        mockApiPost.mockRejectedValue(err);

        await expect(prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title')).rejects.toThrow(
            'Bad request',
        );
    });

    it('calls prCreateMergeRequest without optional description', async () => {
        expect.hasAssertions();

        mockApiPost.mockResolvedValue({
            number: 1,
            title: 'Title',
            body: undefined,
            html_url: '',
            state: 'open',
            merged: false,
            head: { ref: 'f' },
            base: { ref: 'm' },
        });
        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title');

        expect(result).not.toBeNull();
        expect(mockApiPost).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls',
            { head: 'feature', base: 'main', title: 'Title', body: undefined },
            { operation: 'criar PR' },
        );
    });
});

describe('PrUpdateMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiPatch.mockClear();
    });

    it('calls PATCH /pulls/{iid} and returns formatted PR', async () => {
        expect.hasAssertions();

        mockApiPatch.mockResolvedValue({
            number: 5,
            title: 'New Title',
            body: 'New Desc',
            html_url: '',
            state: 'open',
            merged: false,
            head: { ref: 'dev' },
            base: { ref: 'main' },
        });
        const result = await prUpdateMergeRequest(client, 'myorg', 'myrepo', 5, 'New Title', 'New Desc');

        expect(mockApiPatch).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls/5',
            { title: 'New Title', body: 'New Desc' },
            { operation: 'atualizar PR' },
        );
        expect(nonNull(result).iid).toBe(5);
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        mockApiPatch.mockRejectedValue(new Error('Update failed'));

        await expect(prUpdateMergeRequest(client, 'myorg', 'myrepo', 5, '', '')).rejects.toThrow('Update failed');
    });
});

describe('PrGetMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('calls GET /pulls/{iid} and returns formatted PR', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            number: 5,
            state: 'open',
            merged: false,
            title: 'T',
            body: 'D',
            html_url: '',
            head: { ref: 'f' },
            base: { ref: 'm' },
        });
        const result = await prGetMergeRequest(client, 'myorg', 'myrepo', 5);

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/pulls/5', {
            operation: 'buscar PR',
            returnNull: true,
        });
        expect(nonNull(result).iid).toBe(5);
    });

    it('returns null when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await prGetMergeRequest(client, 'myorg', 'myrepo', 999);

        expect(result).toBeNull();
    });
});

describe('PrSearchMergeRequests', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('calls GET /pulls with correct params', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([
            {
                number: 1,
                state: 'open',
                merged: false,
                title: 'T1',
                body: '',
                html_url: '',
                head: { ref: 'dev' },
                base: { ref: 'main' },
            },
        ]);
        const result = await prSearchMergeRequests(client, 'myorg', 'myrepo', 'dev', 'main', 'opened');

        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/pulls', {
            operation: 'buscar PRs',
            params: { per_page: 100, head: 'myorg:dev', base: 'main', state: 'open' },
            returnNull: true,
        });
        expect(result).toHaveLength(1);
        expect(nonNull(result[0]).iid).toBe(1);
    });

    it('maps opened status to open', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([]);
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'opened');

        expect(mockApiGet).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls',
            expect.objectContaining<Record<string, unknown>>({
                params: expect.objectContaining<Record<string, unknown>>({ state: 'open', per_page: 100 }),
            }),
        );
    });

    it('returns empty array when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'opened');

        expect(result).toStrictEqual([]);
    });

    it('passes status directly when not opened', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([]);
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'closed');

        expect(mockApiGet).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/pulls',
            expect.objectContaining<Record<string, unknown>>({
                params: expect.objectContaining<Record<string, unknown>>({ state: 'closed' }),
            }),
        );
    });

    it('omits head param when sourceBranch is empty', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([]);
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', 'main', 'opened');
        const calledWith = nonNull(mockApiGet.mock.calls[0]);
        const params = nonNull(calledWith[2]).params as Record<string, unknown>;

        expect(params['head']).toBeUndefined();
        expect(params['base']).toBe('main');
    });

    it('omits base param when targetBranch is empty', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([]);
        await prSearchMergeRequests(client, 'myorg', 'myrepo', 'dev', '', 'opened');
        const calledWith = nonNull(mockApiGet.mock.calls[0]);
        const params = nonNull(calledWith[2]).params as Record<string, unknown>;

        expect(params['head']).toBe('myorg:dev');
        expect(params['base']).toBeUndefined();
    });
});

describe('PrAcceptMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
        vi.clearAllMocks();
    });

    it('calls GET then PUT /pulls/{iid}/merge when PR is open', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            number: 5,
            state: 'open',
            merged: false,
            title: 'T',
            body: '',
            html_url: '',
            head: { ref: 'f' },
            base: { ref: 'm' },
        });
        vi.mocked(client['put']).mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: true,
                title: 'T',
                body: '',
                html_url: 'https://merge',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });

        const result = await prAcceptMergeRequest(client, 'myorg', 'myrepo', 5);

        expect(client['put']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5/merge', {
            delete_branch_on_merge: true,
        });
        expect(nonNull(result).web_url).toBe('https://merge');
    });

    it('returns early without PUT when already merged', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            number: 5,
            state: 'closed',
            merged: true,
            title: 'T',
            body: '',
            html_url: 'https://...',
            head: { ref: 'f' },
            base: { ref: 'm' },
        });

        const result = await prAcceptMergeRequest(client, 'myorg', 'myrepo', 5);

        expect(client['put']).not.toHaveBeenCalled();
        expect(nonNull(result).state).toBe('merged');
    });

    it('throws when PR not found', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);

        await expect(prAcceptMergeRequest(client, 'myorg', 'myrepo', 999)).rejects.toThrow('PR #999 not found');
    });

    it('throws on merge API failure', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            number: 5,
            state: 'open',
            merged: false,
            title: 'T',
            body: '',
            html_url: '',
            head: { ref: 'f' },
            base: { ref: 'm' },
        });
        vi.mocked(client['put']).mockRejectedValue(new Error('Merge failed'));

        await expect(prAcceptMergeRequest(client, 'myorg', 'myrepo', 5)).rejects.toThrow('Merge failed');
    });

    it('omits delete_branch_on_merge when shouldRemoveSourceBranch is false', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue({
            number: 5,
            state: 'open',
            merged: false,
            title: 'T',
            body: '',
            html_url: '',
            head: { ref: 'f' },
            base: { ref: 'm' },
        });
        vi.mocked(client['put']).mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: true,
                title: 'T',
                body: '',
                html_url: '',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });

        await prAcceptMergeRequest(client, 'myorg', 'myrepo', 5, false);

        expect(client['put']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5/merge', {});
    });
});

describe('PrIsApproved', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns true when at least one review is APPROVED', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([{ state: 'APPROVED' }]);
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeTruthy();
        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/pulls/42/reviews', {
            operation: 'verificar reviews',
            returnNull: true,
        });
    });

    it('returns false when no APPROVED review', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([{ state: 'COMMENTED' }, { state: 'CHANGES_REQUESTED' }]);
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });

    it('returns false on empty reviews array', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue([]);
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });

    it('returns false when apiGet returns null', async () => {
        expect.hasAssertions();

        mockApiGet.mockResolvedValue(null);
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });
});
