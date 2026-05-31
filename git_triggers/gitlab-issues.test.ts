import { glGetOpenIssues } from './gitlab-issues';
import { apiGet, projectPath } from './gitlab-api';
import type { AxiosInstance } from 'axios';

jest.mock('./gitlab-api', () => ({
    apiGet: jest.fn(),
    apiPost: jest.fn(),
    apiPut: jest.fn(),
    projectPath: jest.fn(),
}));

const mockClient = { get: jest.fn() } as unknown as jest.Mocked<AxiosInstance>;

beforeEach(() => {
    jest.clearAllMocks();
    (projectPath as jest.Mock).mockImplementation(
        (owner: string, repo: string) =>
            `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
    );
});

const ISSUE_FIXTURE = {
    iid: 42,
    title: 'Test bug',
    state: 'opened',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    labels: ['bug', 'critical'],
    web_url: 'https://gitlab.test.com/project/-/issues/42',
};

describe('glGetOpenIssues', () => {
    it('returns formatted issues from GET /issues', async () => {
        (apiGet as jest.Mock).mockResolvedValue([ISSUE_FIXTURE]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            number: 42,
            title: 'Test bug',
            state: 'opened',
            labels: ['bug', 'critical'],
        });
    });

    it('calls apiGet with correct params', async () => {
        (apiGet as jest.Mock).mockResolvedValue([]);
        await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(projectPath).toHaveBeenCalledWith('owner', 'repo');
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/issues'), {
            operation: 'buscar issues',
            params: { state: 'opened', per_page: 30 },
            returnNull: true,
        });
    });

    it('returns [] when data is null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('returns [] when data is not an array', async () => {
        (apiGet as jest.Mock).mockResolvedValue({});
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('returns [] from empty array', async () => {
        (apiGet as jest.Mock).mockResolvedValue([]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('maps labels as flat strings', async () => {
        (apiGet as jest.Mock).mockResolvedValue([{ ...ISSUE_FIXTURE, labels: ['bug', 'priority:high'] }]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result[0]!.labels).toEqual(['bug', 'priority:high']);
    });

    it('handles missing optional fields gracefully', async () => {
        (apiGet as jest.Mock).mockResolvedValue([{ iid: 1 }]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result[0]!.title).toBe('');
        expect(result[0]!.number).toBe(1);
        expect(result[0]!.labels).toEqual([]);
        expect(result[0]!.html_url).toBe('');
    });

    it('filters out null items from array', async () => {
        (apiGet as jest.Mock).mockResolvedValue([null, ISSUE_FIXTURE]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toHaveLength(1);
    });
});
