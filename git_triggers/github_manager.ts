import { createHttpClient } from '../shared/http-client';
import { info } from '../shared/prompt';
import { Logger } from '../shared/logger';
import { handleError } from '../shared/git-provider-error';

class GitHubManager {
    provider = 'github' as const;
    repoFullName: string;
    apiToken: string;
    apiUrl: string;
    client: ReturnType<typeof createHttpClient>;
    log: Logger;
    owner: string;
    repo: string;

    constructor(repoFullName: string, apiToken: string, baseUrl?: string) {
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
        this.owner = parts[0];
        this.repo = parts.slice(1).join('/');
    }

    get _repoPath() {
        return '/repos/' + this.owner + '/' + this.repo;
    }

    async _get(url: string, opts?: { operation?: string; returnNull?: boolean; params?: Record<string, unknown> }) {
        try {
            const args = opts?.params ? [{ params: opts.params }] : [];
            const response = await this.client.get(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url, returnNull: opts?.returnNull });
        }
    }

    async _post(url: string, body?: unknown, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.post(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
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
    }) {
        try {
            const workflowId = payload.workflow_id;
            if (!workflowId) {
                const workflows = await this._listWorkflows();
                if (!workflows || workflows.length === 0) {
                    throw new Error('No workflows found in repository');
                }
                const workflow = workflows[0];
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
            return handleError(err, { context: 'disparar workflow' });
        }
    }

    async _listWorkflows() {
        const data = await this._get(this._repoPath + '/actions/workflows', {
            operation: 'listar workflows',
            params: { per_page: 10 },
            returnNull: true,
        });
        return (data && data.workflows) || [];
    }

    _toInputs(variables: Array<{ key: string; value: string }>) {
        if (!variables || !Array.isArray(variables)) return {};
        const inputs: Record<string, string> = {};
        for (const v of variables) {
            if (v.key) inputs[v.key] = v.value;
        }
        return inputs;
    }

    getSchedules() {
        this.log.warn(
            'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
        );
        return [];
    }

    runSchedule(scheduleId: string | number) {
        const err = new Error(
            'GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.',
        );
        this.log.error(err.message, { scheduleId });
        throw err;
    }

    async createMergeRequest(sourceBranch: string, targetBranch: string, title: string, description?: string) {
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
                        return this.updateMergeRequest(
                            existing[0].number,
                            sourceBranch,
                            targetBranch,
                            title,
                            description,
                        );
                    }
                }
            }
            return handleError(err, { context: 'criar PR' });
        }
    }

    async updateMergeRequest(
        iid: string | number,
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ) {
        const data = await this._patch(
            this._repoPath + '/pulls/' + iid,
            { title, body: description },
            { operation: 'atualizar PR' },
        );
        return this._formatPR(data);
    }

    async getMergeRequest(iid: string | number) {
        try {
            const data = await this._get(this._repoPath + '/pulls/' + iid, {
                operation: 'buscar PR',
                returnNull: true,
            });
            return this._formatPR(data);
        } catch {
            return null;
        }
    }

    async searchMergeRequests(sourceBranch: string, targetBranch: string, searchStatus: string) {
        try {
            const params: Record<string, unknown> = { per_page: 100 };
            if (sourceBranch) params.head = this.owner + ':' + sourceBranch;
            if (targetBranch) params.base = targetBranch;
            if (searchStatus) params.state = searchStatus === 'opened' ? 'open' : searchStatus;

            const data = await this._get(this._repoPath + '/pulls', {
                operation: 'buscar PRs',
                params,
                returnNull: true,
            });
            return (data || []).map((pr: Record<string, unknown>) => this._formatPR(pr));
        } catch {
            return [];
        }
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true) {
        try {
            const pr = await this.getMergeRequest(iid);
            if (!pr) throw new Error('PR #' + iid + ' not found');
            if (pr.state === 'merged') {
                info('PR #' + iid + ' already merged');
                return pr;
            }
            const body: Record<string, unknown> = {};
            if (shouldRemoveSourceBranch) body.delete_branch_on_merge = true;
            const response = await this.client.put(this._repoPath + '/pulls/' + iid + '/merge', body);
            return this._formatPR(response.data);
        } catch (err) {
            return handleError(err, { context: 'fazer merge' });
        }
    }

    async getRecentPipelines(count = 5) {
        try {
            const data = await this._get(this._repoPath + '/actions/runs', {
                operation: 'buscar runs',
                params: { per_page: count },
                returnNull: true,
            });
            return (data && data.workflow_runs) || [];
        } catch {
            return [];
        }
    }

    async getPipeline(runId: string | number) {
        return this._get(this._repoPath + '/actions/runs/' + runId, { operation: 'buscar run', returnNull: true });
    }

    async getPipelineJobs(pipelineId: string | number) {
        try {
            const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/jobs', {
                operation: 'listar jobs',
                returnNull: true,
            });
            const jobs = (data && data.jobs) || [];
            return jobs.map((j: Record<string, unknown>) => ({
                id: j.id,
                name: j.name,
                stage: j.runner_group_name || '',
                status: j.conclusion || j.status || '',
            }));
        } catch {
            return [];
        }
    }

    async listPipelineArtifacts(pipelineId: string | number) {
        try {
            const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/artifacts', {
                operation: 'listar artifacts',
                returnNull: true,
            });
            const artifacts = (data && data.artifacts) || [];
            return artifacts.map((a: Record<string, unknown>) => ({ id: a.id, name: a.name }));
        } catch {
            return [];
        }
    }

    async downloadArtifact(artifactId: string | number) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/artifacts/' + artifactId + '/zip', {
                responseType: 'arraybuffer',
                maxRedirects: 5,
            });
            return { buffer: Buffer.from(response.data), filename: 'artifact.zip' };
        } catch (err) {
            handleError(err, { context: 'baixar artifact' });
            throw err;
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

    async getCICDVariables() {
        try {
            const data = await this._get(this._repoPath + '/actions/variables', {
                operation: 'buscar variáveis',
                params: { per_page: 100 },
                returnNull: true,
            });
            const variables = (data && data.variables) || [];
            return variables.map((v: Record<string, unknown>) => ({
                key: v.name,
                value: v.value,
                type: 'variable',
            }));
        } catch {
            return [];
        }
    }

    async isApproved(prNumber: string | number) {
        try {
            const data = await this._get(this._repoPath + '/pulls/' + prNumber + '/reviews', {
                operation: 'verificar reviews',
                returnNull: true,
            });
            return (data || []).some((r: Record<string, unknown>) => r.state === 'APPROVED');
        } catch {
            return false;
        }
    }

    _formatPR(data: Record<string, unknown>) {
        if (!data) return null;
        return {
            iid: data.number,
            number: data.number,
            title: data.title,
            state: data.merged ? 'merged' : data.state === 'closed' ? 'closed' : 'opened',
            web_url: data.html_url,
            description: data.body,
            source_branch: ((data.head as Record<string, unknown>) || {}).ref,
            target_branch: ((data.base as Record<string, unknown>) || {}).ref,
            approved: false,
        };
    }
}

export = GitHubManager;
