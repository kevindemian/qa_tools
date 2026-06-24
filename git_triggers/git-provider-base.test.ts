import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import { GitProviderBase } from './git-provider-base.js';

class TestProvider extends GitProviderBase {
    client = createMockAxiosInstance();

    async publicGet(
        url: string,
        opts?: { operation?: string; returnNull?: boolean; params?: Record<string, unknown> },
    ) {
        return this._get(url, opts);
    }

    async publicPost(url: string, body?: unknown, opts?: { operation?: string }) {
        return this._post(url, body, opts);
    }

    publicFormatDiffResponse(
        entries: Array<Record<string, unknown>> | undefined | null,
        patchField: string,
        nameField: string,
        truncationLimit?: number,
    ) {
        return this._formatDiffResponse(entries, patchField, nameField, truncationLimit);
    }
}

describe('GitProviderBase._get', () => {
    it('returns data on successful get', async () => {expect.hasAssertions();

        const provider = new TestProvider();
        vi.spyOn(provider.client, 'get').mockResolvedValue({ data: { id: 1 } });
        const result = await provider.publicGet('/test');

        expect(result).toEqual({ id: 1 });
    });

    it('passes params to client.get', async () => {expect.hasAssertions();

        const provider = new TestProvider();
        const getSpy = vi.spyOn(provider.client, 'get').mockResolvedValue({ data: [] });
        await provider.publicGet('/test', { params: { page: 2 } });

        expect(getSpy).toHaveBeenCalledWith('/test', { params: { page: 2 } });
    });

    it('returns null on error when returnNull is set', async () => {expect.hasAssertions();

        const provider = new TestProvider();
        vi.spyOn(provider.client, 'get').mockRejectedValue(new Error('fail'));
        const result = await provider.publicGet('/test', { returnNull: true });

        expect(result).toBeNull();
    });
});

describe('GitProviderBase._post', () => {
    it('returns data on successful post', async () => {expect.hasAssertions();

        const provider = new TestProvider();
        vi.spyOn(provider.client, 'post').mockResolvedValue({ data: { key: 1 } });
        const result = await provider.publicPost('/test', { name: 'foo' });

        expect(result).toEqual({ key: 1 });
    });

    it('calls post without body when body is undefined', async () => {expect.hasAssertions();

        const provider = new TestProvider();
        const postSpy = vi.spyOn(provider.client, 'post').mockResolvedValue({ data: null });
        await provider.publicPost('/test');

        expect(postSpy).toHaveBeenCalledWith('/test');
    });
});

describe('GitProviderBase._formatDiffResponse', () => {
    it('formats entries with patch content', () => {
        const provider = new TestProvider();
        const entries = [
            { filename: 'src/index.ts', patch: '@@ -1 +1 @@\n-foo\n+bar', status: 'modified' },
            { filename: 'src/utils.ts', patch: '@@ -5 +5 @@\n-old\n+new', status: 'modified' },
        ];
        const result = provider.publicFormatDiffResponse(entries, 'patch', 'filename');

        expect(result).toBe(
            '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-foo\n+bar\n--- a/src/utils.ts\n+++ b/src/utils.ts\n@@ -5 +5 @@\n-old\n+new',
        );
    });

    it('skips entries without patch field', () => {
        const provider = new TestProvider();
        const entries = [
            { filename: 'a.ts', patch: 'content' },
            { filename: 'b.ts' },
            { filename: 'c.ts', patch: 'more' },
        ];
        const result = provider.publicFormatDiffResponse(entries, 'patch', 'filename');

        expect(result).toBe('--- a/a.ts\n+++ b/a.ts\ncontent\n--- a/c.ts\n+++ b/c.ts\nmore');
    });

    it('returns empty string for null / undefined / non-array input', () => {
        const provider = new TestProvider();

        expect(provider.publicFormatDiffResponse(null, 'patch', 'filename')).toBe('');
        expect(provider.publicFormatDiffResponse(undefined, 'patch', 'filename')).toBe('');
        expect(provider.publicFormatDiffResponse({} as Array<Record<string, unknown>>, 'patch', 'filename')).toBe('');
    });

    it('returns empty string for empty array', () => {
        const provider = new TestProvider();

        expect(provider.publicFormatDiffResponse([], 'patch', 'filename')).toBe('');
    });

    it('truncates when result exceeds truncationLimit', () => {
        const provider = new TestProvider();
        const entries = [{ filename: 'big.ts', patch: 'a'.repeat(200) }];
        const result = provider.publicFormatDiffResponse(entries, 'patch', 'filename', 50);

        expect(result.length).toBeLessThanOrEqual(70);
        expect(result.endsWith('\n... (truncated)')).toBeTruthy();
    });

    it('does not truncate when result fits within trim', () => {
        const provider = new TestProvider();
        const entries = [{ filename: 'small.ts', patch: 'content' }];
        const result = provider.publicFormatDiffResponse(entries, 'patch', 'filename', 15000);

        expect(result).toBe('--- a/small.ts\n+++ b/small.ts\ncontent');
        expect(result.endsWith('\n... (truncated)')).toBeFalsy();
    });
});
