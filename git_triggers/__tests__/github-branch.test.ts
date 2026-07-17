import { getBranch, getDiff } from '../github-branch.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/circuit-breaker.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';

function axiosErr(status: number, url: string): unknown {
    return { response: { status }, config: { url } };
}

describe('Github Branch', () => {
    describe('GetBranch', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns { name } for valid branch', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { name: 'main', commit: { sha: 'abc' } } });
            const result = await getBranch(client, 'myorg', 'myrepo', 'main');

            expect(result).toStrictEqual({ name: 'main' });
            expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/branches/main');
        });

        it('encodes branch name in URL', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { name: 'feature/test' } });
            const result = await getBranch(client, 'myorg', 'myrepo', 'feature/test');

            expect(result).toStrictEqual({ name: 'feature/test' });
            expect(client['get']).toHaveBeenCalledWith('/repos/myorg/myrepo/branches/feature%2Ftest');
        });

        it('returns null when data has no name', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { commit: { sha: 'abc' } } });
            const result = await getBranch(client, 'myorg', 'myrepo', 'main');

            expect(result).toBeNull();
        });

        it('returns null on 404 (branch not found)', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(404, '/repos/myorg/myrepo/branches/missing'));
            const result = await getBranch(client, 'myorg', 'myrepo', 'missing');

            expect(result).toBeNull();
        });

        it('throws ExternalError (notFound) does not leak other statuses', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(403, '/repos/myorg/myrepo/branches/main'));

            await expect(getBranch(client, 'myorg', 'myrepo', 'main')).rejects.toBeInstanceOf(ExternalError);
        });
    });

    describe('GetDiff', () => {
        let client: Mocked<AxiosInstance>;

        beforeEach(() => {
            resetCircuitState();
            client = createMockAxiosInstance();
        });

        it('returns formatted diff string for valid comparison', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: {
                    files: [
                        { filename: 'src/main.ts', patch: '+console.log("hi")', status: 'modified' },
                        { filename: 'src/utils.ts', patch: '-old\n+new', status: 'modified' },
                    ],
                },
            });
            const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');

            expect(result).toContain('src/main.ts');
            expect(result).toContain('console.log');
            expect(result).toContain('src/utils.ts');
            expect(client['get']).toHaveBeenCalledWith(
                '/repos/myorg/myrepo/compare/main...feature',
                expect.any(Object),
            );
        });

        it('returns empty string when data is null', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: null });
            const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');

            expect(result).toBe('');
        });

        it('returns empty string when data.files is empty', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { files: [] } });
            const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');

            expect(result).toBe('');
        });

        it('handles missing patch property in files', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({
                data: { files: [{ filename: 'readme.md', status: 'modified' }] },
            });
            const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');

            expect(result).toBe('');
        });

        it('encodes branch names in compare URL', async () => {
            expect.hasAssertions();

            client.get.mockResolvedValue({ data: { files: [] } });
            await getDiff(client, 'myorg', 'myrepo', 'feat/source', 'fix/target');

            expect(client['get']).toHaveBeenCalledWith(
                '/repos/myorg/myrepo/compare/fix%2Ftarget...feat%2Fsource',
                expect.any(Object),
            );
        });

        it('throws ExternalError on API failure', async () => {
            expect.hasAssertions();

            client.get.mockRejectedValue(axiosErr(500, '/repos/myorg/myrepo/compare/main...feature'));

            await expect(getDiff(client, 'myorg', 'myrepo', 'feature', 'main')).rejects.toBeInstanceOf(ExternalError);
        });
    });
});
