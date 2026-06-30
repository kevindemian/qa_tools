import { getOpenIssues } from './github-issues.js';
import type { Mock, Mocked } from 'vitest';
import { nonNull } from '../shared/test-utils.js';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../shared/deps.js';

vi.mock('./github-api', () => ({
    apiGet: vi.fn(),
}));

vi.mock('../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(function () {
        return { error: vi.fn(), warn: vi.fn() };
    }),
    rootLogger: { error: vi.fn(), warn: vi.fn() },
}));

let mockApiGet: Mock;

describe('Github Issues', () => {
    beforeAll(async () => {
        mockApiGet = vi.mocked((await vi.importMock<typeof import('./github-api.js')>('./github-api')).apiGet);
    });

    describe('GetOpenIssues', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            client = createMockAxiosInstance();
            mockApiGet.mockClear();
        });

        it('returns issues filtering out pull requests', async () => {
            expect.hasAssertions();

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
            expect(nonNull(result[0]).number).toBe(1);
            expect(nonNull(result[0]).title).toBe('Bug fix');
            expect(nonNull(result[1]).number).toBe(3);
            expect(nonNull(result[1]).labels).toStrictEqual(['enhancement']);
            expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/issues', {
                operation: 'buscar issues',
                params: { state: 'open', per_page: 30 },
                returnNull: true,
            });
        });

        it('returns empty array when data is not an array', async () => {
            expect.hasAssertions();

            mockApiGet.mockResolvedValue({ message: 'error', something: true });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toStrictEqual([]);
        });

        it('returns empty array when apiGet returns null', async () => {
            expect.hasAssertions();

            mockApiGet.mockResolvedValue(null);
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toStrictEqual([]);
        });

        it('returns empty array when data is empty array', async () => {
            expect.hasAssertions();

            mockApiGet.mockResolvedValue([]);
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toStrictEqual([]);
        });

        it('handles items with missing optional fields gracefully', async () => {
            expect.hasAssertions();

            mockApiGet.mockResolvedValue([
                { number: 1, title: 'Minimal', state: 'open', labels: null, html_url: null },
            ]);
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).number).toBe(1);
            expect(nonNull(result[0]).title).toBe('Minimal');
            expect(nonNull(result[0]).labels).toStrictEqual([]);
            expect(nonNull(result[0]).html_url).toBe('');
        });

        it('maps label names correctly filtering out non-object labels', async () => {
            expect.hasAssertions();

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

            expect(nonNull(result[0]).labels).toStrictEqual(['bug', 'critical']);
        });
    });
});
