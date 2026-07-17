import type { JsonObject } from '../../shared/types.js';
import { nonNull, nullAs, undefinedAs } from '../../shared/test-utils.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/circuit-breaker.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';
import * as prompt from '../../shared/prompt.js';
import {
    formatPR,
    glCreateMergeRequest,
    glUpdateMergeRequest,
    glGetMergeRequest,
    glSearchMergeRequests,
    glAcceptMergeRequest,
    glIsApproved,
} from '../gitlab-pr.js';

vi.mock('../../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(() => ({ error: vi.fn(), warn: vi.fn() })),
    rootLogger: { error: vi.fn(), warn: vi.fn(), writeFileOnly: vi.fn() },
}));

function axiosErr(status: number, url: string, extra?: Record<string, unknown>): unknown {
    return { response: { status, ...extra }, config: { url } };
}

describe('Gitlab Pr', () => {
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
        let client: Mocked<AxiosInstance>;
        const args = ['owner', 'repo', 'feature', 'main', 'MR Title', 'MR Desc'] as const;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
            vi.spyOn(prompt, 'info').mockClear();
        });

        it('calls apiPost and returns formatted MR', async () => {
            expect.hasAssertions();

            client.post.mockResolvedValue({ data: { iid: 10, web_url: 'https://...' } });
            const result = await glCreateMergeRequest(client, ...args);

            expect(result).toMatchObject({ iid: 10, number: 10 });
            expect(client['post']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests', {
                id: 'owner/repo',
                source_branch: 'feature',
                target_branch: 'main',
                title: 'MR Title',
                description: 'MR Desc',
            });
        });

        it('handles 409 by searching and updating existing MR', async () => {
            expect.hasAssertions();

            client.post.mockRejectedValue(axiosErr(409, '/projects/owner%2Frepo/merge_requests'));
            client.get.mockResolvedValue({ data: [{ iid: 5 }] });
            client.put.mockResolvedValue({ data: { iid: 5 } });

            const result = await glCreateMergeRequest(client, ...args);

            const searchCall = nonNull(client['get'].mock.calls[0]);

            expect(searchCall[0]).toBe('/projects/owner%2Frepo/merge_requests');
            expect(nonNull(searchCall[1]).params).toMatchObject({ state: 'opened' });
            expect(client['put']).toHaveBeenCalledWith(
                '/projects/owner%2Frepo/merge_requests/5',
                expect.objectContaining({ title: 'MR Title', description: 'MR Desc' }),
            );
            expect(result).toMatchObject({ iid: 5 });
        });

        it('re-throws on 409 when no existing MR found', async () => {
            expect.hasAssertions();

            client.post.mockRejectedValue(axiosErr(409, '/projects/owner%2Frepo/merge_requests'));
            client.get.mockResolvedValue({ data: [] });

            await expect(glCreateMergeRequest(client, ...args)).rejects.toThrow(/erro desconhecido/);
        });

        it('re-throws on non-409 error', async () => {
            expect.hasAssertions();

            client.post.mockRejectedValue(axiosErr(400, '/projects/owner%2Frepo/merge_requests'));

            await expect(glCreateMergeRequest(client, ...args)).rejects.toBeInstanceOf(ExternalError);
        });

        it('works without description', async () => {
            expect.hasAssertions();

            client.post.mockResolvedValue({ data: { iid: 11 } });
            const result = await glCreateMergeRequest(client, 'o', 'r', 'feature', 'main', 'Title');

            expect(result).toMatchObject({ iid: 11 });
        });
    });

    describe('GlUpdateMergeRequest', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('calls apiPut and returns formatted MR', async () => {
            expect.hasAssertions();

            client.put.mockResolvedValue({ data: { iid: 5, title: 'Updated' } });
            const result = await glUpdateMergeRequest(client, 'owner', 'repo', 5, 'Updated', 'New desc');

            expect(result).toMatchObject({ iid: 5, title: 'Updated' });
            expect(client['put']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests/5', {
                title: 'Updated',
                description: 'New desc',
            });
        });

        it('works with string IID', async () => {
            expect.hasAssertions();

            client.put.mockResolvedValue({ data: { iid: 5 } });
            const result = await glUpdateMergeRequest(client, 'owner', 'repo', '5', 'Title');

            expect(result).toMatchObject({ iid: 5 });
        });

        it('throws on API error', async () => {
            expect.hasAssertions();

            client.put.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/merge_requests/5'));

            await expect(
                glUpdateMergeRequest(client, 'owner', 'repo', 5, 'Updated', 'New desc'),
            ).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlGetMergeRequest', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns formatted MR on success', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            const result = await glGetMergeRequest(client, 'owner', 'repo', 5);

            expect(result).toMatchObject({ iid: 5, state: 'opened' });
            expect(client['get']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests/5');
        });

        it('returns null on 404 (MR not found)', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/projects/owner%2Frepo/merge_requests/5'));
            const result = await glGetMergeRequest(client, 'owner', 'repo', 5);

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/merge_requests/5'));

            await expect(glGetMergeRequest(client, 'owner', 'repo', 5)).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlSearchMergeRequests', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns formatted MRs from apiGet', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: [
                    { iid: 1, title: 'First' },
                    { iid: 2, title: 'Second' },
                ],
            });
            const result = await glSearchMergeRequests(client, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toHaveLength(2);
            expect(result[0]).toMatchObject({ iid: 1 });
            expect(result[1]).toMatchObject({ iid: 2 });
        });

        it('returns [] when apiGet returns empty array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [] });
            const result = await glSearchMergeRequests(client, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toStrictEqual([]);
        });

        it('passes correct query params', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [] });
            await glSearchMergeRequests(client, 'owner', 'repo', 'feature', 'main', 'opened');

            const calledWith = nonNull(client.get.mock.calls[0]);
            const params = nonNull(calledWith[1]).params as Record<string, unknown>;

            expect(params).toMatchObject({
                state: 'opened',
                source_branch: 'feature',
                target_branch: 'main',
                per_page: 100,
            });
        });

        it('returns [] on 404', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/projects/owner%2Frepo/merge_requests'));
            const result = await glSearchMergeRequests(client, 'owner', 'repo', 'feature', 'main', 'opened');

            expect(result).toStrictEqual([]);
        });

        it('throws ExternalError on non-404 failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/merge_requests'));

            await expect(
                glSearchMergeRequests(client, 'owner', 'repo', 'feature', 'main', 'opened'),
            ).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GlAcceptMergeRequest', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('calls glGetMergeRequest then merge when opened', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            client.put.mockResolvedValue({ data: { web_url: 'https://merge' } });

            const result = await glAcceptMergeRequest(client, 'owner', 'repo', 5);

            expect(client['put']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests/5/merge', {
                should_remove_source_branch: true,
            });
            expect(result).toMatchObject({ web_url: 'https://merge' });
        });

        it('returns early when already merged', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { iid: 5, state: 'merged', web_url: 'https://...' } });

            const result = await glAcceptMergeRequest(client, 'owner', 'repo', 5);

            expect(client['put']).not.toHaveBeenCalled();
            expect(result).toMatchObject({ iid: 5, state: 'merged' });
        });

        it('throws when MR not found (404)', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/projects/owner%2Frepo/merge_requests/999'));

            await expect(glAcceptMergeRequest(client, 'owner', 'repo', 999)).rejects.toThrow('MR #999 not found');
        });

        it('throws on merge API failure', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            client.put.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/merge_requests/5/merge'));

            await expect(glAcceptMergeRequest(client, 'owner', 'repo', 5)).rejects.toThrow(/erro no servidor/);
        });

        it('passes should_remove_source_branch=false when specified', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { iid: 5, state: 'opened' } });
            client.put.mockResolvedValue({ data: {} });

            await glAcceptMergeRequest(client, 'owner', 'repo', 5, false);

            expect(client['put']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests/5/merge', {
                should_remove_source_branch: false,
            });
        });
    });

    describe('GlIsApproved', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns true when approved', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { approved: true } });
            const result = await glIsApproved(client, 'owner', 'repo', 42);

            expect(result).toBeTruthy();
            expect(client['get']).toHaveBeenCalledWith('/projects/owner%2Frepo/merge_requests/42/approvals');
        });

        it('returns false when not approved', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { approved: false } });
            const result = await glIsApproved(client, 'owner', 'repo', 42);

            expect(result).toBeFalsy();
        });

        it('returns false on 404 (approvals not found)', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/projects/owner%2Frepo/merge_requests/42/approvals'));
            const result = await glIsApproved(client, 'owner', 'repo', 42);

            expect(result).toBeFalsy();
        });

        it('throws ExternalError on non-404 failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/merge_requests/42/approvals'));

            await expect(glIsApproved(client, 'owner', 'repo', 42)).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
