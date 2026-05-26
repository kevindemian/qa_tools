import { GitProviderBase } from './git-provider-base';

class TestProvider extends GitProviderBase {
    client: ReturnType<typeof import('../shared/http-client').createHttpClient> = {
        get: jest.fn(),
        post: jest.fn(),
    } as unknown as ReturnType<typeof import('../shared/http-client').createHttpClient>;

    async publicGet(
        url: string,
        opts?: { operation?: string; returnNull?: boolean; params?: Record<string, unknown> },
    ) {
        return this._get(url, opts);
    }

    async publicPost(url: string, body?: unknown, opts?: { operation?: string }) {
        return this._post(url, body, opts);
    }
}

describe('GitProviderBase._get', () => {
    it('returns data on successful get', async () => {
        const provider = new TestProvider();
        (provider.client.get as jest.Mock).mockResolvedValue({ data: { id: 1 } });
        const result = await provider.publicGet('/test');
        expect(result).toEqual({ id: 1 });
    });

    it('passes params to client.get', async () => {
        const provider = new TestProvider();
        (provider.client.get as jest.Mock).mockResolvedValue({ data: [] });
        await provider.publicGet('/test', { params: { page: 2 } });
        expect(provider.client.get).toHaveBeenCalledWith('/test', { params: { page: 2 } });
    });

    it('returns null on error when returnNull is set', async () => {
        const provider = new TestProvider();
        (provider.client.get as jest.Mock).mockRejectedValue(new Error('fail'));
        const result = await provider.publicGet('/test', { returnNull: true });
        expect(result).toBeNull();
    });
});

describe('GitProviderBase._post', () => {
    it('returns data on successful post', async () => {
        const provider = new TestProvider();
        (provider.client.post as jest.Mock).mockResolvedValue({ data: { key: 1 } });
        const result = await provider.publicPost('/test', { name: 'foo' });
        expect(result).toEqual({ key: 1 });
    });

    it('calls post without body when body is undefined', async () => {
        const provider = new TestProvider();
        (provider.client.post as jest.Mock).mockResolvedValue({ data: null });
        await provider.publicPost('/test');
        expect(provider.client.post).toHaveBeenCalledWith('/test');
    });
});
