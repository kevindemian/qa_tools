/**
 * Tests for Xray Cloud GraphQL error handling.
 *
 * Bug: `graphql()` silently ignores GraphQL errors in response body.
 * GraphQL errors can return HTTP 200 with `errors` array in `res.data`.
 * `graphqlMutation()` checks `res.data.errors`, but `graphql()` did not.
 *
 * Mock boundary: HTTP layer (axios post), NOT internal XrayCloudClient properties.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as httpClientModule from '../infra/http-client.js';
import { XrayCloudClient } from '../jira/xray-cloud-client.js';

vi.mock('../logger.js', () => ({
    rootLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe('BUG: Xray graphql() does not check res.data.errors', () => {
    let client: XrayCloudClient;
    let mockPost: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPost = vi.fn();

        vi.spyOn(httpClientModule, 'createThrottledClient').mockReturnValue({
            post: mockPost,
            get: vi.fn(),
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        } as unknown as ReturnType<typeof httpClientModule.createThrottledClient>);

        client = new XrayCloudClient('https://xray.cloud.getxray.app');
    });

    it('logs GraphQL errors from response body', async () => {
        mockPost.mockResolvedValue({
            data: {
                data: null,
                errors: [
                    { message: 'Cannot query field "steps" on type "Test"' },
                    { message: 'Unknown argument "limit" on field "steps"' },
                ],
            },
        });

        const warnSpy = vi.spyOn(await import('../logger.js').then((m) => m.rootLogger), 'warn');

        await client.graphql('query { getTest { steps { id } } }', {}, 'cid', 'csec');

        const gqlWarnCalls = warnSpy.mock.calls.filter(
            (c) => typeof c[0] === 'string' && c[0].startsWith('GraphQL error:'),
        );
        expect(gqlWarnCalls.length).toBe(2);
        expect(gqlWarnCalls[0]![0] as string).toContain('Cannot query field "steps"');

        warnSpy.mockRestore();
    });

    it('returns data even when errors exist (partial success)', async () => {
        mockPost.mockResolvedValue({
            data: {
                data: { getTest: { id: 'TEST-1' } },
                errors: [{ message: 'Deprecation warning' }],
            },
        });

        const result = await client.graphql('query {}', {}, 'cid', 'csec');

        expect(result).toEqual({ getTest: { id: 'TEST-1' } });
    });

    it('returns null when response has errors but no data', async () => {
        mockPost.mockResolvedValue({
            data: {
                data: null,
                errors: [{ message: 'Cannot query field "steps"' }],
            },
        });

        const result = await client.graphql('query {}', {}, 'cid', 'csec');

        expect(result).toBeNull();
    });

    it('returns null when HTTP request fails (catch path)', async () => {
        mockPost.mockRejectedValue(new Error('Network error'));

        const result = await client.graphql('query {}', {}, 'cid', 'csec');

        expect(result).toBeNull();
    });
});

describe('graphql() transient error retry', () => {
    let client: XrayCloudClient;
    let mockPost: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        mockPost = vi.fn();

        vi.spyOn(httpClientModule, 'createThrottledClient').mockReturnValue({
            post: mockPost,
            get: vi.fn(),
            interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
        } as unknown as ReturnType<typeof httpClientModule.createThrottledClient>);

        client = new XrayCloudClient('https://xray.cloud.getxray.app');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('retries on ECONNRESET and succeeds on attempt 2', async () => {
        // First call: authenticate, second call: transient error, third call: success
        const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValueOnce(err) // query attempt 1 - transient
            .mockResolvedValueOnce({ data: { data: { getTest: { id: 'T-1' } }, errors: [] } }); // query attempt 2

        const promise = client.graphql('query {}', {}, 'cid', 'csec');

        await vi.advanceTimersByTimeAsync(1000);

        const result = await promise;
        expect(result).toEqual({ getTest: { id: 'T-1' } });
        expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('retries on read EINVAL and succeeds on attempt 3', async () => {
        const err = new Error('read EINVAL');
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValueOnce(err) // query attempt 1
            .mockRejectedValueOnce(err) // query attempt 2
            .mockResolvedValueOnce({ data: { data: { steps: [] }, errors: [] } }); // query attempt 3

        const promise = client.graphql('query {}', {}, 'cid', 'csec');

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(2000);

        const result = await promise;
        expect(result).toEqual({ steps: [] });
        expect(mockPost).toHaveBeenCalledTimes(4);
    });

    it('returns null after 3 transient failures', async () => {
        const err = Object.assign(new Error('read EINVAL'), { code: 'EINVAL' });
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValue(err); // all subsequent calls fail

        const promise = client.graphql('query {}', {}, 'cid', 'csec');

        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(4000);

        const result = await promise;
        expect(result).toBeNull();
        expect(mockPost).toHaveBeenCalledTimes(4); // 1 auth + 3 query retries
    });

    it('does NOT retry non-transient errors', async () => {
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValue(new Error('Permission denied')); // query

        const result = await client.graphql('query {}', {}, 'cid', 'csec');

        expect(result).toBeNull();
        expect(mockPost).toHaveBeenCalledTimes(2); // 1 auth + 1 query (no retry)
    });

    it('does NOT retry on ETIMEDOUT with retry on attempt 2', async () => {
        const err = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValueOnce(err) // query attempt 1
            .mockResolvedValueOnce({ data: { data: { ok: true }, errors: [] } }); // query attempt 2

        const promise = client.graphql('query {}', {}, 'cid', 'csec');

        await vi.advanceTimersByTimeAsync(1000);

        const result = await promise;
        expect(result).toEqual({ ok: true });
        expect(mockPost).toHaveBeenCalledTimes(3); // 1 auth + 2 query attempts
    });

    it('logs warning at each retry attempt', async () => {
        const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
        mockPost
            .mockResolvedValueOnce({ data: '"tok-123"' }) // auth
            .mockRejectedValueOnce(err) // query attempt 1
            .mockResolvedValueOnce({ data: { data: { ok: true }, errors: [] } }); // query attempt 2

        const warnSpy = vi.spyOn(await import('../logger.js').then((m) => m.rootLogger), 'warn');

        const promise = client.graphql('query {}', {}, 'cid', 'csec');

        await vi.advanceTimersByTimeAsync(1000);

        await promise;

        const retryWarns = warnSpy.mock.calls.filter(
            (c) => typeof c[0] === 'string' && c[0].includes('[graphql] Transient error'),
        );
        expect(retryWarns.length).toBe(1);
        expect(retryWarns[0]![0] as string).toContain('attempt 1/3');
        warnSpy.mockRestore();
    });
});
