/** GitLab API client: MRs, pipelines, reviews, and merge operations. */
import { createHttpClient } from '../shared/http-client';
import { info } from '../shared/prompt';
import { Logger } from '../shared/logger';
import { handleError } from '../shared/git-provider-error';
import { GitProviderBase } from './git-provider-base';
import type {
    GitProvider,
    PipelineTriggerResult,
    ScheduleInfo,
    MergeRequestInfo,
    PipelineRun,
    PipelineInfo,
    PipelineJob,
    ArtifactInfo,
    CICDVariable,
    JsonObject,
} from '../shared/types';

const SCHEDULES_PAGE_SIZE = 100;
const SEARCH_MRS_PAGE_SIZE = 100;
const VARIABLES_PAGE_SIZE = 100;
const DIFF_TRUNCATION_LIMIT = 15000;
const DEFAULT_PIPELINE_COUNT = 5;

class GitLabManager extends GitProviderBase implements GitProvider {
    provider = 'gitlab' as const;
    projectId: string;
    apiToken: string;
    apiUrl: string;
    client: ReturnType<typeof createHttpClient>;
    log: Logger;

    constructor(projectId: string, apiToken: string, gitlabBaseUrl: string) {
        super();
        if (!apiToken) {
            throw new Error('GitLab: apiToken é obrigatório');
        }
        if (!projectId) {
            throw new Error('GitLab: projectId é obrigatório');
        }
        this.projectId = projectId;
        this.apiToken = apiToken;
        this.apiUrl = `${gitlabBaseUrl}/api/v4/projects/${this.projectId}`;
        this.client = createHttpClient({
            baseUrl: this.apiUrl,
            authHeader: { 'PRIVATE-TOKEN': apiToken },
        });
        this.log = new Logger({ resource: 'GitLab', projectId });
    }

    async _put(url: string, body?: unknown, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.put(url, ...args);
            return response.status === 204 ? null : response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
    }

