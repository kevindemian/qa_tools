import { glGetBranch, glGetDiff } from './gitlab-branch.js';
import { apiGet, projectPath, formatDiffResponse } from './gitlab-api.js';
import { createMockAxiosInstance } from '../shared/test-utils/factories/response-factory.js';

vi.mock('./gitlab-api', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPut: vi.fn(),
    projectPath: vi.fn(),
    formatDiffResponse: vi.fn(),
}));

const mockClient = createMockAxiosInstance();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(projectPath).mockImplementation(
        (owner: string, repo: string) =>
            `/projects/${owner ? encodeURIComponent(owner + '/' + repo) : encodeURIComponent(repo)}`,
    );
    vi.mocked(formatDiffResponse).mockImplementation(
        (entries: Array<Record<string, unknown>> | undefined | null, _patchField: string, _nameField: string) => {
            if (!entries || !Array.isArray(entries)) return '';
            return entries
                .filter((e) => e['diff'] && typeof e['diff'] === 'string')
                .map((e) => {
                    const newPath = typeof e['new_path'] === 'string' ? e['new_path'] : '';
                    const diff = typeof e['diff'] === 'string' ? e['diff'] : '';
                    return `--- a/${newPath}\n+++ b/${newPath}\n${diff}`;
                })
                .join('\n');
        },
    );
});

describe('GlGetBranch', () => {
    it('returns { name } on success', async () => {
        vi.mocked(apiGet).mockResolvedValue({ name: 'main' });
        const result = await glGetBranch(mockClient, 'owner', 'repo', 'main');

        expect(result).toEqual({ name: 'main' });
    });

    it('returns null when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetBranch(mockClient, 'owner', 'repo', 'main');

        expect(result).toBeNull();
    });

    it('calls apiGet with correct URL encoding branch name', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        await glGetBranch(mockClient, 'my-group', 'my-project', 'feature/x');

        expect(projectPath).toHaveBeenCalledWith('my-group', 'my-project');
        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/repository/branches/feature%2Fx'), {
            operation: 'buscar branch',
            returnNull: true,
        });
    });
});

describe('GlGetDiff', () => {
    it('returns formatted diff string', async () => {
        vi.mocked(apiGet).mockResolvedValue({
            diffs: [{ diff: '+console.log("hi")', new_path: 'src/main.ts' }],
        });
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');

        expect(result).toContain('src/main.ts');
        expect(result).toContain('console.log');
    });

    it('returns empty string when no diffs', async () => {
        vi.mocked(apiGet).mockResolvedValue({ diffs: [] });
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');

        expect(result).toBe('');
    });

    it('returns empty string when apiGet returns null', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        const result = await glGetDiff(mockClient, 'owner', 'repo', 'feature', 'main');

        expect(result).toBe('');
    });

    it('calls apiGet with compare endpoint and params', async () => {
        vi.mocked(apiGet).mockResolvedValue(null);
        await glGetDiff(mockClient, 'owner', 'repo', 'source', 'target');

        expect(apiGet).toHaveBeenCalledWith(mockClient, expect.stringContaining('/repository/compare'), {
            operation: 'comparar branches',
            params: { from: 'source', to: 'target' },
            returnNull: true,
        });
    });
});
