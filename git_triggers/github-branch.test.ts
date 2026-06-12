import { getBranch, getDiff } from './github-branch.js';
import type { Mock, Mocked } from 'vitest';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';
import type { AxiosInstance } from '../shared/deps.js';

vi.mock('./github-api', async () => ({
    apiGet: vi.fn(),
    formatDiffResponse: (await vi.importActual('./github-api'))['formatDiffResponse'],
}));

vi.mock('../shared/logger', () => ({
    Logger: vi.fn().mockImplementation(function () {
        return { error: vi.fn(), warn: vi.fn() };
    }),
    rootLogger: { error: vi.fn(), warn: vi.fn() },
}));

let mockApiGet: Mock;
import * as apiModule from './github-api.js';
beforeAll(() => {
    mockApiGet = vi.spyOn(apiModule, 'apiGet');
});

describe('getBranch', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns { name } for valid branch', async () => {
        mockApiGet.mockResolvedValue({ name: 'main', commit: { sha: 'abc' } });
        const result = await getBranch(client, 'myorg', 'myrepo', 'main');
        expect(result).toEqual({ name: 'main' });
        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/branches/main', { returnNull: true });
    });

    it('encodes branch name in URL', async () => {
        mockApiGet.mockResolvedValue({ name: 'feature/test' });
        await getBranch(client, 'myorg', 'myrepo', 'feature/test');
        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/branches/feature%2Ftest', {
            returnNull: true,
        });
    });

    it('returns null when data has no name', async () => {
        mockApiGet.mockResolvedValue({ commit: { sha: 'abc' } });
        const result = await getBranch(client, 'myorg', 'myrepo', 'main');
        expect(result).toBeNull();
    });

    it('returns null when apiGet returns null', async () => {
        mockApiGet.mockResolvedValue(null);
        const result = await getBranch(client, 'myorg', 'myrepo', 'missing');
        expect(result).toBeNull();
    });
});

describe('getDiff', () => {
    let client: Mocked<AxiosInstance>;

    beforeEach(() => {
        client = createMockAxiosInstance();
        mockApiGet.mockClear();
    });

    it('returns formatted diff string for valid comparison', async () => {
        mockApiGet.mockResolvedValue({
            files: [
                { filename: 'src/main.ts', patch: '+console.log("hi")', status: 'modified' },
                { filename: 'src/utils.ts', patch: '-old\n+new', status: 'modified' },
            ],
        });
        const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');
        expect(result).toContain('src/main.ts');
        expect(result).toContain('console.log');
        expect(result).toContain('src/utils.ts');
        expect(mockApiGet).toHaveBeenCalledWith(client, '/repos/myorg/myrepo/compare/main...feature', {
            operation: 'comparar branches',
            params: { per_page: 100 },
            returnNull: true,
        });
    });

    it('returns empty string when data is null', async () => {
        mockApiGet.mockResolvedValue(null);
        const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');
        expect(result).toBe('');
    });

    it('returns empty string when data.files is empty', async () => {
        mockApiGet.mockResolvedValue({ files: [] });
        const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');
        expect(result).toBe('');
    });

    it('handles missing patch property in files', async () => {
        mockApiGet.mockResolvedValue({
            files: [{ filename: 'readme.md', status: 'modified' }],
        });
        const result = await getDiff(client, 'myorg', 'myrepo', 'feature', 'main');
        expect(result).toBe('');
    });

    it('encodes branch names in compare URL', async () => {
        mockApiGet.mockResolvedValue({ files: [] });
        await getDiff(client, 'myorg', 'myrepo', 'feat/source', 'fix/target');
        expect(mockApiGet).toHaveBeenCalledWith(
            client,
            '/repos/myorg/myrepo/compare/fix%2Ftarget...feat%2Fsource',
            expect.any(Object),
        );
    });
});
