/** Tests for Xray per-test history providers, cache, and factory. */

import { createHistoryProvider, TestHistoryCache, type TestRun, type TestHistoryProvider } from './xray-history.js';
import Config from '../shared/config.js';
import type JiraResource from './jira_resource.js';
import { createMockConfigInstance } from '../shared/test-utils/factories/index.js';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';

type MockedJiraResource = ReturnType<typeof createMockJiraResource>;

const mockGraphql = vi.fn();

vi.mock('../shared/xray-cloud-client', () => ({
    XrayCloudClient: vi.fn(function () {
        return {
            graphql: mockGraphql,
            authenticate: vi.fn(),
            graphqlMutation: vi.fn(),
        };
    }),
}));

vi.mock('../shared/config');

let mockIssueGet: MockedJiraResource['getJiraResource'];
let mockOriginGet: MockedJiraResource['getFromOriginPath'];
let mockSearchGet: MockedJiraResource['searchJiraIssues'];

function mockJiraResource(): JiraResource {
    const mock = createMockJiraResource();
    mockIssueGet = mock['getJiraResource'];
    mockOriginGet = mock['getFromOriginPath'];
    mockSearchGet = mock['searchJiraIssues'];
    return mock;
}

beforeEach(() => {
    vi.clearAllMocks();
    const mockConfig = createMockConfigInstance();
    mockConfig.get = function <T = string>(key: string): T {
        const map: Record<string, string> = { xrayMode: 'server', xrayClientId: '', xrayClientSecret: '' };
        return (map[key] ?? '') as T;
    };
    vi.spyOn(Config, 'getDefault').mockReturnValue(mockConfig);
});

// ─── TestHistoryCache ────────────────────────────────────────────────────────

describe('TestHistoryCache', () => {
    it('stores and retrieves runs by key', () => {
        const cache = new TestHistoryCache(60_000);
        const runs: TestRun[] = [{ status: 'PASSED', testExecKey: 'TE-1', startedOn: '2024-01-01' }];
        cache.set('TEST-123', runs);

        expect(cache.get('TEST-123')).toEqual(runs);
    });

    it('returns undefined for missing key', () => {
        const cache = new TestHistoryCache(60_000);

        expect(cache.get('TEST-999')).toBeUndefined();
    });

    it('expires entries after TTL', () => {
        vi.useFakeTimers();
        const cache = new TestHistoryCache(5000);
        cache.set('TEST-123', [{ status: 'PASSED', testExecKey: 'TE-1' }]);
        vi.advanceTimersByTimeAsync(6000);

        expect(cache.get('TEST-123')).toBeUndefined();

        vi.useRealTimers();
    });

    it('clears all entries', () => {
        const cache = new TestHistoryCache(60_000);
        cache.set('TEST-123', [{ status: 'PASSED', testExecKey: 'TE-1' }]);
        cache.clear();

        expect(cache.get('TEST-123')).toBeUndefined();
    });
});

// ─── createHistoryProvider ───────────────────────────────────────────────────

describe('CreateHistoryProvider', () => {
    it('returns ServerHistoryProvider when mode=server', () => {
        const jira = mockJiraResource();
        const provider = createHistoryProvider(jira, 'server');

        expect(provider).toBeDefined();
        expect(typeof provider.getHistory).toBe('function');
    });

    it('returns CloudHistoryProvider when mode=cloud', () => {
        const jira = mockJiraResource();
        const provider = createHistoryProvider(jira, 'cloud');

        expect(provider).toBeDefined();
        expect(typeof provider.getHistory).toBe('function');
    });

    it('uses Config default when mode is not specified', () => {
        const jira = mockJiraResource();
        const provider = createHistoryProvider(jira);

        expect(provider).toBeDefined();
        expect(typeof provider.getHistory).toBe('function');
    });
});

// ─── ServerHistoryProvider ───────────────────────────────────────────────────

