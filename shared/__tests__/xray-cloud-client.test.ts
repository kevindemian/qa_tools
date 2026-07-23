import { afterEach, describe, expect, it, vi } from 'vitest';

const postSpy = vi.fn();
const fakeInstance = { post: postSpy };

vi.mock('../config-accessor.js', () => ({
    default: {
        getDefault: () => ({
            get: vi.fn((k: string) => (k === 'proxyUrl' ? undefined : 'https://xray.cloud.xpand-it.com')),
        }),
    },
}));
vi.mock('../infra/http-client.js', () => ({ createThrottledClient: vi.fn(() => fakeInstance) }));

import { XrayCloudClient } from '../jira/xray-cloud-client.js';

vi.mock('../logger.js', () => ({ rootLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

describe('Shared/xray-cloud-client', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    function makeClient(): XrayCloudClient {
        return new XrayCloudClient('https://xray.example');
    }

    describe('Authenticate', () => {
        it('returns and caches the token on success', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: '"tok-123"' });
            const client = makeClient();
            const token = await client.authenticate('id', 'secret');

            expect(token).toBe('tok-123');
            expect(postSpy).toHaveBeenCalledWith('/api/v2/authenticate', { client_id: 'id', client_secret: 'secret' });

            postSpy.mockClear();
            const second = await client.authenticate('id', 'secret');

            expect(second).toBe('tok-123');
            expect(postSpy).not.toHaveBeenCalled();
        });

        it('strips surrounding quotes from the token', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: 'tok-raw' });
            const token = await makeClient().authenticate('id', 'secret');

            expect(token).toBe('tok-raw');
        });

        it('returns null and warns when token is empty', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: '' });
            const token = await makeClient().authenticate('id', 'secret');

            expect(token).toBeNull();
        });

        it('returns null when the auth request throws', async () => {
            expect.hasAssertions();

            postSpy.mockRejectedValue(new Error('network'));
            const token = await makeClient().authenticate('id', 'secret');

            expect(token).toBeNull();
        });
    });

    describe('Graphql', () => {
        it('returns the data object on success', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: { data: { foo: 1 } } });
            const out = await makeClient().graphql('query', {}, 'id', 'secret');

            expect(out).toStrictEqual({ foo: 1 });
        });

        it('returns null when not authenticated', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: '' });
            const out = await makeClient().graphql('query', {}, 'id', 'secret');

            expect(out).toBeNull();
        });

        it('returns null when the GraphQL request throws', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValueOnce({ data: '"tok"' });
            postSpy.mockRejectedValueOnce(new Error('boom'));
            const out = await makeClient().graphql('query', {}, 'id', 'secret');

            expect(out).toBeNull();
        });
    });

    describe('GraphqlMutation', () => {
        it('resolves on success with no errors', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: { data: {}, errors: [] } });

            await expect(makeClient().graphqlMutation('m', {}, 'id', 'secret')).resolves.toBeUndefined();
        });

        it('throws when not authenticated', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: '' });

            await expect(makeClient().graphqlMutation('m', {}, 'id', 'secret')).rejects.toThrow(
                'Xray Cloud authentication failed',
            );
        });

        it('throws when GraphQL returns errors', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: { data: {}, errors: [{ message: 'bad' }] } });

            await expect(makeClient().graphqlMutation('m', {}, 'id', 'secret')).rejects.toThrow('bad');
        });
    });

    describe('AddPreconditionsToTest', () => {
        it('throws when test issue id is empty', async () => {
            expect.hasAssertions();
            await expect(makeClient().addPreconditionsToTest('', ['1'], 'id', 'secret')).rejects.toThrow(
                'requires a test issue id',
            );
        });

        it('throws when precondition list is empty', async () => {
            expect.hasAssertions();
            await expect(makeClient().addPreconditionsToTest('5', [], 'id', 'secret')).rejects.toThrow(
                'requires at least one precondition issue id',
            );
        });

        it('delegates to graphqlMutation with the right mutation', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: { data: {}, errors: [] } });
            await makeClient().addPreconditionsToTest('5', ['10', '11'], 'id', 'secret');

            const call = postSpy.mock.calls.find((c) => c[0] === '/api/v2/graphql');

            expect(call?.[0]).toBe('/api/v2/graphql');

            expect((call?.[1] as { query?: string } | undefined)?.query).toContain('addPreconditionsToTest');

            expect(
                (call?.[1] as { variables?: { testIssueId?: string; preconditionIssueIds?: string[] } } | undefined)
                    ?.variables,
            ).toStrictEqual({
                testIssueId: '5',
                preconditionIssueIds: ['10', '11'],
            });

            const headers = (call?.[2] as { headers?: { Authorization?: string } } | undefined)?.headers;

            expect(headers?.Authorization).toContain('Bearer');
        });
    });

    describe('AddTestsToTestExecution', () => {
        it('throws when test execution issue id is empty', async () => {
            expect.hasAssertions();
            await expect(makeClient().addTestsToTestExecution('', ['1'], 'id', 'secret')).rejects.toThrow(
                'requires a test execution issue id',
            );
        });

        it('throws when test issue id list is empty', async () => {
            expect.hasAssertions();
            await expect(makeClient().addTestsToTestExecution('5', [], 'id', 'secret')).rejects.toThrow(
                'requires at least one test issue id',
            );
        });

        it('delegates to graphqlMutation with the native addTestsToTestExecution mutation', async () => {
            expect.hasAssertions();

            postSpy.mockResolvedValue({ data: { data: {}, errors: [] } });
            await makeClient().addTestsToTestExecution('100', ['10', '11'], 'id', 'secret');

            const call = postSpy.mock.calls.find((c) => c[0] === '/api/v2/graphql');

            expect(call?.[0]).toBe('/api/v2/graphql');

            expect((call?.[1] as { query?: string } | undefined)?.query).toContain('addTestsToTestExecution');

            expect(
                (call?.[1] as { variables?: { issueId?: string; testIssueIds?: string[] } } | undefined)?.variables,
            ).toStrictEqual({
                issueId: '100',
                testIssueIds: ['10', '11'],
            });

            const headers = (call?.[2] as { headers?: { Authorization?: string } } | undefined)?.headers;

            expect(headers?.Authorization).toContain('Bearer');
        });
    });
});
