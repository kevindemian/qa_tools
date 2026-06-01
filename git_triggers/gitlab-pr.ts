import type { AxiosInstance } from 'axios';
import { info } from '../shared/prompt';
import { handleError } from '../shared/git-provider-error';
import type { MergeRequestInfo, JsonObject } from '../shared/types';
import { apiGet, apiPost, apiPut, projectPath } from './gitlab-api';

const SEARCH_MRS_PAGE_SIZE = 100;

export function formatPR(data: JsonObject): MergeRequestInfo | null {
    if (!data) return null;
    return {
        iid: data.iid as string | number,
        number: data.iid as string | number,
        title: data.title as string,
        state: data.state as string,
        web_url: data.web_url as string,
        description: data.description as string,
        source_branch: data.source_branch as string,
        target_branch: data.target_branch as string,
        approved: !!data.approved,
    };
}

export async function glCreateMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description?: string,
): Promise<MergeRequestInfo | null> {
    const base = projectPath(owner, repo);
    const body = {
        id: owner ? owner + '/' + repo : repo,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        title,
        description,
    };
    try {
        const data = await apiPost<JsonObject>(client, base + '/merge_requests', body, { operation: 'criar MR' });
        return formatPR(data);
    } catch (err: unknown) {
        const glErr = err as { response?: { status?: number } };
        if (glErr.response?.status === 409) {
            info('MR already exists. Searching for existing...');
            const existing = await glSearchMergeRequests(client, owner, repo, sourceBranch, targetBranch, 'opened');
            if (existing && existing.length > 0 && existing[0]?.iid) {
                return glUpdateMergeRequest(client, owner, repo, existing[0].iid, title, description);
            }
        }
        throw err;
    }
}

export async function glUpdateMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
    title: string,
    description?: string,
): Promise<MergeRequestInfo | null> {
    const base = projectPath(owner, repo);
    const data = await apiPut<JsonObject>(
        client,
        base + `/merge_requests/${iid}`,
        { title, description },
        { operation: 'atualizar MR' },
    );
    return data ? formatPR(data) : null;
}

export async function glGetMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
): Promise<MergeRequestInfo | null> {
    const base = projectPath(owner, repo);
    const data = await apiGet<JsonObject>(client, base + `/merge_requests/${iid}`, {
        operation: 'buscar MR',
        returnNull: true,
    });
    return data ? formatPR(data) : null;
}

export async function glSearchMergeRequests(
    client: AxiosInstance,
    owner: string,
    repo: string,
    sourceBranch: string,
    targetBranch: string,
    searchStatus: string,
): Promise<MergeRequestInfo[]> {
    const base = projectPath(owner, repo);
    const data = await apiGet<JsonObject[]>(client, base + '/merge_requests', {
        operation: 'buscar MRs',
        params: {
            state: searchStatus,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            per_page: SEARCH_MRS_PAGE_SIZE,
        },
        returnNull: true,
    });
    return (data ?? []).map((mr) => formatPR(mr)).filter((x): x is MergeRequestInfo => x !== null);
}

export async function glAcceptMergeRequest(
    client: AxiosInstance,
    owner: string,
    repo: string,
    iid: string | number,
    shouldRemoveSourceBranch = true,
): Promise<MergeRequestInfo | null> {
    const base = projectPath(owner, repo);
    try {
        const mr = await glGetMergeRequest(client, owner, repo, iid);
        if (!mr) throw new Error(`MR #${iid} not found`);
        if (mr.state === 'merged') {
            info(`MR #${iid} already merged`);
            return mr;
        }
        const data = await apiPut<JsonObject>(
            client,
            base + `/merge_requests/${iid}/merge`,
            { should_remove_source_branch: shouldRemoveSourceBranch },
            { operation: 'fazer merge' },
        );
        return data ? formatPR(data) : null;
    } catch (err) {
        return handleError(err, { context: 'fazer merge' });
    }
}

export async function glIsApproved(
    client: AxiosInstance,
    owner: string,
    repo: string,
    mergeRequestIid: string | number,
): Promise<boolean> {
    const base = projectPath(owner, repo);
    const data = await apiGet<{ approved?: boolean }>(client, base + `/merge_requests/${mergeRequestIid}/approvals`, {
        operation: 'verificar aprovação',
        returnNull: true,
    });
    return !!data?.approved;
}