describe('ServerHistoryProvider', () => {
    let provider: TestHistoryProvider;
    let jira: ReturnType<typeof mockJiraResource>;

    beforeEach(() => {
        jira = mockJiraResource();
        provider = createHistoryProvider(jira, 'server');
    });

    it('returns parsed runs on successful API call', async () => {expect.hasAssertions();

        mockOriginGet.mockResolvedValue([
            { status: 'PASS', testExecKey: 'TE-1', startedOn: '2024-01-01' },
            { status: 'FAIL', testExecKey: 'TE-2', startedOn: '2024-01-02' },
        ]);
        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            status: 'PASS',
            testExecKey: 'TE-1',
            startedOn: '2024-01-01',
            finishedOn: undefined,
        });
        expect(result[1]).toEqual({
            status: 'FAIL',
            testExecKey: 'TE-2',
            startedOn: '2024-01-02',
            finishedOn: undefined,
        });
        expect(mockOriginGet).toHaveBeenCalledWith('rest/raven/1.0/api/test/TEST-123/testruns');
    });

    it('returns empty array on API error', async () => {expect.hasAssertions();

        mockOriginGet.mockRejectedValue(new Error('Network error'));
        const result = await provider.getHistory('TEST-123');

        expect(result).toEqual([]);
    });

    it('returns empty array when response is not an array', async () => {expect.hasAssertions();

        mockOriginGet.mockResolvedValue({ status: 'error' });
        const result = await provider.getHistory('TEST-123');

        expect(result).toEqual([]);
    });

    it('limits to MAX_RUNS items', async () => {expect.hasAssertions();

        const manyRuns = Array.from({ length: 50 }, (_, i) => ({
            status: 'PASS',
            testExecKey: 'TE-' + (i + 1),
        }));
        mockOriginGet.mockResolvedValue(manyRuns);
        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(20);
    });

    it('handles unknown status gracefully', async () => {expect.hasAssertions();

        mockOriginGet.mockResolvedValue([{ testExecKey: 'TE-1' }]);
        const result = await provider.getHistory('TEST-123');

        expect(result[0]?.status).toBe('UNKNOWN');
    });
});

// ─── CloudHistoryProvider ────────────────────────────────────────────────────

