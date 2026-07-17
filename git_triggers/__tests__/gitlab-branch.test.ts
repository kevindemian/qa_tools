import { glGetBranch, glGetDiff } from '../gitlab-branch.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/circuit-breaker.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';

function axiosErr(status: number, url: string): unknown {
    return { response: { status }, config: { url } };
}

describe('Gitlab Branch', () => {
    describe('GlGetBranch', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns { name } on success', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { name: 'main' } });
            const result = await glGetBranch(client, 'owner', 'repo', 'main');

            expect(result).toStrictEqual({ name: 'main' });
            expect(client['get']).toHaveBeenCalledWith('/projects/owner%2Frepo/repository/branches/main');
        });

        it('returns null when data has no name', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: {} });
            const result = await glGetBranch(client, 'owner', 'repo', 'main');

            expect(result).toBeNull();
        });

        it('returns null on 404 (branch not found)', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/projects/owner%2Frepo/repository/branches/missing'));
            const result = await glGetBranch(client, 'owner', 'repo', 'missing');

            expect(result).toBeNull();
        });

        it('throws ExternalError on non-404 failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/repository/branches/main'));

            await expect(glGetBranch(client, 'owner', 'repo', 'main')).rejects.toBeInstanceOf(ExternalError);
        });

        it('encodes branch name in URL', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: null });
            await glGetBranch(client, 'my-group', 'my-project', 'feature/x');

            expect(client['get']).toHaveBeenCalledWith(
                '/projects/my-group%2Fmy-project/repository/branches/feature%2Fx',
            );
        });
    });

    describe('GlGetDiff', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns formatted diff string', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: { diffs: [{ diff: '+console.log("hi")', new_path: 'src/main.ts' }] },
            });
            const result = await glGetDiff(client, 'owner', 'repo', 'feature', 'main');

            expect(result).toContain('src/main.ts');
            expect(result).toContain('console.log');
        });

        it('returns empty string when no diffs', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { diffs: [] } });
            const result = await glGetDiff(client, 'owner', 'repo', 'feature', 'main');

            expect(result).toBe('');
        });

        it('returns empty string when data is null', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: null });
            const result = await glGetDiff(client, 'owner', 'repo', 'feature', 'main');

            expect(result).toBe('');
        });

        it('calls compare endpoint with params', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { diffs: [] } });
            await glGetDiff(client, 'owner', 'repo', 'source', 'target');

            expect(client['get']).toHaveBeenCalledWith(
                '/projects/owner%2Frepo/repository/compare',
                expect.objectContaining({ params: { from: 'source', to: 'target' } }),
            );
        });

        it('throws ExternalError on API failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/projects/owner%2Frepo/repository/compare'));

            await expect(glGetDiff(client, 'owner', 'repo', 'feature', 'main')).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
