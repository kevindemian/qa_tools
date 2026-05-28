/** Tests for Xray per-test history providers, cache, and factory. */

import axios from 'axios';
import { createHistoryProvider, TestHistoryCache, type TestRun, type TestHistoryProvider } from './xray-history';
import Config from '../shared/config';
import type JiraResource from './jira_resource';

jest.mock('axios');
jest.mock('../shared/config');

const mockAxiosPost = jest.fn();
let mockIssueGet: jest.Mock;
let mockSearchGet: jest.Mock;

function mockJiraResource(): JiraResource {
    mockIssueGet = jest.fn();
    mockSearchGet = jest.fn();
    return {
        baseUrl: 'https://jira.example.com',
        axiosInstance: {} as ReturnType<typeof jest.fn>,
        log: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) } as unknown,
        getJiraResource: mockIssueGet,
        searchJiraIssues: mockSearchGet,
        getTransitionsForIssue: jest.fn(),
        getProjectId: jest.fn(),
        getProjectVersions: jest.fn(),
        getVersionId: jest.fn(),
        createVersion: jest.fn(),
        checkReleaseTasksStatus: jest.fn(),
        getReleaseTasks: jest.fn(),
        getLatestReleases: jest.fn(),
        addTasksToSprint: jest.fn(),
        updateFixVersions: jest.fn(),
        releaseVersion: jest.fn(),
        moveCardsToDone: jest.fn(),
        transitionIssue: jest.fn(),
        postJiraResource: jest.fn(),
        putJiraResource: jest.fn(),
    } as unknown as JiraResource;
}

beforeEach(() => {
    jest.clearAllMocks();
    (axios as unknown as { post: jest.Mock }).post = mockAxiosPost;
    (Config.getDefault as jest.Mock).mockReturnValue({
        xrayMode: 'server' as const,
        xrayClientId: '',
        xrayClientSecret: '',
    });
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
        jest.useFakeTimers();
        const cache = new TestHistoryCache(5000);
        cache.set('TEST-123', [{ status: 'PASSED', testExecKey: 'TE-1' }]);
        jest.advanceTimersByTime(6000);
        expect(cache.get('TEST-123')).toBeUndefined();
        jest.useRealTimers();
    });

    it('clears all entries', () => {
        const cache = new TestHistoryCache(60_000);
        cache.set('TEST-123', [{ status: 'PASSED', testExecKey: 'TE-1' }]);
        cache.clear();
        expect(cache.get('TEST-123')).toBeUndefined();
    });
});

// ─── createHistoryProvider ───────────────────────────────────────────────────

describe('createHistoryProvider', () => {
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

    it('returns parsed runs on successful API call', async () => {
        mockIssueGet.mockResolvedValue([
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
        expect(mockIssueGet).toHaveBeenCalledWith('rest/raven/1.0/api/test/TEST-123/testruns');
    });

    it('returns empty array on API error', async () => {
        mockIssueGet.mockRejectedValue(new Error('Network error'));
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });

    it('returns empty array when response is not an array', async () => {
        mockIssueGet.mockResolvedValue({ status: 'error' });
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });

    it('limits to MAX_RUNS items', async () => {
        const manyRuns = Array.from({ length: 50 }, (_, i) => ({
            status: 'PASS',
            testExecKey: 'TE-' + (i + 1),
        }));
        mockIssueGet.mockResolvedValue(manyRuns);
        const result = await provider.getHistory('TEST-123');
        expect(result).toHaveLength(20);
    });

    it('handles unknown status gracefully', async () => {
        mockIssueGet.mockResolvedValue([{ testExecKey: 'TE-1' }]);
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
        mockAxiosPost.mockReset();
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayMode: 'cloud',
            xrayClientId: 'client-123',
            xrayClientSecret: 'secret-456',
        });
        provider = createHistoryProvider(jira, 'cloud');
    });

    it('returns empty array when issueId resolution fails', async () => {
        mockIssueGet.mockRejectedValue(new Error('Not found'));
        const result = await provider.getHistory('TEST-999');
        expect(result).toEqual([]);
    });

    it('returns empty array when auth fails', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayMode: 'cloud',
            xrayClientId: '',
            xrayClientSecret: '',
        });
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });

    it('returns empty array when GraphQL returns no results', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockAxiosPost.mockResolvedValue({ data: { data: { getTestRuns: { results: [] } } } });
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });

    it('returns parsed runs on successful GraphQL call', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockAxiosPost.mockResolvedValueOnce({ data: 'my-token' }).mockResolvedValueOnce({
            data: {
                data: {
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
                },
            },
        });
        mockSearchGet.mockResolvedValue({
            issues: [
                { id: '111', key: 'TE-1', fields: { summary: '' } },
                { id: '222', key: 'TE-2', fields: { summary: '' } },
            ] as Array<{ id: string; key: string; fields: Record<string, unknown> }>,
        });

        const result = await provider.getHistory('TEST-123');
        expect(result).toHaveLength(2);
        expect(result[0]?.status).toBe('PASSED');
        expect(result[1]?.status).toBe('FAILED');
        expect(result[0]?.testExecKey).toBe('TE-1');
        expect(result[1]?.testExecKey).toBe('TE-2');
    });

    it('returns empty array on GraphQL error', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockAxiosPost.mockResolvedValueOnce({ data: 'my-token' }).mockRejectedValueOnce(new Error('GraphQL error'));
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });

    it('caches issueId resolution for same testKey', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        mockAxiosPost.mockResolvedValue({ data: { data: { getTestRuns: { results: [] } } } });
        await provider.getHistory('TEST-123');
        await provider.getHistory('TEST-123');
        expect(mockIssueGet).toHaveBeenCalledTimes(1);
    });
});

describe('CloudHistoryProvider — no credentials', () => {
    let provider: TestHistoryProvider;
    let jira: ReturnType<typeof mockJiraResource>;

    beforeEach(() => {
        jira = mockJiraResource();
        (Config.getDefault as jest.Mock).mockReturnValue({
            xrayMode: 'cloud',
            xrayClientId: '',
            xrayClientSecret: '',
        });
        provider = createHistoryProvider(jira, 'cloud');
    });

    it('returns empty array when credentials are missing', async () => {
        mockIssueGet.mockResolvedValue({ id: '12345' });
        const result = await provider.getHistory('TEST-123');
        expect(result).toEqual([]);
    });
});