    async triggerPipeline(payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }): Promise<PipelineTriggerResult | undefined> {
        return this._post('/pipeline', payload, { operation: 'disparar pipeline' }) as Promise<
            PipelineTriggerResult | undefined
        >;
    }

    async getSchedules(): Promise<ScheduleInfo[]> {
        return (
            (await this._get('/pipeline_schedules', {
                operation: 'listar schedules',
                params: { per_page: SCHEDULES_PAGE_SIZE },
                returnNull: true,
            })) || []
        );
    }

    async runSchedule(scheduleId: string | number): Promise<JsonObject> {
        return this._post(`/pipeline_schedules/${scheduleId}/play`, undefined, { operation: 'disparar schedule' });
    }

    async createMergeRequest(
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        const body = {
            id: this.projectId,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title,
            description,
        };

        try {
            return await this._post('/merge_requests', body, { operation: 'criar MR' });
        } catch (err: unknown) {
            const glErr = err as { response?: { status?: number } };
            if (glErr.response?.status === 409) {
                info('MR already exists. Searching for existing...');
                const existing = await this.searchMergeRequests(sourceBranch, targetBranch, 'opened');
                if (existing && existing.length > 0) {
                    return this.updateMergeRequest(existing[0]!.iid!, title, description);
                }
            }
            throw err;
        }
    }

    async updateMergeRequest(
        iid: string | number,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        return this._put(`/merge_requests/${iid}`, { title, description }, { operation: 'atualizar MR' });
    }

    async getMergeRequest(iid: string | number): Promise<MergeRequestInfo | null> {
        return this._get(`/merge_requests/${iid}`, { operation: 'buscar MR', returnNull: true });
    }

    async searchMergeRequests(
        sourceBranch: string,
        targetBranch: string,
        searchStatus: string,
    ): Promise<MergeRequestInfo[]> {
        return (
            (await this._get('/merge_requests', {
                operation: 'buscar MRs',
                params: {
                    state: searchStatus,
                    source_branch: sourceBranch,
                    target_branch: targetBranch,
                    per_page: SEARCH_MRS_PAGE_SIZE,
                },
                returnNull: true,
            })) || []
        );
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true): Promise<MergeRequestInfo | null> {
        try {
            const mr = await this.getMergeRequest(iid);
            if (!mr) throw new Error(`MR #${iid} not found`);
            if (mr.state === 'merged') {
                info(`MR #${iid} already merged`);
                return mr;
            }
            return await this._put(
                `/merge_requests/${iid}/merge`,
                { should_remove_source_branch: shouldRemoveSourceBranch },
                { operation: 'fazer merge' },
            );
        } catch (err) {
            return handleError(err, { context: 'fazer merge' });
        }
    }

    async getRecentPipelines(count = DEFAULT_PIPELINE_COUNT): Promise<PipelineRun[]> {
        return (
            (await this._get('/pipelines', {
                operation: 'buscar pipelines',
                params: { per_page: count, order_by: 'updated_at' },
                returnNull: true,
            })) || []
        );
    }

    async getPipeline(pipelineId: string | number): Promise<PipelineInfo | null> {
        return this._get(`/pipelines/${pipelineId}`, { operation: 'buscar pipeline', returnNull: true });
    }

    async getPipelineJobs(pipelineId: string | number): Promise<PipelineJob[]> {
        const data = await this._get(`/pipelines/${pipelineId}/jobs`, {
            operation: 'listar jobs',
            returnNull: true,
        });
        return (data || []).map((j: JsonObject) => ({
            id: j.id,
            name: j.name,
            stage: j.stage,
            status: j.status,
        }));
    }

    async listPipelineArtifacts(pipelineId: string | number): Promise<ArtifactInfo[]> {
        const data = await this._get(`/pipelines/${pipelineId}/jobs`, {
            operation: 'listar artifacts',
            returnNull: true,
        });
        const jobs = data || [];
        return jobs
            .filter((j: JsonObject) => j.artifacts_file || (j.artifacts && (j.artifacts as Array<unknown>).length > 0))
            .map((j: JsonObject) => ({ id: j.id, name: j.name }));
    }

    async getCICDVariables(): Promise<CICDVariable[]> {
        return (
            (await this._get('/variables', {
                operation: 'buscar variáveis CI/CD',
                params: { per_page: VARIABLES_PAGE_SIZE },
                returnNull: true,
            })) || []
        );
    }

    async getBranch(branch: string): Promise<{ name: string } | null> {
        const data = await this._get(`/repository/branches/${encodeURIComponent(branch)}`, {
            operation: 'buscar branch',
            returnNull: true,
        });
        return data ? { name: data.name as string } : null;
    }

    async getDiff(source: string, target: string): Promise<string> {
        const data = await this._get('/repository/compare', {
            operation: 'comparar branches',
            params: { from: source, to: target },
            returnNull: true,
        });
        if (!data?.diffs || !Array.isArray(data.diffs)) return '';
        const lines: string[] = [];
        for (const d of data.diffs as Array<{ diff?: string; new_path?: string }>) {
            if (d.diff) {
                lines.push('--- a/' + (d.new_path || ''));
                lines.push('+++ b/' + (d.new_path || ''));
                lines.push(d.diff);
            }
        }
        const full = lines.join('\n');
        return full.length > DIFF_TRUNCATION_LIMIT ? full.slice(0, DIFF_TRUNCATION_LIMIT) + '\n... (truncated)' : full;
    }

    async isApproved(mergeRequestIid: string | number): Promise<boolean> {
        const data = await this._get(`/merge_requests/${mergeRequestIid}/approvals`, {
            operation: 'verificar aprovação',
            returnNull: true,
        });
        return !!data?.approved;
    }

    async downloadArtifact(artifactId: string | number): Promise<{ buffer: Buffer; filename: string }> {
        try {
            const response = await this.client.get(`/jobs/${artifactId}/artifacts`, {
                responseType: 'arraybuffer',
            });
            const disposition = (response.headers['content-disposition'] as string) || '';
            const match = disposition.match(/filename="?(.+?)"?$/);
            const filename = match ? match[1]! : 'artifacts.zip';
            return { buffer: Buffer.from(response.data as ArrayBuffer), filename };
        } catch (err) {
            return handleError(err, { context: 'baixar artifact' });
        }
    }
}

export default GitLabManager;
