/**
 * Tests for Xray Cloud GraphQL queries — getTestSteps and getTestPreconditions.
 *
 * Xray Cloud schema:
 *   - steps: [TestStep]              (plain list — NO limit, NO results wrapper)
 *   - preconditions(limit: Int): ... (connection — REQUIRES limit arg)
 *
 * Mock boundary: HTTP layer (axios post), NOT internal XrayCloudClient properties.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as httpClientModule from '../infra/http-client.js';
import { XrayCloudClient } from '../jira/xray-cloud-client.js';

const AUTH_RESPONSE = { data: '"fake-jwt-token"' };
const GRAPHQL_STEPS_RESPONSE = {
    data: { data: { getTest: { steps: [] } } },
};
const GRAPHQL_PRECONDITIONS_RESPONSE = {
    data: { data: { getTest: { preconditions: { total: 0, results: [] } } } },
};

function mockClient(mockPost: ReturnType<typeof vi.fn>): XrayCloudClient {
    vi.spyOn(httpClientModule, 'createThrottledClient').mockReturnValue({
        post: mockPost,
        get: vi.fn(),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    } as unknown as ReturnType<typeof httpClientModule.createThrottledClient>);
    return new XrayCloudClient('https://xray.cloud.getxray.app');
}

describe('getTestSteps — steps is plain list, not connection', () => {
    let client: XrayCloudClient;
    let mockPost: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('query uses steps { ... } not steps { results { ... } }', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_STEPS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.query).toMatch(/steps\s*\{/);
        expect(body.query).not.toMatch(/steps\s*\{[^}]*results\s*\{/);
    });

    it('query does NOT contain limit argument on steps field', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_STEPS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.query).not.toMatch(/steps\s*\(/);
    });

    it('variables include issueId but not limit', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_STEPS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.variables).toHaveProperty('issueId', 'ISSUE-1');
        expect(body.variables).not.toHaveProperty('limit');
    });

    it('returns steps data when API responds successfully', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({
                data: {
                    data: {
                        getTest: {
                            steps: [
                                { id: 's1', action: 'Step 1', data: 'Input 1', result: 'Expected 1' },
                                { id: 's2', action: 'Step 2', data: 'Input 2', result: 'Expected 2' },
                            ],
                        },
                    },
                },
            });
        client = mockClient(mockPost);

        const steps = await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        expect(steps).toHaveLength(2);
        expect(steps[0]?.id).toBe('s1');
    });

    it('returns empty array when getTest returns null', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({ data: { data: { getTest: null } } });
        client = mockClient(mockPost);

        const steps = await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        expect(steps).toEqual([]);
    });

    it('returns empty array when steps is empty', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({ data: { data: { getTest: { steps: [] } } } });
        client = mockClient(mockPost);

        const steps = await client.getTestSteps('ISSUE-1', 'cid', 'csec');

        expect(steps).toEqual([]);
    });
});

describe('getTestPreconditions — connection requires limit', () => {
    let client: XrayCloudClient;
    let mockPost: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('query contains limit: 100 on preconditions field', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_PRECONDITIONS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.query).toMatch(/preconditions\s*\(\s*limit\s*:\s*100\s*\)/);
    });

    it('query uses preconditions(limit:100) { total results { ... } }', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_PRECONDITIONS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.query).toMatch(/preconditions\(limit:\s*100\)\s*\{[^}]*total[^}]*results\s*\{\s*issueId\s*\}/s);
    });

    it('variables include issueId but not limit (limit is inline in query)', async () => {
        mockPost = vi.fn().mockResolvedValueOnce(AUTH_RESPONSE).mockResolvedValue(GRAPHQL_PRECONDITIONS_RESPONSE);
        client = mockClient(mockPost);

        await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        const body = (mockPost.mock.calls[1] ?? [])[1] as { query: string; variables: Record<string, unknown> };

        expect(body.variables).toHaveProperty('issueId', 'ISSUE-1');
        expect(body.variables).not.toHaveProperty('limit');
    });

    it('returns precondition issue IDs when API responds successfully', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({
                data: {
                    data: {
                        getTest: {
                            preconditions: {
                                total: 2,
                                results: [{ issueId: 'PREC-1' }, { issueId: 'PREC-2' }],
                            },
                        },
                    },
                },
            });
        client = mockClient(mockPost);

        const preconditions = await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        expect(preconditions).toEqual(['PREC-1', 'PREC-2']);
    });

    it('returns empty array when preconditions are empty', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({
                data: { data: { getTest: { preconditions: { total: 0, results: [] } } } },
            });
        client = mockClient(mockPost);

        const preconditions = await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        expect(preconditions).toEqual([]);
    });

    it('returns empty array when getTest returns null', async () => {
        mockPost = vi
            .fn()
            .mockResolvedValueOnce(AUTH_RESPONSE)
            .mockResolvedValue({ data: { data: { getTest: null } } });
        client = mockClient(mockPost);

        const preconditions = await client.getTestPreconditions('ISSUE-1', 'cid', 'csec');

        expect(preconditions).toEqual([]);
    });
});
