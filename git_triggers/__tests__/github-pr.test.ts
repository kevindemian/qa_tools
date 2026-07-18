import {
    formatPR,
    prCreateMergeRequest,
    prUpdateMergeRequest,
    prGetMergeRequest,
    prSearchMergeRequests,
    prAcceptMergeRequest,
    prIsApproved,
} from '../github-pr.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/infra/circuit-breaker.js';
import { nullAs, nonNull } from '../../shared/test-utils.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';
import * as prompt from '../../shared/ui/prompt.js';

vi.mock('../../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(() => ({
        error: vi.fn<(...args: [string]) => void>(),
        warn: vi.fn<(...args: [string]) => void>(),
    })),
    rootLogger: {
        error: vi.fn<(...args: [string]) => void>(),
        warn: vi.fn<(...args: [string]) => void>(),
        writeFileOnly: vi.fn<(...args: [string, string]) => void>(),
    },
}));

function axiosErr(status: number, url: string, extra?: Record<string, unknown>): unknown {
    return { response: { status, ...extra }, config: { url } };
}

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
        resetCircuitState();
        client = createMockAxiosInstance();
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
        client.post.mockResolvedValue({ data: mockData });
        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'PR Title', 'PR Desc');

        expect(client['post']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls', {
            head: 'feature',
            base: 'main',
            title: 'PR Title',
            body: 'PR Desc',
        });
        expect(nonNull(result).iid).toBe(10);
        expect(nonNull(result).title).toBe('PR Title');
    });

    it('handles 422 (already exists) by searching and updating existing PR', async () => {
        expect.hasAssertions();

        const err = axiosErr(422, '/repos/myorg/myrepo/pulls', { data: { errors: [{ message: 'already exists' }] } });
        client.post.mockRejectedValue(err);
        client.get.mockResolvedValue({
            data: [
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
            ],
        });
        client.patch.mockResolvedValue({
            data: {
                number: 5,
                title: 'PR Title',
                body: 'PR Desc',
                html_url: '',
                state: 'open',
                merged: false,
                head: { ref: 'feature' },
                base: { ref: 'main' },
            },
        });

        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'PR Title', 'PR Desc');

        expect(client['patch']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5', {
            title: 'PR Title',
            body: 'PR Desc',
        });
        expect(nonNull(result).iid).toBe(5);
        expect(vi.spyOn(prompt, 'info')).toHaveBeenCalledWith('PR already exists. Searching for existing...');
    });

    it('throws on 422 without already_exists error', async () => {
        expect.hasAssertions();

        const err = axiosErr(422, '/repos/myorg/myrepo/pulls', { data: { errors: [{ message: 'other error' }] } });
        client.post.mockRejectedValue(err);

        await expect(prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title')).rejects.toThrow(
            /erro desconhecido/,
        );
    });

    it('throws on non-422 error', async () => {
        expect.hasAssertions();

        client.post.mockRejectedValue(axiosErr(400, '/repos/myorg/myrepo/pulls'));

        await expect(
            prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title'),
        ).rejects.toBeInstanceOf(ExternalError);
    });

    it('calls prCreateMergeRequest without optional description', async () => {
        expect.hasAssertions();

        client.post.mockResolvedValue({
            data: {
                number: 1,
                title: 'Title',
                body: undefined,
                html_url: '',
                state: 'open',
                merged: false,
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });
        const result = await prCreateMergeRequest(client, 'myorg', 'myrepo', 'feature', 'main', 'Title');

        expect(result).not.toBeNull();
        expect(client['post']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls', {
            head: 'feature',
            base: 'main',
            title: 'Title',
            body: undefined,
        });
    });
});

describe('PrUpdateMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('calls PATCH /pulls/{iid} and returns formatted PR', async () => {
        expect.hasAssertions();

        client.patch.mockResolvedValue({
            data: {
                number: 5,
                title: 'New Title',
                body: 'New Desc',
                html_url: '',
                state: 'open',
                merged: false,
                head: { ref: 'dev' },
                base: { ref: 'main' },
            },
        });
        const result = await prUpdateMergeRequest(client, 'myorg', 'myrepo', 5, 'New Title', 'New Desc');

        expect(client['patch']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5', {
            title: 'New Title',
            body: 'New Desc',
        });
        expect(nonNull(result).iid).toBe(5);
    });

    it('throws on API error', async () => {
        expect.hasAssertions();

        client.patch.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/pulls/5'));

        await expect(prUpdateMergeRequest(client, 'myorg', 'myrepo', 5, '', '')).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('PrGetMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('calls GET /pulls/{iid} and returns formatted PR', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: false,
                title: 'T',
                body: 'D',
                html_url: '',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });
        const result = await prGetMergeRequest(client, 'myorg', 'myrepo', 5);

        expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/5');
        expect(nonNull(result).iid).toBe(5);
    });

    it('returns null on 404 (PR not found)', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(404, '/repos/myorg/myrepo/pulls/999'));
        const result = await prGetMergeRequest(client, 'myorg', 'myrepo', 999);

        expect(result).toBeNull();
    });

    it('throws ExternalError on non-404 failure', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/pulls/5'));

        await expect(prGetMergeRequest(client, 'myorg', 'myrepo', 5)).rejects.toBeInstanceOf(ExternalError);
    });
});

