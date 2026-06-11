import type { AxiosInstance } from '../shared/deps.js';
import type { Issue } from '../shared/types.js';
import { apiGet } from './github-api.js';

const ISSUES_PAGE_SIZE = 30;

export async function getOpenIssues(client: AxiosInstance, owner: string, repo: string): Promise<Issue[]> {
    const data = await apiGet(client, '/repos/' + owner + '/' + repo + '/issues', {
        operation: 'buscar issues',
        params: { state: 'open', per_page: ISSUES_PAGE_SIZE },
        returnNull: true,
    });
    const items: unknown[] = Array.isArray(data) ? data : [];
    return items
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .filter((i) => !i['pull_request'])
        .map((i) => ({
            number: typeof i['number'] === 'number' ? i['number'] : 0,
            title: typeof i['title'] === 'string' ? i['title'] : '',
            state: typeof i['state'] === 'string' ? i['state'] : '',
            updated_at: typeof i['updated_at'] === 'string' ? i['updated_at'] : '',
            created_at: typeof i['created_at'] === 'string' ? i['created_at'] : '',
            labels: (Array.isArray(i['labels']) ? i['labels'] : [])
                .filter((l): l is Record<string, unknown> => l !== null && typeof l === 'object')
                .map((l) => (typeof l['name'] === 'string' ? l['name'] : '')),
            html_url: typeof i['html_url'] === 'string' ? i['html_url'] : '',
        }));
}
