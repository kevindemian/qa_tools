import { getOpenIssues } from './github-issues';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory';
import type { AxiosInstance } from 'axios';

jest.mock('./github-api', () => ({
    apiGet: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    Logger: jest.fn().mockImplementation(() => ({ error: jest.fn(), warn: jest.fn() })),
    rootLogger: { error: jest.fn(), warn: jest.fn() },
}));

const mockApiGet = jest.mocked(jest.requireMock<typeof import('./github-api')>('./github-api').apiGet);

describe('getOpenIssues', () => {
    let client: jest.Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns issues filtering out pull requests', async () => {
        mockApiGet.mockResolvedValue([
            {
                number: 1,
                title: 'Bug fix',
                state: 'open',
                updated_at: '2024-01-01',
                created_at: '2024-01-01',
                labels: [],
                html_url: 'https://issue1',
            },
            {
                number: 2,
                title: 'PR title',
                state: 'open',
                updated_at: '2024-01-02',
                created_at: '2024-01-02',
                labels: [],
                html_url: 'https://pr2',
                pull_request: { url: 'https://pr2' },
            },
            {
                number: 3,
                title: 'Feature request',
                state: 'open',
                updated_at: '2024-01-03',
                created_at: '2024-01-03',
                labels: [{ name: 'enhancement' }],
                html_url: 'https://issue3',
            },
        ]);
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result).toHaveLength(2);
        expect(result[0]!.number).toBe(1);
        expect(result[0]!.title).toBe('Bug fix');
        expect(result[1]!.number).toBe(3);
        expect(result[1]!.labels).toEqual(['enhancement']);
        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/issues', {
            operation: 'buscar issues',
            params: { state: 'open', per_page: 30 },
            returnNull: true,
        });
    });

    it('returns empty array when data is not an array', async () => {
        mockApiGet.mockResolvedValue({ message: 'error', something: true });
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result).toEqual([]);
    });

    it('returns empty array when apiGet returns null', async () => {
        mockApiGet.mockResolvedValue(null);
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result).toEqual([]);
    });

    it('returns empty array when data is empty array', async () => {
        mockApiGet.mockResolvedValue([]);
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result).toEqual([]);
    });

    it('handles items with missing optional fields gracefully', async () => {
        mockApiGet.mockResolvedValue([{ number: 1, title: 'Minimal', state: 'open', labels: null, html_url: null }]);
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result).toHaveLength(1);
        expect(result[0]!.number).toBe(1);
        expect(result[0]!.title).toBe('Minimal');
        expect(result[0]!.labels).toEqual([]);
        expect(result[0]!.html_url).toBe('');
    });

    it('maps label names correctly filtering out non-object labels', async () => {
        mockApiGet.mockResolvedValue([
            {
                number: 1,
                title: 'Labels test',
                state: 'open',
                updated_at: '',
                created_at: '',
                labels: [{ name: 'bug' }, null, { name: 'critical' }, 'not-an-object'],
                html_url: '',
            },
        ]);
        const result = await getOpenIssues(client, 'myorg', 'myrepo');
        expect(result[0]!.labels).toEqual(['bug', 'critical']);
    });
});
