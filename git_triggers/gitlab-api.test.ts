import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { Mocked } from 'vitest';
import type { AxiosInstance } from '../shared/deps.js';
import { apiGet, apiPost, apiPut, projectPath, formatDiffResponse } from './gitlab-api.js';

vi.mock('../shared/git-provider-error', () => ({
    handleError: vi.fn((err: unknown, opts?: { returnNull?: boolean }) => {
        if (opts?.returnNull) return null;
        throw err;
    }),
}));

function mockClient(): Mocked<AxiosInstance> {
    return createMockAxiosInstance();
}

describe('ProjectPath', () => {
    it('encodes owner/repo pair', () => {
        expect(projectPath('my-group', 'my-project')).toBe('/projects/my-group%2Fmy-project');
    });

    it('uses only repo when owner is empty', () => {
        expect(projectPath('', 'my-project')).toBe('/projects/my-project');
    });

    it('encodes special characters in owner and repo', () => {
        expect(projectPath('group/sub', 'my/project')).toBe('/projects/group%2Fsub%2Fmy%2Fproject');
    });
});

describe('ApiGet', () => {
    it('returns data on successful get', async () => {expect.hasAssertions();

        const client = mockClient();
        client.get.mockResolvedValue({ data: { id: 1 } });
        const result = await apiGet(client, '/test');

        expect(result).toStrictEqual({ id: 1 });
    });

    it('passes params to client.get', async () => {expect.hasAssertions();

        const client = mockClient();
        client.get.mockResolvedValue({ data: [] });
        await apiGet(client, '/test', { params: { page: 2 } });

        expect(client['get']).toHaveBeenCalledWith('/test', { params: { page: 2 } });
    });

    it('calls get without params when no opts provided', async () => {expect.hasAssertions();

        const client = mockClient();
        client.get.mockResolvedValue({ data: 'ok' });
        await apiGet(client, '/test');

        expect(client['get']).toHaveBeenCalledWith('/test');
    });

    it('returns null on error when returnNull is true', async () => {expect.hasAssertions();

        const client = mockClient();
        client.get.mockRejectedValue(new Error('fail'));
        const result = await apiGet(client, '/test', { returnNull: true });

        expect(result).toBeNull();
    });

    it('re-throws on error when returnNull is not set', async () => {expect.hasAssertions();

        const client = mockClient();
        client.get.mockRejectedValue(new Error('fail'));

        await expect(apiGet(client, '/test')).rejects.toThrow('fail');
    });
});

describe('ApiPost', () => {
    it('returns data on successful post with body', async () => {expect.hasAssertions();

        const client = mockClient();
        client.post.mockResolvedValue({ data: { id: 1 } });
        const result = await apiPost(client, '/test', { name: 'foo' });

        expect(result).toStrictEqual({ id: 1 });
        expect(client['post']).toHaveBeenCalledWith('/test', { name: 'foo' });
    });

    it('calls post without body when body is undefined', async () => {expect.hasAssertions();

        const client = mockClient();
        client.post.mockResolvedValue({ data: null });
        await apiPost(client, '/test');

        expect(client['post']).toHaveBeenCalledWith('/test');
    });

    it('calls post with explicit undefined body', async () => {expect.hasAssertions();

        const client = mockClient();
        client.post.mockResolvedValue({ data: null });
        await apiPost(client, '/test', undefined);

        expect(client['post']).toHaveBeenCalledWith('/test');
    });

    it('calls post with null body', async () => {expect.hasAssertions();

        const client = mockClient();
        client.post.mockResolvedValue({ data: null });
        await apiPost(client, '/test', null);

        expect(client['post']).toHaveBeenCalledWith('/test', null);
    });

    it('re-throws on error', async () => {expect.hasAssertions();

        const client = mockClient();
        client.post.mockRejectedValue(new Error('fail'));

        await expect(apiPost(client, '/test')).rejects.toThrow('fail');
    });
});

describe('ApiPut', () => {
    it('returns data on successful put with body', async () => {expect.hasAssertions();

        const client = mockClient();
        client.put.mockResolvedValue({ data: { id: 1 }, status: 200 });
        const result = await apiPut(client, '/test', { name: 'foo' });

        expect(result).toStrictEqual({ id: 1 });
        expect(client['put']).toHaveBeenCalledWith('/test', { name: 'foo' });
    });

    it('returns null on 204 status', async () => {expect.hasAssertions();

        const client = mockClient();
        client.put.mockResolvedValue({ data: {}, status: 204 });
        const result = await apiPut(client, '/test');

        expect(result).toBeNull();
    });

    it('calls put without body when body is undefined', async () => {expect.hasAssertions();

        const client = mockClient();
        client.put.mockResolvedValue({ data: null, status: 200 });
        await apiPut(client, '/test');

        expect(client['put']).toHaveBeenCalledWith('/test');
    });

    it('re-throws on error', async () => {expect.hasAssertions();

        const client = mockClient();
        client.put.mockRejectedValue(new Error('fail'));

        await expect(apiPut(client, '/test')).rejects.toThrow('fail');
    });
});

describe('FormatDiffResponse', () => {
    it('formats entries with patch content', () => {
        const entries = [
            { new_path: 'src/index.ts', diff: '@@ -1 +1 @@\n-foo\n+bar' },
            { new_path: 'src/utils.ts', diff: '@@ -5 +5 @@\n-old\n+new' },
        ];
        const result = formatDiffResponse(entries, 'diff', 'new_path');

        expect(result).toBe(
            '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-foo\n+bar\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -5 +5 @@\n-old\n+new',
        );
    });

    it('skips entries without patch field', () => {
        const entries = [
            { new_path: 'a.ts', diff: 'content' },
            { new_path: 'b.ts' },
            { new_path: 'c.ts', diff: 'more' },
        ];
        const result = formatDiffResponse(entries, 'diff', 'new_path');

        expect(result).toBe('--- a/a.ts\n+++ b/a.ts\ncontent\n--- a/c.ts\n+++ b/c.ts\nmore');
    });

    it('skips entries where patch is not a string', () => {
        const entries = [
            { new_path: 'a.ts', diff: 123 },
            { new_path: 'b.ts', diff: null },
        ];
        const result = formatDiffResponse(entries, 'diff', 'new_path');

        expect(result).toBe('');
    });

    it('returns empty string for null / undefined / non-array input', () => {
        expect(formatDiffResponse(null, 'diff', 'name')).toBe('');
        expect(formatDiffResponse(undefined, 'diff', 'name')).toBe('');

        expect(formatDiffResponse({} as Record<string, unknown>[], 'diff', 'name')).toBe('');
    });

    it('returns empty string for empty array', () => {
        expect(formatDiffResponse([], 'diff', 'name')).toBe('');
    });

    it('truncates when result exceeds limit', () => {
        const entries = [{ new_path: 'big.ts', diff: 'a'.repeat(200) }];
        const result = formatDiffResponse(entries, 'diff', 'new_path', 50);

        expect(result.length).toBeLessThanOrEqual(70);
        expect(result.endsWith('\n... (truncated)')).toBeTruthy();
    });

    it('does not truncate when result fits within limit', () => {
        const entries = [{ new_path: 'small.ts', diff: 'content' }];
        const result = formatDiffResponse(entries, 'diff', 'new_path', 15000);

        expect(result).toBe('--- a/small.ts\n+++ b/small.ts\ncontent');
        expect(result.endsWith('\n... (truncated)')).toBeFalsy();
    });
});
