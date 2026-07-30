/**
 * Tests for Xray Cloud GraphQL error handling.
 *
 * Bug: `graphql()` silently ignores GraphQL errors in response body.
 * GraphQL errors can return HTTP 200 with `errors` array in `res.data`.
 * `graphqlMutation()` checks `res.data.errors`, but `graphql()` did not.
 *
 * Mock boundary: HTTP layer (axios post), NOT internal XrayCloudClient properties.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as httpClientModule from '../infra/http-client.js';
import { XrayCloudClient } from '../jira/xray-cloud-client.js';

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
