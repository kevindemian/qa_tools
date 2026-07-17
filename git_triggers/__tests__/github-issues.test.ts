import { getOpenIssues } from '../github-issues.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/circuit-breaker.js';
import { nonNull } from '../../shared/test-utils.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';

function axiosErr(status: number, url: string): unknown {
    return { response: { status }, config: { url } };
}

describe('Github Issues', () => {
    describe('GetOpenIssues', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns issues filtering out pull requests', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: [
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
                ],
            });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toHaveLength(2);
            expect(nonNull(result[0]).number).toBe(1);
            expect(nonNull(result[0]).title).toBe('Bug fix');
            expect(nonNull(result[1]).number).toBe(3);
            expect(nonNull(result[1]).labels).toStrictEqual(['enhancement']);
            expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/issues', expect.any(Object));
        });

        it('returns empty array when data is not an array (malformed response)', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { message: 'error', something: true } });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toStrictEqual([]);
        });

        it('returns empty array when data is empty array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [] });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toStrictEqual([]);
        });

        it('handles items with missing optional fields gracefully', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: [{ number: 1, title: 'Minimal', state: 'open', labels: null, html_url: null }],
            });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).number).toBe(1);
            expect(nonNull(result[0]).title).toBe('Minimal');
            expect(nonNull(result[0]).labels).toStrictEqual([]);
            expect(nonNull(result[0]).html_url).toBe('');
        });

        it('maps label names correctly filtering out non-object labels', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: [
                    {
                        number: 1,
                        title: 'Labels test',
                        state: 'open',
                        updated_at: '',
                        created_at: '',
                        labels: [{ name: 'bug' }, null, { name: 'critical' }, 'not-an-object'],
                        html_url: '',
                    },
                ],
            });
            const result = await getOpenIssues(client, 'myorg', 'myrepo');

            expect(nonNull(result[0]).labels).toStrictEqual(['bug', 'critical']);
        });

        it('throws ExternalError on API failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/issues'));

            await expect(getOpenIssues(client, 'myorg', 'myrepo')).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
