import type { AxiosInstance } from '../shared/deps';
import { info } from '../shared/prompt';
import { handleError } from '../shared/git-provider-error';
import type { MergeRequestInfo, JsonObject } from '../shared/types';
import { apiGet, apiPost, apiPatch } from './github-api';

const SEARCH_PRS_PAGE_SIZE = 100;

export function formatPR(data: JsonObject): MergeRequestInfo | null {
    if (!data) return null;
    return {
        iid: data.number as string | number,
        number: data.number as string | number,
        title: data.title as string,
        state: data.merged ? 'merged' : data.state === 'closed' ? 'closed' : 'opened',
        web_url: data.html_url as string,
        description: data.body as string,
        source_branch: ((data.head as JsonObject) || {}).ref as string,
        target_branch: ((data.base as JsonObject) || {}).ref as string,
        approved: false,
    };
}

export async function prCreateMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
): Promise<MergeRequestInfo | null> {
    const repoPath = '/repos/' + owner + '/' + repo;
    const body = {
        head: sourceBranch,
        base: targetBranch,
        title,
        body: description,
    };
    try {
        const data = await apiPost(client, repoPath + '/pulls', body, { operation: 'criar PR' });
        return formatPR(data);
    } catch (err: unknown) {
        const ghErr = err as { response?: { status?: number; data?: { errors?: Array<{ message: string }> } } };
        if (ghErr.response?.status === 422) {
            const errors = ghErr.response?.data?.errors || [];
            const alreadyExists = errors.some(
                (e: { message: string }) => e.message && e.message.includes('already exists'),
            );
            if (alreadyExists) {
                info('PR already exists. Searching for existing...');
                const existing = await prSearchMergeRequests(client, owner, repo, sourceBranch, targetBranch, 'open');
                if (existing && existing.length > 0 && existing[0]?.number) {
                    return prUpdateMergeRequest(client, owner, repo, existing[0].number, title, description);
                }
            }
        }
        return handleError(err, { context: 'criar PR' });
    }
}

export async function prUpdateMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
    title: string,
    description?: string,
): Promise<MergeRequestInfo | null> {
    const repoPath = '/repos/' + owner + '/' + repo;
    const data = await apiPatch(
        client,
        repoPath + '/pulls/' + iid,
        { title, body: description },
        { operation: 'atualizar PR' },
    );
    return formatPR(data);
}

export async function prGetMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
): Promise<MergeRequestInfo | null> {
    const repoPath = '/repos/' + owner + '/' + repo;
    const data = await apiGet(client, repoPath + '/pulls/' + iid, {
        operation: 'buscar PR',
        returnNull: true,
    });
    return data ? formatPR(data) : null;
}

export async function prSearchMergeRequests(
    client: AxiosInstance,
    owner: string,
    repo: string,
    sourceBranch: string,
    targetBranch: string,
    searchStatus: string,
): Promise<MergeRequestInfo[]> {
    const repoPath = '/repos/' + owner + '/' + repo;
    const params: JsonObject = { per_page: SEARCH_PRS_PAGE_SIZE };
    if (sourceBranch) params.head = owner + ':' + sourceBranch;
    if (targetBranch) params.base = targetBranch;
    if (searchStatus) params.state = searchStatus === 'opened' ? 'open' : searchStatus;

    const data = await apiGet<JsonObject[]>(client, repoPath + '/pulls', {
        operation: 'buscar PRs',
        params,
        returnNull: true,
    });
    if (!data) return [];
    return data.reduce<MergeRequestInfo[]>((acc, pr) => {
        const formatted = formatPR(pr);
        if (formatted) acc.push(formatted);
        return acc;
    }, []);
}

export async function prAcceptMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
    shouldRemoveSourceBranch = true,
): Promise<MergeRequestInfo | null> {
    const repoPath = '/repos/' + owner + '/' + repo;
    try {
        const pr = await prGetMergeRequest(client, owner, repo, iid);
        if (!pr) throw new Error('PR #' + iid + ' not found');
        if (pr.state === 'merged') {
            info('PR #' + iid + ' already merged');
            return pr;
        }
        const body: JsonObject = {};
        if (shouldRemoveSourceBranch) body.delete_branch_on_merge = true;
        const response = await client.put<JsonObject>(repoPath + '/pulls/' + iid + '/merge', body);
        return formatPR(response.data);
    } catch (err) {
        return handleError(err, { context: 'fazer merge' });
    }
}

export async function prIsApproved(
    client: AxiosInstance,
    owner: string,
    repo: string,
    prNumber: string | number,
): Promise<boolean> {
    const repoPath = '/repos/' + owner + '/' + repo;
    const data = await apiGet<JsonObject[]>(client, repoPath + '/pulls/' + prNumber + '/reviews', {
        operation: 'verificar reviews',
        returnNull: true,
    });
    return (data || []).some((r: JsonObject) => r.state === 'APPROVED');
}
