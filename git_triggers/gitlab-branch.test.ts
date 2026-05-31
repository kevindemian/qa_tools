import { glGetBranch, glGetDiff } from './gitlab-branch';
import { apiGet, projectPath, formatDiffResponse } from './gitlab-api';
import type { AxiosInstance } from 'axios';

jest.mock('./gitlab-api', () => ({
    apiGet: jest.fn(),
    apiPost: jest.fn(),
    apiPut: jest.fn(),
    projectPath: jest.fn(),
    formatDiffResponse: jest.fn(),
}));

const mockClient = { get: jest.fn() } as unknown as jest.Mocked<AxiosInstance>;

beforeEach(() => {
    jest.clearAllMocks();
    (projectPath as jest.Mock).mockImplementation(
        (owner: string, repo: string) =>
            `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
    );
    (formatDiffResponse as jest.Mock).mockImplementation(
        (entries: Array<Record<string, unknown>> | undefined | null, _patchField: string, _nameField: string) => {
            if (!entries || !Array.isArray(entries)) return '';
            return entries
                .filter((e) => e.diff && typeof e.diff === 'string')
                .map((e) => {
                    const newPath = typeof e.new_path === 'string' ? e.new_path : '';
                    const diff = typeof e.diff === 'string' ? e.diff : '';
                    return `--- a/${newPath}\n+++ b/${newPath}\n${diff}`;
                })
                .join('\n');
        },
    );
});

describe('glGetBranch', () => {
    it('returns { name } on success', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ name: 'main' });
        const result = await glGetBranch(mockClient, 'owner', 'repo', 'main');
        expect(result).toEqual({ name: 'main' });
    });

    it('returns null when apiGet returns null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glGetBranch(mockClient, 'owner', 'repo', 'main');
        expect(result).toBeNull();
    });

    it('calls apiGet with correct URL encoding branch name', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        await glGetBranch(mockClient, 'my-group', 'my-project', 'feature/x');
        expect(projectPath).toHaveBeenCalledWith('my-group', 'my-project');
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/repository/branches/feature%2Fx'), {
            operation: 'buscar branch',
            returnNull: true,
        });
    });
});

describe('glGetDiff', () => {
    it('returns formatted diff string', async () => {
        (apiGet as jest.Mock).mockResolvedValue({
            diffs: [{ diff: '+console.log("hi")', new_path: 'src/main.ts' }],
        });
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');
        expect(result).toContain('src/main.ts');
        expect(result).toContain('console.log');
    });

    it('returns empty string when no diffs', async () => {
        (apiGet as jest.Mock).mockResolvedValue({ diffs: [] });
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');
        expect(result).toBe('');
    });

    it('returns empty string when apiGet returns null', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');
        expect(result).toBe('');
    });

    it('calls apiGet with compare endpoint and params', async () => {
        (apiGet as jest.Mock).mockResolvedValue(null);
        await glGetDiff(mockClient, 'owner', 'repo', 'source', 'target');
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/repository/compare'), {
            operation: 'comparar branches',
            params: { from: 'source', to: 'target' },
            returnNull: true,
        });
    });
});
