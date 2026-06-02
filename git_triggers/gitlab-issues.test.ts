import { glGetOpenIssues } from './gitlab-issues';
import { apiGet, projectPath } from './gitlab-api';
import { nonNull } from '../shared/test-utils';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory';

jest.mock('./gitlab-api', () => ({
    apiGet: jest.fn(),
    apiPost: jest.fn(),
    apiPut: jest.fn(),
    projectPath: jest.fn(),
}));

const mockClient = createMockAxiosInstance();

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(projectPath).mockImplementation(
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
        jest.mocked(apiGet).mockResolvedValue([ISSUE_FIXTURE]);
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
        jest.mocked(apiGet).mockResolvedValue([]);
        await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(projectPath).toHaveBeenCalledWith('owner', 'repo');
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/issues'), {
            operation: 'buscar issues',
            params: { state: 'opened', per_page: 30 },
            returnNull: true,
        });
    });

    it('returns [] when data is null', async () => {
        jest.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('returns [] when data is not an array', async () => {
        jest.mocked(apiGet).mockResolvedValue({});
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('returns [] from empty array', async () => {
        jest.mocked(apiGet).mockResolvedValue([]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toEqual([]);
    });

    it('maps labels as flat strings', async () => {
        jest.mocked(apiGet).mockResolvedValue([{ ...ISSUE_FIXTURE, labels: ['bug', 'priority:high'] }]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(nonNull(result[0]).labels).toEqual(['bug', 'priority:high']);
    });

    it('handles missing optional fields gracefully', async () => {
        jest.mocked(apiGet).mockResolvedValue([{ iid: 1 }]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(nonNull(result[0]).title).toBe('');
        expect(nonNull(result[0]).number).toBe(1);
        expect(nonNull(result[0]).labels).toEqual([]);
        expect(nonNull(result[0]).html_url).toBe('');
    });

    it('filters out null items from array', async () => {
        jest.mocked(apiGet).mockResolvedValue([null, ISSUE_FIXTURE]);
        const result = await glGetOpenIssues(mockClient, 'owner', 'repo');
        expect(result).toHaveLength(1);
    });
});
