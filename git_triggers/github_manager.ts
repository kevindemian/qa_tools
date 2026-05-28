/** GitHub API client: PRs, pipelines, reviews, checks, and merge operations. */
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

const LIST_WORKFLOWS_PAGE_SIZE = 10;
const SEARCH_PRS_PAGE_SIZE = 100;
const VARIABLES_PAGE_SIZE = 100;
const COMPARE_PAGE_SIZE = 100;
const MAX_REDIRECTS = 5;
const DIFF_TRUNCATION_LIMIT = 15000;
const DEFAULT_PIPELINE_COUNT = 5;

class GitHubManager extends GitProviderBase implements GitProvider {
    provider = 'github' as const;
    repoFullName: string;
    apiToken: string;
    apiUrl: string;
    client: ReturnType<typeof createHttpClient>;
    log!: Logger;
    owner!: string;
    repo!: string;

    constructor(repoFullName: string, apiToken: string, baseUrl?: string) {
        super();
        this.repoFullName = repoFullName;
        this.apiToken = apiToken;
        this.apiUrl = (baseUrl || 'https://api.github.com').replace(/\/+$/, '');
        if (!apiToken) {
            throw new Error('GitHub: apiToken é obrigatório');
        }
        if (!repoFullName || !repoFullName.includes('/')) {
            throw new Error('GitHub: repoFullName deve estar no formato "owner/repo"');
        }
        this.client = createHttpClient({
            baseUrl: this.apiUrl,
            authHeader: { Authorization: 'Bearer ' + apiToken },
        });
        this.log = new Logger({ resource: 'GitHub', projectId: repoFullName });
        const parts = repoFullName.split('/');
        this.owner = parts[0]!;
        this.repo = parts.slice(1).join('/');
    }

    get _repoPath(): string {
        return '/repos/' + this.owner + '/' + this.repo;
    }

    async _patch(url: string, body?: unknown, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.patch(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
    }

    async triggerPipeline(payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }): Promise<PipelineTriggerResult | undefined> {
        try {
            const workflowId = payload.workflow_id;
            if (!workflowId) {
                const workflows = await this._listWorkflows();
                if (!workflows || workflows.length === 0) {
                    throw new Error('No workflows found in repository');
                }
                const workflow = workflows[0]!;
                await this._post(
                    this._repoPath + '/actions/workflows/' + workflow.id + '/dispatches',
                    { ref: payload.ref, inputs: this._toInputs(payload.variables) },
                    { operation: 'disparar workflow' },
                );
                return { id: workflow.id, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
            }
            await this._post(
                this._repoPath + '/actions/workflows/' + workflowId + '/dispatches',
                { ref: payload.ref, inputs: this._toInputs(payload.variables) },
                { operation: 'disparar workflow' },
            );
            return { id: workflowId, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
        } catch (err) {
            return handleError(err, { context: 'disparar workflow' }) as never;
        }
    }

    async _listWorkflows(): Promise<Array<{ id: number; name: string }>> {
        const data = await this._get(this._repoPath + '/actions/workflows', {
            operation: 'listar workflows',
            params: { per_page: LIST_WORKFLOWS_PAGE_SIZE },
            returnNull: true,
        });
        return (data && data.workflows) || [];
    }

    _toInputs(variables: Array<{ key: string; value: string }>): Record<string, string> {
        if (!variables || !Array.isArray(variables)) return {};
        const inputs: Record<string, string> = {};
        for (const v of variables) {
            if (v.key) inputs[v.key] = v.value;
        }
        return inputs;
    }

    getSchedules(): Promise<ScheduleInfo[]> {
        this.log.warn(
            'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
        );
        return Promise.resolve([]);
    }

    runSchedule(scheduleId: string | number): Promise<JsonObject> {
        const err = new Error(
            'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
        );
        this.log.error(err.message, { scheduleId });
        throw err;
    }

    async createMergeRequest(
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        const body = {
            head: sourceBranch,
            base: targetBranch,
            title,
            body: description,
        };

        try {
            const data = await this._post(this._repoPath + '/pulls', body, { operation: 'criar PR' });
            return this._formatPR(data);
        } catch (err: unknown) {
            const ghErr = err as { response?: { status?: number; data?: { errors?: Array<{ message: string }> } } };
            if (ghErr.response?.status === 422) {
                const errors = ghErr.response?.data?.errors || [];
                const alreadyExists = errors.some(
                    (e: { message: string }) => e.message && e.message.includes('already exists'),
                );
                if (alreadyExists) {
                    info('PR already exists. Searching for existing...');
                    const existing = await this.searchMergeRequests(sourceBranch, targetBranch, 'open');
                    if (existing && existing.length > 0) {
                        return this.updateMergeRequest(existing[0]!.number!, title, description);
                    }
                }
            }
            return handleError(err, { context: 'criar PR' });
        }
    }

    async updateMergeRequest(
        iid: string | number,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        const data = await this._patch(
            this._repoPath + '/pulls/' + iid,
            { title, body: description },
            { operation: 'atualizar PR' },
        );
        return this._formatPR(data);
    }

    async getMergeRequest(iid: string | number): Promise<MergeRequestInfo | null> {
        const data = await this._get(this._repoPath + '/pulls/' + iid, {
            operation: 'buscar PR',
            returnNull: true,
        });
        return this._formatPR(data);
    }

    async searchMergeRequests(
        sourceBranch: string,
        targetBranch: string,
        searchStatus: string,
    ): Promise<MergeRequestInfo[]> {
        const params: JsonObject = { per_page: SEARCH_PRS_PAGE_SIZE };
        if (sourceBranch) params.head = this.owner + ':' + sourceBranch;
        if (targetBranch) params.base = targetBranch;
        if (searchStatus) params.state = searchStatus === 'opened' ? 'open' : searchStatus;

        const data = await this._get(this._repoPath + '/pulls', {
            operation: 'buscar PRs',
            params,
            returnNull: true,
        });
        return (data || []).map((pr: JsonObject) => this._formatPR(pr));
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true): Promise<MergeRequestInfo | null> {
        try {
            const pr = await this.getMergeRequest(iid);
            if (!pr) throw new Error('PR #' + iid + ' not found');
            if (pr.state === 'merged') {
                info('PR #' + iid + ' already merged');
                return pr;
            }
            const body: JsonObject = {};
            if (shouldRemoveSourceBranch) body.delete_branch_on_merge = true;
            const response = await this.client.put(this._repoPath + '/pulls/' + iid + '/merge', body);
            return this._formatPR(response.data);
        } catch (err) {
            return handleError(err, { context: 'fazer merge' });
        }
    }

    async getRecentPipelines(count = DEFAULT_PIPELINE_COUNT): Promise<PipelineRun[]> {
        const data = await this._get(this._repoPath + '/actions/runs', {
            operation: 'buscar runs',
            params: { per_page: count },
            returnNull: true,
        });
        return (data && data.workflow_runs) || [];
    }

    async getPipeline(runId: string | number): Promise<PipelineInfo | null> {
        return this._get(this._repoPath + '/actions/runs/' + runId, { operation: 'buscar run', returnNull: true });
    }

    async getPipelineJobs(pipelineId: string | number): Promise<PipelineJob[]> {
        const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/jobs', {
            operation: 'listar jobs',
            returnNull: true,
        });
        const jobs = (data && data.jobs) || [];
        return jobs.map((j: JsonObject) => ({
            id: j.id,
            name: j.name,
            stage: j.runner_group_name || '',
            status: j.conclusion || j.status || '',
        }));
    }

