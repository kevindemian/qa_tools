vi.mock('./http-client', () => ({
    createHttpClient: vi.fn(() => ({
        get: mockGet,
        post: mockPost,
        put: mockPut,
    })),
}));

import JiraClient from './jira-client.js';
import { createHttpClient } from './http-client.js';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();

const TOKEN = 'test-token-12345';
const BASE_URL = 'https://instance.atlassian.net/rest/api/2';
const CLOUD_CRED = 'user@example.com:APITOKEN123';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('JiraClient', () => {
    describe('constructor — auth mode', () => {
        it('stores baseUrl and personalToken', () => {
            const client = new JiraClient(TOKEN, BASE_URL);
            expect(client.baseUrl).toBe(BASE_URL);
            expect(client.personalToken).toBe(TOKEN);
        });

        it('parses originUrl from baseUrl', () => {
            const client = new JiraClient(TOKEN, BASE_URL);
            expect(client.originUrl).toBe('https://instance.atlassian.net');
        });

        it('defaults jiraMode to server', () => {
            const client = new JiraClient(TOKEN, BASE_URL);
            expect(client.jiraMode).toBe('server');
        });

        it('handles empty baseUrl without crashing', () => {
            const client = new JiraClient(TOKEN, '');
            expect(client.baseUrl).toBe('');
            expect(client.originUrl).toBe('');
        });

        it('handles invalid baseUrl without crashing', () => {
            const client = new JiraClient(TOKEN, '/rest/api/2');
            expect(client.originUrl).toBe('');
        });

        it('accepts explicit jiraMode', () => {
            const client = new JiraClient(TOKEN, BASE_URL, 'cloud');
            expect(client.jiraMode).toBe('cloud');
        });

        it('uses Bearer auth when mode is server (default)', () => {
            new JiraClient(TOKEN, BASE_URL);
            expect(createHttpClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    authHeader: { Authorization: `Bearer ${TOKEN}` },
                }),
            );
        });

        it('uses Basic auth when mode is cloud', () => {
            new JiraClient(CLOUD_CRED, BASE_URL, 'cloud');
            expect(createHttpClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    authHeader: { Authorization: `Basic ${Buffer.from(CLOUD_CRED).toString('base64')}` },
                }),
            );
        });
    });

    describe('getJiraResource', () => {
        it('returns data on successful GET', async () => {
            const data = { id: '123', key: 'TEST-1' };
            mockGet.mockResolvedValue({ data });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.getJiraResource('issue/TEST-1');
            expect(result).toEqual(data);
            expect(mockGet).toHaveBeenCalledWith('/issue/TEST-1');
        });

        it('throws on GET error', async () => {
            mockGet.mockRejectedValue(new Error('Network error'));
            const client = new JiraClient(TOKEN, BASE_URL);
            await expect(client.getJiraResource('issue/TEST-1')).rejects.toThrow('Network error');
        });
    });

    describe('postJiraResource', () => {
        it('returns data on successful POST', async () => {
            const payload = { fields: { summary: 'Test' } };
            const data = { id: '456', key: 'TEST-2' };
            mockPost.mockResolvedValue({ data });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.postJiraResource('issue', payload);
            expect(result).toEqual(data);
            expect(mockPost).toHaveBeenCalledWith('/issue', payload);
        });

        it('throws on POST error', async () => {
            mockPost.mockRejectedValue(new Error('Conflict'));
            const client = new JiraClient(TOKEN, BASE_URL);
            await expect(client.postJiraResource('issue', {})).rejects.toThrow('Conflict');
        });
    });

    describe('putJiraResource', () => {
        it('returns null on 204 response', async () => {
            mockPut.mockResolvedValue({ status: 204 });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.putJiraResource('issue/TEST-1', {});
            expect(result).toBeNull();
        });

        it('returns data on non-204 PUT', async () => {
            const data = { key: 'TEST-1' };
            mockPut.mockResolvedValue({ status: 200, data });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.putJiraResource('issue/TEST-1', {});
            expect(result).toEqual(data);
        });

        it('throws on PUT error', async () => {
            mockPut.mockRejectedValue(new Error('Forbidden'));
            const client = new JiraClient(TOKEN, BASE_URL);
            await expect(client.putJiraResource('issue/TEST-1', {})).rejects.toThrow('Forbidden');
        });
    });

    describe('getFromOriginPath', () => {
        it('builds full URL from origin and path', async () => {
            const data = { content: 'data' };
            mockGet.mockResolvedValue({ data });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.getFromOriginPath('secure/attachment/1');
            expect(result).toEqual(data);
            expect(mockGet).toHaveBeenCalledWith('https://instance.atlassian.net/secure/attachment/1');
        });

        it('strips leading slash from path', async () => {
            const data = { content: 'test' };
            mockGet.mockResolvedValue({ data });
            const client = new JiraClient(TOKEN, BASE_URL);
            await client.getFromOriginPath('/secure/attachment/2');
            expect(mockGet).toHaveBeenCalledWith('https://instance.atlassian.net/secure/attachment/2');
        });
    });

    describe('searchJiraIssues', () => {
        it('calls search with encoded JQL', async () => {
            const response = { total: 1, issues: [{ key: 'TEST-1' }] };
            mockGet.mockResolvedValue({ data: response });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.searchJiraIssues('project = TEST', 50);
            expect(result).toEqual(response);
            expect(mockGet).toHaveBeenCalledWith('/search?jql=project%20%3D%20TEST&maxResults=50');
        });
    });

    describe('getTransitionsForIssue', () => {
        it('returns transitions as name→id map', async () => {
            const data = {
                transitions: [
                    { id: '11', name: 'To Do' },
                    { id: '21', name: 'In Progress' },
                    { id: '31', name: 'Done' },
                ],
            };
            mockGet.mockResolvedValue({ data });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.getTransitionsForIssue('TEST-1');
            expect(result).toEqual({ 'To Do': '11', 'In Progress': '21', Done: '31' });
        });

        it('returns empty map when no transitions', async () => {
            mockGet.mockResolvedValue({ data: {} });
            const client = new JiraClient(TOKEN, BASE_URL);
            const result = await client.getTransitionsForIssue('TEST-1');
            expect(result).toEqual({});
        });
    });

    describe('transitionIssue', () => {
        it('posts transition payload', async () => {
            mockPost.mockResolvedValue({ data: {} });
            const client = new JiraClient(TOKEN, BASE_URL);
            await client.transitionIssue('TEST-1', '21');
            expect(mockPost).toHaveBeenCalledWith('/issue/TEST-1/transitions', {
                transition: { id: '21' },
            });
        });
    });
});
