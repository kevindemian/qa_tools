import type { AxiosInstance } from '../shared/deps';
import { apiGet, formatDiffResponse, projectPath } from './gitlab-api';

const DIFF_TRUNCATION_LIMIT = 15000;

export async function glGetBranch(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<{ name: string } | null> {
    const base = projectPath(owner, repo);
    const data = await apiGet<{ name: string }>(client, base + `/repository/branches/${encodeURIComponent(branch)}`, {
        operation: 'buscar branch',
        returnNull: true,
    });
    return data ? { name: data.name } : null;
}

export async function glGetDiff(
    client: AxiosInstance,
    owner: string,
    repo: string,
    source: string,
    target: string,
): Promise<string> {
    const base = projectPath(owner, repo);
    const data = await apiGet<{ diffs?: Array<Record<string, unknown>> }>(client, base + '/repository/compare', {
        operation: 'comparar branches',
        params: { from: source, to: target },
        returnNull: true,
    });
    return formatDiffResponse(data?.diffs, 'diff', 'new_path', DIFF_TRUNCATION_LIMIT);
}
