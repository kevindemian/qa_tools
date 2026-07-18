import { glGetOpenIssues } from '../gitlab-issues.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/infra/circuit-breaker.js';
import { nonNull } from '../../shared/test-utils.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';

const ISSUE_FIXTURE = {
    iid: 42,
    title: 'Test bug',
    state: 'opened',
    updated_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    labels: ['bug', 'critical'],
    web_url: 'https://gitlab.test.com/project/-/issues/42',
};

function axiosErr(status: number, url: string): unknown {
    return { response: { status }, config: { url } };
}

describe('Gitlab Issues', () => {
    describe('GlGetOpenIssues', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns formatted issues from GET /issues', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [ISSUE_FIXTURE] });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                number: 42,
                title: 'Test bug',
                state: 'opened',
                labels: ['bug', 'critical'],
            });
            expect(client['get']).toHaveBeenCalledWith('/projects/owner%2Frepo/issues', expect.any(Object));
        });

        it('returns [] when data is not an array (malformed response)', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: {} });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(result).toStrictEqual([]);
        });

        it('returns [] from empty array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [] });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(result).toStrictEqual([]);
        });

        it('maps labels as flat strings', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [{ ...ISSUE_FIXTURE, labels: ['bug', 'priority:high'] }] });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(nonNull(result[0]).labels).toStrictEqual(['bug', 'priority:high']);
        });

        it('handles missing optional fields gracefully', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [{ iid: 1 }] });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(nonNull(result[0]).title).toBe('');
            expect(nonNull(result[0]).number).toBe(1);
            expect(nonNull(result[0]).labels).toStrictEqual([]);
            expect(nonNull(result[0]).html_url).toBe('');
        });

        it('filters out null items from array', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: [null, ISSUE_FIXTURE] });
            const result = await glGetOpenIssues(client, 'owner', 'repo');

            expect(result).toHaveLength(1);
        });

        it('throws ExternalError on API failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/issues'));

            await expect(glGetOpenIssues(client, 'owner', 'repo')).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
