import type { AxiosInstance } from 'axios';
import { apiGet, formatDiffResponse, projectPath } from './gitlab-api';

const DIFF_TRUNCATION_LIMIT = 15000;

export async function glGetBranch(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<{ name: string } | null> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + `/repository/branches/${encodeURIComponent(branch)}`, {
        operation: 'buscar branch',
        returnNull: true,
    });
    return data ? { name: data.name as string } : null;
}

export async function glGetDiff(
    client: AxiosInstance,
    owner: string,
    repo: string,
    source: string,
    target: string,
): Promise<string> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + '/repository/compare', {
        operation: 'comparar branches',
        params: { from: source, to: target },
        returnNull: true,
    });
    return formatDiffResponse(
        data?.diffs as Array<Record<string, unknown>> | undefined,
        'diff',
        'new_path',
        DIFF_TRUNCATION_LIMIT,
    );
}
