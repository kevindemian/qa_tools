import { apiGet, apiPost, apiPatch, formatDiffResponse } from '../github-api.js';
import { ExternalError } from '../../shared/errors.js';
import { resetCircuitState } from '../../shared/circuit-breaker.js';
import type { Mocked } from 'vitest';
import { createMockAxiosInstance } from '../../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../../shared/deps.js';

vi.mock('../../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(function () {
        return { error: vi.fn(), warn: vi.fn() };
    }),
    rootLogger: { error: vi.fn(), warn: vi.fn(), writeFileOnly: vi.fn() },
}));

describe('ApiGet', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('returns data on successful GET', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockResolvedValue({ data: { id: 1, name: 'test' } });
        const result = await apiGet(client, '/test');

        expect(result).toStrictEqual({ id: 1, name: 'test' });
    });

    it('passes params to client.get when provided', async () => {
        expect.hasAssertions();

        const getSpy = vi.spyOn(client, 'get').mockResolvedValue({ data: [] });
        await apiGet(client, '/test', { params: { page: 2, per_page: 10 } });

        expect(getSpy).toHaveBeenCalledWith('/test', { params: { page: 2, per_page: 10 } });
    });

    it('calls get without params when params not provided', async () => {
        expect.hasAssertions();

        const getSpy2 = vi.spyOn(client, 'get').mockResolvedValue({ data: 'ok' });
        await apiGet(client, '/test');

        expect(getSpy2).toHaveBeenCalledWith('/test');
    });

    it('throws ExternalError on error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockRejectedValue(new Error('fail'));

        await expect(apiGet(client, '/test')).rejects.toBeInstanceOf(ExternalError);
    });

    it('uses operation string in error context when provided', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'get').mockRejectedValue(new Error('fail'));

        await expect(apiGet(client, '/test', { operation: 'my operation' })).rejects.toThrow('fail');
    });
});

describe('ApiPost', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('returns data on successful POST with body', async () => {
        expect.hasAssertions();

        const postSpy = vi.spyOn(client, 'post').mockResolvedValue({ data: { id: 42 } });
        const result = await apiPost(client, '/test', { name: 'foo' });

        expect(result).toStrictEqual({ id: 42 });
        expect(postSpy).toHaveBeenCalledWith('/test', { name: 'foo' });
    });

    it('calls POST without body when body is undefined', async () => {
        expect.hasAssertions();

        const postSpy2 = vi.spyOn(client, 'post').mockResolvedValue({ data: null });
        await apiPost(client, '/test');

        expect(postSpy2).toHaveBeenCalledWith('/test');
    });

    it('throws on error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'post').mockRejectedValue(new Error('post fail'));

        await expect(apiPost(client, '/test', {})).rejects.toThrow('post fail');
    });
});

describe('ApiPatch', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        resetCircuitState();
        client = createMockAxiosInstance();
    });

    it('returns data on successful PATCH with body', async () => {
        expect.hasAssertions();

        const patchSpy = vi.spyOn(client, 'patch').mockResolvedValue({ data: { updated: true } });
        const result = await apiPatch(client, '/test', { title: 'new' });

        expect(result).toStrictEqual({ updated: true });
        expect(patchSpy).toHaveBeenCalledWith('/test', { title: 'new' });
    });

    it('calls PATCH without body when body is undefined', async () => {
        expect.hasAssertions();

        const patchSpy2 = vi.spyOn(client, 'patch').mockResolvedValue({ data: {} });
        await apiPatch(client, '/test');

        expect(patchSpy2).toHaveBeenCalledWith('/test');
    });

    it('throws on error', async () => {
        expect.hasAssertions();

        vi.spyOn(client, 'patch').mockRejectedValue(new Error('patch fail'));

        await expect(apiPatch(client, '/test', {})).rejects.toThrow('patch fail');
    });
});

describe('FormatDiffResponse', () => {
    it('formats entries with patch content', () => {
        const entries = [
            { filename: 'src/index.ts', patch: '@@ -1 +1 @@\n-foo\n+bar' },
            { filename: 'src/utils.ts', patch: '@@ -5 +5 @@\n-old\n+new' },
        ];
        const result = formatDiffResponse(entries, 'patch', 'filename');

        expect(result).toBe(
            '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-foo\n+bar\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -5 +5 @@\n-old\n+new',
        );
    });

    it('skips entries without patch field', () => {
        const entries = [
            { filename: 'a.ts', patch: 'content' },
            { filename: 'b.ts' },
            { filename: 'c.ts', patch: 'more' },
        ];
        const result = formatDiffResponse(entries, 'patch', 'filename');

        expect(result).toBe('--- a/a.ts\n+++ b/a.ts\ncontent\n--- a/c.ts\n+++ b/c.ts\nmore');
    });

    it('returns empty string for null/undefined/non-array input', () => {
        expect(formatDiffResponse(null, 'patch', 'filename')).toBe('');
        expect(formatDiffResponse(undefined, 'patch', 'filename')).toBe('');
        expect(formatDiffResponse({} as Array<Record<string, unknown>>, 'patch', 'filename')).toBe('');
    });

    it('returns empty string for empty array', () => {
        expect(formatDiffResponse([], 'patch', 'filename')).toBe('');
    });

    it('truncates when result exceeds truncationLimit', () => {
        const entries = [{ filename: 'big.ts', patch: 'a'.repeat(200) }];
        const result = formatDiffResponse(entries, 'patch', 'filename', 50);

        expect(result.endsWith('\n... (truncated)')).toBeTruthy();
        expect(result.length).toBeLessThanOrEqual(70);
    });

    it('does not truncate when result fits within limit', () => {
        const entries = [{ filename: 'small.ts', patch: 'content' }];
        const result = formatDiffResponse(entries, 'patch', 'filename', 15000);

        expect(result).toBe('--- a/small.ts\n+++ b/small.ts\ncontent');
        expect(result.endsWith('\n... (truncated)')).toBeFalsy();
    });

    it('handles non-string name field gracefully', () => {
        const entries = [{ patch: 'diff', name: 123 }];
        const result = formatDiffResponse(entries, 'patch', 'name');

        expect(result).toBe('--- a/\n+++ b/\ndiff');
    });

    it('handles non-string patch field gracefully', () => {
        const entries = [{ filename: 'f.ts', patch: 42 }];
        const result = formatDiffResponse(entries, 'patch', 'filename');

        expect(result).toBe('');
    });
});