describe('CloudHistoryProvider', () => {
    let provider: TestHistoryProvider;
    let jira: ReturnType<typeof mockJiraResource>;

    beforeEach(() => {
        jira = mockJiraResource();
        mockGraphql.mockReset();
        const cloudMockConfig = createMockConfigInstance();
        cloudMockConfig.get = function <T = string>(key: string): T {
            const map: Record<string, string> = {
                xrayMode: 'cloud',
                xrayClientId: 'client-123',
                xrayClientSecret: 'secret-456',
            };
            return (map[key] ?? '') as T;
        };
        vi.spyOn(Config, 'getDefault').mockReturnValue(cloudMockConfig);
        provider = createHistoryProvider(jira, 'cloud');
    });

    it('returns empty array when issueId resolution fails', async () => {expect.hasAssertions();

        mockIssueGet.mockRejectedValue(new Error('Not found'));
        const result = await provider.getHistory('TEST-999');

        expect(result).toEqual([]);
    });

    it('returns empty array when credentials are missing', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        const missingCredsConfig = createMockConfigInstance();
        missingCredsConfig.get = function <T = string>(key: string): T {
            const map: Record<string, string> = { xrayMode: 'cloud', xrayClientId: '', xrayClientSecret: '' };
            return (map[key] ?? '') as T;
        };
        vi.spyOn(Config, 'getDefault').mockReturnValue(missingCredsConfig);
        const result = await provider.getHistory('TEST-123');

        expect(result).toEqual([]);
    });

    it('returns empty array when GraphQL returns no results', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue(null);
        const result = await provider.getHistory('TEST-123');

        expect(result).toEqual([]);
    });

    it('returns parsed runs on successful GraphQL call', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue({
            getTestRuns: {
                results: [
                    {
                        status: { name: 'PASSED' },
                        testExecution: { issueId: '111' },
                        startedOn: '2024-01-01',
                        finishedOn: null,
                    },
                    {
                        status: { name: 'FAILED' },
                        testExecution: { issueId: '222' },
                        startedOn: '2024-01-02',
                        finishedOn: '2024-01-02T12:00:00Z',
                    },
                ],
            },
        });
        const mockIssues = [
            { id: '111', key: 'TE-1', fields: { summary: '' } },
            { id: '222', key: 'TE-2', fields: { summary: '' } },
        ];
        mockSearchGet.mockResolvedValue({
            issues: mockIssues,
            total: 2,
        });

        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(2);
        expect(result[0]?.status).toBe('PASSED');
        expect(result[1]?.status).toBe('FAILED');
        expect(result[0]?.testExecKey).toBe('TE-1');
        expect(result[1]?.testExecKey).toBe('TE-2');
    });

    it('returns empty array on GraphQL error', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockRejectedValue(new Error('GraphQL error'));
        const result = await provider.getHistory('TEST-123');

        expect(result).toEqual([]);
    });

    it('caches issueId resolution for same testKey', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue(null);
        await provider.getHistory('TEST-123');
        await provider.getHistory('TEST-123');

        expect(mockIssueGet).toHaveBeenCalledTimes(1);
    });

    it('passes correct query to cloudClient.graphql', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue({ getTestRuns: { results: [] } });

        await provider.getHistory('TEST-123');

        expect(mockGraphql).toHaveBeenCalledTimes(1);

        const callArgs = mockGraphql.mock.calls[0] as unknown[];

        expect(callArgs[0] as string).toContain('getTestRuns');
        expect((callArgs[1] as Record<string, unknown>)['testIssueIds']).toEqual(['12345']);
        expect(callArgs[2]).toBe('client-123');
        expect(callArgs[3]).toBe('secret-456');
    });

    it('falls back to issue id when search does not return exec key', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue({
            getTestRuns: {
                results: [
                    {
                        status: { name: 'PASSED' },
                        testExecution: { issueId: '111' },
                        startedOn: null,
                        finishedOn: null,
                    },
                ],
            },
        });
        mockSearchGet.mockResolvedValue({ issues: [], total: 0 });
        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(1);
        expect(result[0]?.testExecKey).toBe('111');
    });

    it('returns results with fallback keys when exec key search fails', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue({
            getTestRuns: {
                results: [
                    {
                        status: { name: 'PASSED' },
                        testExecution: { issueId: '111' },
                        startedOn: null,
                        finishedOn: null,
                    },
                ],
            },
        });
        mockSearchGet.mockRejectedValue(new Error('Search failed'));
        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(1);
        expect(result[0]?.testExecKey).toBe('111');
    });

    it('caches exec keys and avoids re-fetching', async () => {expect.hasAssertions();

        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockGraphql.mockResolvedValue({
            getTestRuns: {
                results: [
                    {
                        status: { name: 'PASSED' },
                        testExecution: { issueId: '111' },
                        startedOn: null,
                        finishedOn: null,
                    },
                ],
            },
        });
        const singleIssue = { id: '111', key: 'TE-1', fields: { summary: '' } };
        mockSearchGet.mockResolvedValue({
            issues: [singleIssue],
            total: 1,
        });
        await provider.getHistory('TEST-123');

        expect(mockSearchGet).toHaveBeenCalledTimes(1);

        mockGraphql.mockResolvedValue({
            getTestRuns: {
                results: [
                    {
                        status: { name: 'PASSED' },
                        testExecution: { issueId: '111' },
                        startedOn: null,
                        finishedOn: null,
                    },
                ],
            },
        });
        const result = await provider.getHistory('TEST-123');

        expect(result).toHaveLength(1);
        expect(result[0]?.testExecKey).toBe('TE-1');
        expect(mockSearchGet).toHaveBeenCalledTimes(1);
    });
});
