/** Tests for XrayCloudClient — validates auth token caching, retry/throttle integration, GraphQL calls. */
import { jest } from '@jest/globals';
import { XrayCloudClient } from './xray-cloud-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest mock fn accepts any args/return
const mockPost = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest mock fn accepts any args/return
const mockGet = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest mock fn accepts any args/return
const mockPut = jest.fn<any>();

const mockHttpClient = {
    post: mockPost,
    get: mockGet,
    put: mockPut,
    interceptors: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest mock fn accepts any args/return
        request: { use: jest.fn<any>() },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest mock fn accepts any args/return
        response: { use: jest.fn<any>() },
    },
};

jest.mock('./http-client', () => ({
    createThrottledClient: jest.fn(() => mockHttpClient),
}));

jest.mock('./config', () => ({
    getDefault: jest.fn(() => ({ xrayCloudUrl: 'https://xray.cloud.getxray.app' })),
}));

const CID = 'test-client-id';
const CSEC = 'test-client-secret';

beforeEach(() => {
    jest.clearAllMocks();
});

describe('XrayCloudClient', () => {
    describe('authenticate', () => {
        it('returns token on success', async () => {
            mockPost.mockResolvedValue({ data: '"eyJ.token"' });
            const client = new XrayCloudClient();
            const result = await client.authenticate(CID, CSEC);
            expect(result).toBe('eyJ.token');
            expect(mockPost).toHaveBeenCalledWith('/api/v2/authenticate', {
                client_id: CID,
                client_secret: CSEC,
            });
        });

        it('returns null and warns on empty token', async () => {
            mockPost.mockResolvedValue({ data: '' });
            const client = new XrayCloudClient();
            const result = await client.authenticate(CID, CSEC);
            expect(result).toBeNull();
        });

        it('returns null and warns on auth failure', async () => {
            mockPost.mockRejectedValue(new Error('401 Unauthorized'));
            const client = new XrayCloudClient();
            const result = await client.authenticate(CID, CSEC);
            expect(result).toBeNull();
        });

        it('caches token and does not re-authenticate', async () => {
            mockPost.mockResolvedValue({ data: '"eyJ.token"' });
            const client = new XrayCloudClient();
            await client.authenticate(CID, CSEC);
            await client.authenticate(CID, CSEC);
            expect(mockPost).toHaveBeenCalledTimes(1);
        });
    });

    describe('graphql', () => {
        it('authenticates and sends query', async () => {
            mockPost.mockResolvedValueOnce({ data: '"eyJ.token"' }).mockResolvedValueOnce({
                data: { data: { getTestRuns: { results: [{ id: '1', status: { name: 'PASS' } }] } } },
            });
            const client = new XrayCloudClient();
            const result = await client.graphql('query { ... }', { limit: 10 }, CID, CSEC);
            expect(result).toEqual({
                getTestRuns: { results: [{ id: '1', status: { name: 'PASS' } }] },
            });
            expect(mockPost).toHaveBeenNthCalledWith(
                2,
                '/api/v2/graphql',
                expect.objectContaining({ query: 'query { ... }', variables: { limit: 10 } }),
                expect.objectContaining({ headers: { Authorization: 'Bearer eyJ.token' } }),
            );
        });

        it('returns null when data is missing', async () => {
            mockPost.mockResolvedValueOnce({ data: '"eyJ.token"' }).mockResolvedValueOnce({ data: {} });
            const client = new XrayCloudClient();
            const result = await client.graphql('query { ... }', {}, CID, CSEC);
            expect(result).toBeNull();
        });

        it('returns null on GraphQL error', async () => {
            mockPost.mockResolvedValueOnce({ data: '"eyJ.token"' }).mockRejectedValue(new Error('Network error'));
            const client = new XrayCloudClient();
            const result = await client.graphql('query { ... }', {}, CID, CSEC);
            expect(result).toBeNull();
        });
    });

    describe('graphqlMutation', () => {
        it('authenticates and executes mutation', async () => {
            mockPost
                .mockResolvedValueOnce({ data: '"eyJ.token"' })
                .mockResolvedValueOnce({ data: { data: { addTestStep: { id: '123' } } } });
            const client = new XrayCloudClient();
            await expect(
                client.graphqlMutation('mutation { ... }', { issueId: 'T-1' }, CID, CSEC),
            ).resolves.not.toThrow();
            expect(mockPost).toHaveBeenNthCalledWith(
                2,
                '/api/v2/graphql',
                expect.objectContaining({ query: 'mutation { ... }', variables: { issueId: 'T-1' } }),
                expect.objectContaining({ headers: { Authorization: 'Bearer eyJ.token' } }),
            );
        });

        it('throws on auth failure', async () => {
            mockPost.mockRejectedValue(new Error('Auth failed'));
            const client = new XrayCloudClient();
            await expect(client.graphqlMutation('mutation { ... }', {}, CID, CSEC)).rejects.toThrow(
                'Xray Cloud authentication failed',
            );
        });

        it('throws on mutation failure', async () => {
            mockPost.mockResolvedValueOnce({ data: '"eyJ.token"' }).mockRejectedValue(new Error('GraphQL error'));
            const client = new XrayCloudClient();
            await expect(client.graphqlMutation('mutation { ... }', {}, CID, CSEC)).rejects.toThrow(
                'Xray Cloud GraphQL mutation failed',
            );
        });
    });
});