    async listPipelineArtifacts(pipelineId: string | number): Promise<ArtifactInfo[]> {
        const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/artifacts', {
            operation: 'listar artifacts',
            returnNull: true,
        });
        const artifacts = (data && data.artifacts) || [];
        return artifacts.map((a: JsonObject) => ({ id: a.id, name: a.name }));
    }

    async downloadArtifact(artifactId: string | number): Promise<{ buffer: Buffer; filename: string }> {
        try {
            const response = await this.client.get(this._repoPath + '/actions/artifacts/' + artifactId + '/zip', {
                responseType: 'arraybuffer',
                maxRedirects: MAX_REDIRECTS,
            });
            return { buffer: Buffer.from(response.data), filename: 'artifact.zip' };
        } catch (err) {
            return handleError(err, { context: 'baixar artifact' }) as never;
        }
    }

    async getBranch(branch: string): Promise<{ name: string } | null> {
        try {
            const { data } = await this.client.get(`${this._repoPath}/branches/${encodeURIComponent(branch)}`);
            if (!data?.name) return null;
            return { name: data.name };
        } catch {
            return null;
        }
    }

    async getCICDVariables(): Promise<CICDVariable[]> {
        const data = await this._get(this._repoPath + '/actions/variables', {
            operation: 'buscar variáveis',
            params: { per_page: VARIABLES_PAGE_SIZE },
            returnNull: true,
        });
        const variables = (data && data.variables) || [];
        return variables.map((v: JsonObject) => ({
            key: v.name,
            value: v.value,
            type: 'variable',
        }));
    }

    async getDiff(source: string, target: string): Promise<string> {
        const data = await this._get(
            this._repoPath + '/compare/' + encodeURIComponent(target) + '...' + encodeURIComponent(source),
            {
                operation: 'comparar branches',
                params: { per_page: COMPARE_PAGE_SIZE },
                returnNull: true,
            },
        );
        if (!data?.files || !Array.isArray(data.files)) return '';
        const lines: string[] = [];
        for (const f of data.files as Array<{ filename?: string; patch?: string; status?: string }>) {
            if (f.patch) {
                lines.push('--- a/' + (f.filename || ''));
                lines.push('+++ b/' + (f.filename || ''));
                lines.push(f.patch);
            }
        }
        const full = lines.join('\n');
        return full.length > DIFF_TRUNCATION_LIMIT ? full.slice(0, DIFF_TRUNCATION_LIMIT) + '\n... (truncated)' : full;
    }

    async isApproved(prNumber: string | number): Promise<boolean> {
        const data = await this._get(this._repoPath + '/pulls/' + prNumber + '/reviews', {
            operation: 'verificar reviews',
            returnNull: true,
        });
        return (data || []).some((r: JsonObject) => r.state === 'APPROVED');
    }

    _formatPR(data: JsonObject): MergeRequestInfo | null {
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
}

export default GitHubManager;
