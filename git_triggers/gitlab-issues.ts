import type { AxiosInstance } from '../shared/deps.js';
import type { Issue } from '../shared/types.js';
import { apiGet, projectPath } from './gitlab-api.js';

const ISSUES_PAGE_SIZE = 30;

export async function glGetOpenIssues(client: AxiosInstance, owner: string, repo: string): Promise<Issue[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet(client, base + '/issues', {
        operation: 'buscar issues',
        params: { state: 'opened', per_page: ISSUES_PAGE_SIZE },
        returnNull: true,
    });
    const items: unknown[] = Array.isArray(data) ? data : [];
    return items
        .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
        .map((i) => ({
            number: typeof i['iid'] === 'number' ? i['iid'] : 0,
            title: typeof i['title'] === 'string' ? i['title'] : '',
            state: typeof i['state'] === 'string' ? i['state'] : '',
            updated_at: typeof i['updated_at'] === 'string' ? i['updated_at'] : '',
            created_at: typeof i['created_at'] === 'string' ? i['created_at'] : '',
            labels: (Array.isArray(i['labels']) ? i['labels'] : []).filter((l): l is string => typeof l === 'string'),
            html_url: typeof i['web_url'] === 'string' ? i['web_url'] : '',
        }));
}
