import type { AxiosInstance } from '../shared/deps';
import { apiGet, formatDiffResponse } from './github-api';

const COMPARE_PAGE_SIZE = 100;
const DIFF_TRUNCATION_LIMIT = 15000;

export async function getBranch(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<{ name: string } | null> {
    const data = await apiGet<{ name: string }>(
        client,
        '/repos/' + owner + '/' + repo + '/branches/' + encodeURIComponent(branch),
        {
            returnNull: true,
        },
    );
    if (!data?.name) return null;
    return { name: data.name };
}

export async function getDiff(
    client: AxiosInstance,
    owner: string,
    repo: string,
    source: string,
    target: string,
): Promise<string> {
    const data = await apiGet<{ files?: Array<Record<string, unknown>> }>(
        client,
        '/repos/' + owner + '/' + repo + '/compare/' + encodeURIComponent(target) + '...' + encodeURIComponent(source),
        {
            operation: 'comparar branches',
            params: { per_page: COMPARE_PAGE_SIZE },
            returnNull: true,
        },
    );
    return formatDiffResponse(data?.files, 'patch', 'filename', DIFF_TRUNCATION_LIMIT);
}
