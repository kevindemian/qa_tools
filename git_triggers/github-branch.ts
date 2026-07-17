import type { AxiosInstance } from '../shared/deps.js';
import { ExternalError } from '../shared/errors.js';
import { apiGet, formatDiffResponse } from './github-api.js';

const COMPARE_PAGE_SIZE = 100;
const DIFF_TRUNCATION_LIMIT = 15000;

export async function getBranch(
    client: AxiosInstance,
    owner: string,
    repo: string,
    branch: string,
): Promise<{ name: string } | null> {
    try {
        const data = await apiGet<{ name: string } | null>(
            client,
            '/repos/' + owner + '/' + repo + '/branches/' + encodeURIComponent(branch),
            { operation: 'buscar branch' },
        );
        return data?.name ? { name: data.name } : null;
    } catch (err) {
        if (err instanceof ExternalError && err.kind === 'notFound') return null;
        throw err;
    }
}

export async function getDiff(
    client: AxiosInstance,
    owner: string,
    repo: string,
    source: string,
    target: string,
): Promise<string> {
    const data = await apiGet<{ files?: Array<Record<string, unknown>> } | null>(
        client,
        '/repos/' + owner + '/' + repo + '/compare/' + encodeURIComponent(target) + '...' + encodeURIComponent(source),
        {
            operation: 'comparar branches',
            params: { per_page: COMPARE_PAGE_SIZE },
        },
    );
    return formatDiffResponse(data?.files, 'patch', 'filename', DIFF_TRUNCATION_LIMIT);
}