describe('PrSearchMergeRequests', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('calls GET /pulls with correct params', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: [
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
            ],
        });
        const result = await prSearchMergeRequests(client, 'myorg', 'myrepo', 'dev', 'main', 'opened');

        expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls', expect.any(Object));
        expect(result).toHaveLength(1);
        expect(nonNull(result[0]).iid).toBe(1);
    });

    it('maps opened status to open', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [] });
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'opened');

        const calledWith = nonNull(client.get.mock.calls[0]);
        const params = nonNull(calledWith[1]).params as Record<string, unknown>;

        expect(params['state']).toBe('open');
        expect(params['per_page']).toBe(100);
    });

    it('returns empty array on 404', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(404, '/repos/myorg/myrepo/pulls'));
        const result = await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'opened');

        expect(result).toStrictEqual([]);
    });

    it('passes status directly when not opened', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [] });
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'closed');

        const calledWith = nonNull(client.get.mock.calls[0]);
        const params = nonNull(calledWith[1]).params as Record<string, unknown>;

        expect(params['state']).toBe('closed');
    });

    it('omits head param when sourceBranch is empty', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [] });
        await prSearchMergeRequests(client, 'myorg', 'myrepo', '', 'main', 'opened');
        const calledWith = nonNull(client.get.mock.calls[0]);
        const params = nonNull(calledWith[1]).params as Record<string, unknown>;

        expect(params['head']).toBeUndefined();
        expect(params['base']).toBe('main');
    });

    it('omits base param when targetBranch is empty', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [] });
        await prSearchMergeRequests(client, 'myorg', 'myrepo', 'dev', '', 'opened');
        const calledWith = nonNull(client.get.mock.calls[0]);
        const params = nonNull(calledWith[1]).params as Record<string, unknown>;

        expect(params['head']).toBe('myorg:dev');
        expect(params['base']).toBeUndefined();
    });

    it('throws ExternalError on non-404 failure', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/pulls'));

        await expect(prSearchMergeRequests(client, 'myorg', 'myrepo', '', '', 'opened')).rejects.toBeInstanceOf(
            ExternalError,
        );
    });
});

describe('PrAcceptMergeRequest', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('calls GET then PUT /pulls/{iid}/merge when PR is open', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: false,
                title: 'T',
                body: '',
                html_url: '',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });
        client.put.mockResolvedValue({
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

        client.get.mockResolvedValue({
            data: {
                number: 5,
                state: 'closed',
                merged: true,
                title: 'T',
                body: '',
                html_url: 'https://...',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });

        const result = await prAcceptMergeRequest(client, 'myorg', 'myrepo', 5);

        expect(client['put']).not.toHaveBeenCalled();
        expect(nonNull(result).state).toBe('merged');
    });

    it('throws when PR not found (404)', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(404, '/repos/myorg/myrepo/pulls/999'));

        await expect(prAcceptMergeRequest(client, 'myorg', 'myrepo', 999)).rejects.toThrow('PR #999 not found');
    });

    it('throws on merge API failure', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: false,
                title: 'T',
                body: '',
                html_url: '',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });
        client.put.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/pulls/5/merge'));

        await expect(prAcceptMergeRequest(client, 'myorg', 'myrepo', 5)).rejects.toThrow(/erro no servidor/);
    });

    it('omits delete_branch_on_merge when shouldRemoveSourceBranch is false', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({
            data: {
                number: 5,
                state: 'open',
                merged: false,
                title: 'T',
                body: '',
                html_url: '',
                head: { ref: 'f' },
                base: { ref: 'm' },
            },
        });
        client.put.mockResolvedValue({
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
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('returns true when at least one review is APPROVED', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [{ state: 'APPROVED' }] });
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeTruthy();
        expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/pulls/42/reviews');
    });

    it('returns false when no APPROVED review', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [{ state: 'COMMENTED' }, { state: 'CHANGES_REQUESTED' }] });
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });

    it('returns false on empty reviews array', async () => {
        expect.hasAssertions();

        client.get.mockResolvedValue({ data: [] });
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });

    it('returns false on 404 (reviews not found)', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(404, '/repos/myorg/myrepo/pulls/42/reviews'));
        const result = await prIsApproved(client, 'myorg', 'myrepo', 42);

        expect(result).toBeFalsy();
    });

    it('throws ExternalError on non-404 failure', async () => {
        expect.hasAssertions();

        client.get.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/pulls/42/reviews'));

        await expect(prIsApproved(client, 'myorg', 'myrepo', 42)).rejects.toBeInstanceOf(ExternalError);
    });
});
