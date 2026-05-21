// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { info } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

class GitHubManager {
    /** @param {string} repoFullName @param {string} apiToken @param {string} [baseUrl] */
    constructor(repoFullName, apiToken, baseUrl) {
        /** @type {'github'} */
        this.provider = 'github';
        this.repoFullName = repoFullName;
        this.apiToken = apiToken;
        this.apiUrl = (baseUrl || 'https://api.github.com').replace(/\/+$/, '');
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

    async triggerPipeline(payload) {
        try {
            const workflowId = payload.workflow_id;
            if (!workflowId) {
                const workflows = await this._listWorkflows();
                if (!workflows || workflows.length === 0) {
                    throw new Error('No workflows found in repository');
                }
                const workflow = workflows[0];
                const response = await this.client.post(
                    this._repoPath + '/actions/workflows/' + workflow.id + '/dispatches',
                    { ref: payload.ref, inputs: this._toInputs(payload.variables) }
                );
                return { id: workflow.id, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
            }
            const response = await this.client.post(
                this._repoPath + '/actions/workflows/' + workflowId + '/dispatches',
                { ref: payload.ref, inputs: this._toInputs(payload.variables) }
            );
            return { id: workflowId, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
        } catch (err) {
            this.log.error('Erro ao disparar workflow: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            throw err;
        }
    }

    async _listWorkflows() {
        try {
            const response = await this.client.get(this._repoPath + '/actions/workflows', {
                params: { per_page: 10 }
            });
            return response.data.workflows || [];
        } catch (err) {
            this.log.error('Erro ao listar workflows: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    _toInputs(variables) {
        if (!variables || !Array.isArray(variables)) return {};
        /** @type {Record<string, string>} */
        const inputs = {};
        for (const v of variables) {
            if (v.key) inputs[v.key] = v.value;
        }
        return inputs;
    }

    async getSchedules() {
        this.log.warn('GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.');
        return [];
    }

    async runSchedule(scheduleId) {
        const err = new Error('GitHub Actions schedules not available via REST API. Use workflow_dispatch or repository_dispatch.');
        this.log.error(err.message, { scheduleId });
        throw err;
    }

    async createMergeRequest(sourceBranch, targetBranch, title, description) {
        const body = {
            head: sourceBranch,
            base: targetBranch,
            title,
            body: description,
        };

        try {
            const response = await this.client.post(this._repoPath + '/pulls', body);
            return this._formatPR(response.data);
        } catch (err) {
            if (err.response?.status === 422) {
                const errors = err.response?.data?.errors || [];
                const alreadyExists = errors.some(
                    (e) => e.message && e.message.includes('already exists')
                );
                if (alreadyExists) {
                    info('PR already exists. Searching for existing...');
                    const existing = await this.searchMergeRequests(sourceBranch, targetBranch, 'open');
                    if (existing && existing.length > 0) {
                        return await this.updateMergeRequest(
                            existing[0].number, sourceBranch, targetBranch, title, description
                        );
                    }
                }
            }
            this.log.error('Erro ao criar PR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            throw err;
        }
    }

    async updateMergeRequest(iid, sourceBranch, targetBranch, title, description) {
        const body = { title, body: description };

        try {
            const response = await this.client.patch(this._repoPath + '/pulls/' + iid, body);
            return this._formatPR(response.data);
        } catch (err) {
            this.log.error('Erro ao atualizar PR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getMergeRequest(iid) {
        try {
            const response = await this.client.get(this._repoPath + '/pulls/' + iid);
            return this._formatPR(response.data);
        } catch (err) {
            this.log.error('Erro ao buscar PR: ' + (err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
            return null;
        }
    }

    async searchMergeRequests(sourceBranch, targetBranch, searchStatus) {
        try {
            const params = { per_page: 100 };
            if (sourceBranch) params.head = this.owner + ':' + sourceBranch;
            if (targetBranch) params.base = targetBranch;
            if (searchStatus) params.state = searchStatus === 'opened' ? 'open' : searchStatus;

            const response = await this.client.get(this._repoPath + '/pulls', { params });
            return (response.data || []).map((pr) => this._formatPR(pr));
        } catch (err) {
            this.log.error('Erro ao buscar PRs: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    async acceptMergeRequest(iid, shouldRemoveSourceBranch = true) {
        try {
            const pr = await this.getMergeRequest(iid);
            if (!pr) throw new Error('PR #' + iid + ' not found');
            if (pr.state === 'merged') {
                info('PR #' + iid + ' already merged');
                return pr;
            }
            const body = {};
            if (shouldRemoveSourceBranch) body.delete_branch_on_merge = true;
            const response = await this.client.put(this._repoPath + '/pulls/' + iid + '/merge', body);
            return this._formatPR(response.data);
        } catch (err) {
            this.log.error('Erro ao fazer merge: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getRecentPipelines(count = 5) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/runs', {
                params: { per_page: count }
            });
            return response.data.workflow_runs || [];
        } catch (err) {
            this.log.error('Erro ao buscar runs: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    async getPipeline(runId) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/runs/' + runId);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar run: ' + (err.response?.data?.message || err.message), {
                runId,
                status: err.response?.status
            });
            return null;
        }
    }

    /** @param {string|number} pipelineId @returns {Promise<Array<{id:string|number, name:string, stage:string, status:string}>>} */
    async getPipelineJobs(pipelineId) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/runs/' + pipelineId + '/jobs');
            const jobs = response.data.jobs || [];
            return jobs.map((/** @type {any} */ j) => ({
                id: j.id,
                name: j.name,
                stage: j.runner_group_name || '',
                status: j.conclusion || j.status || '',
            }));
        } catch (err) {
            this.log.error('Erro ao listar jobs: ' + (err.response?.data?.message || err.message), {
                pipelineId,
                status: err.response?.status
            });
            return [];
        }
    }

    /** @param {string|number} pipelineId @returns {Promise<Array<{id:string|number, name:string}>>} */
    async listPipelineArtifacts(pipelineId) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/runs/' + pipelineId + '/artifacts');
            const artifacts = response.data.artifacts || [];
            return artifacts.map((/** @type {any} */ a) => ({ id: a.id, name: a.name }));
        } catch (err) {
            this.log.error('Erro ao listar artifacts: ' + (err.response?.data?.message || err.message), {
                pipelineId,
                status: err.response?.status
            });
            return [];
        }
    }

    /** @param {string|number} artifactId @returns {Promise<{buffer: Buffer, filename: string}>} */
    async downloadArtifact(artifactId) {
        try {
            const response = await this.client.get(this._repoPath + '/actions/artifacts/' + artifactId + '/zip', {
                responseType: 'arraybuffer',
                maxRedirects: 5,
            });
            return { buffer: Buffer.from(response.data), filename: 'artifact.zip' };
        } catch (err) {
            this.log.error('Erro ao baixar artifact: ' + (err.response?.data?.message || err.message), {
                artifactId,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getCICDVariables() {
        try {
            const response = await this.client.get(this._repoPath + '/actions/variables', {
                params: { per_page: 100 }
            });
            const variables = response.data.variables || [];
            return variables.map((v) => ({
                key: v.name,
                value: v.value,
                type: 'variable',
            }));
        } catch (err) {
            this.log.error('Erro ao buscar variaveis: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    _formatPR(data) {
        if (!data) return null;
        return {
            iid: data.number,
            number: data.number,
            title: data.title,
            state: data.merged ? 'merged' : (data.state === 'closed' ? 'closed' : 'opened'),
            web_url: data.html_url,
            description: data.body,
            source_branch: (data.head || {}).ref,
            target_branch: (data.base || {}).ref,
            approved: (data.requested_reviewers || []).length === 0 && data.state === 'open',
        };
    }
}

module.exports = GitHubManager;
