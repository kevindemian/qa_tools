// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { info, extractErrorMessage } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

/** @param {import('../shared/logger').Logger} log @param {string} op @param {any} err @param {{ returnNull?: boolean }} [opts] */
function handleError(log, op, err, opts) {
  const msg = extractErrorMessage(err);
  log.error(`Erro ao ${op}: ${msg}`, { status: err.response?.status });
  if (opts?.returnNull) return null;
  throw err;
}

class GitHubManager {
    /** @param {string} repoFullName @param {string} apiToken @param {string} [baseUrl] */
    constructor(repoFullName, apiToken, baseUrl) {
        /** @type {'github'} */
        this.provider = 'github';
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

    /**
     * @param {string} url
     * @param {{ operation?: string, returnNull?: boolean, params?: Record<string, any> }} [opts]
     */
    async _get(url, opts) {
        try {
            const args = opts?.params ? [{ params: opts.params }] : [];
            const response = await this.client.get(url, ...args);
            return response.data;
        } catch (err) {
            return /** @type {null} */ (handleError(this.log, opts?.operation || url, err, { returnNull: opts?.returnNull }));
        }
    }

    /**
     * @param {string} url
     * @param {any} [body]
     * @param {{ operation?: string }} [opts]
     */
    async _post(url, body, opts) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.post(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(this.log, opts?.operation || url, err);
        }
    }

    /**
     * @param {string} url
     * @param {any} [body]
     * @param {{ operation?: string }} [opts]
     */
    async _patch(url, body, opts) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.patch(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(this.log, opts?.operation || url, err);
        }
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
                await this._post(
                    this._repoPath + '/actions/workflows/' + workflow.id + '/dispatches',
                    { ref: payload.ref, inputs: this._toInputs(payload.variables) },
                    { operation: 'disparar workflow' }
                );
                return { id: workflow.id, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
            }
            await this._post(
                this._repoPath + '/actions/workflows/' + workflowId + '/dispatches',
                { ref: payload.ref, inputs: this._toInputs(payload.variables) },
                { operation: 'disparar workflow' }
            );
            return { id: workflowId, web_url: this.apiUrl + '/' + this.repoFullName + '/actions/runs' };
        } catch (err) {
            return handleError(this.log, 'disparar workflow', err);
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
            const data = await this._post(this._repoPath + '/pulls', body, { operation: 'criar PR' });
            return this._formatPR(data);
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
            return handleError(this.log, 'criar PR', err);
        }
    }

    async updateMergeRequest(iid, sourceBranch, targetBranch, title, description) {
        const data = await this._patch(this._repoPath + '/pulls/' + iid, { title, body: description }, { operation: 'atualizar PR' });
        return this._formatPR(data);
    }

    async getMergeRequest(iid) {
        try {
            const data = await this._get(this._repoPath + '/pulls/' + iid, { operation: 'buscar PR', returnNull: true });
            return this._formatPR(data);
        } catch (err) {
            return null;
        }
    }

    async searchMergeRequests(sourceBranch, targetBranch, searchStatus) {
        try {
            const params = { per_page: 100 };
            if (sourceBranch) params.head = this.owner + ':' + sourceBranch;
            if (targetBranch) params.base = targetBranch;
            if (searchStatus) params.state = searchStatus === 'opened' ? 'open' : searchStatus;

            const data = await this._get(this._repoPath + '/pulls', { operation: 'buscar PRs', params, returnNull: true });
            return (data || []).map((pr) => this._formatPR(pr));
        } catch (err) {
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
            return handleError(this.log, 'fazer merge', err);
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
        } catch (err) {
            return [];
        }
    }

    async getPipeline(runId) {
        return await this._get(this._repoPath + '/actions/runs/' + runId, { operation: 'buscar run', returnNull: true });
    }

    /** @param {string|number} pipelineId @returns {Promise<Array<{id:string|number, name:string, stage:string, status:string}>>} */
    async getPipelineJobs(pipelineId) {
        try {
            const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/jobs', {
                operation: 'listar jobs',
                returnNull: true,
            });
            const jobs = (data && data.jobs) || [];
            return jobs.map((/** @type {any} */ j) => ({
                id: j.id,
                name: j.name,
                stage: j.runner_group_name || '',
                status: j.conclusion || j.status || '',
            }));
        } catch (err) {
            return [];
        }
    }

    /** @param {string|number} pipelineId @returns {Promise<Array<{id:string|number, name:string}>>} */
    async listPipelineArtifacts(pipelineId) {
        try {
            const data = await this._get(this._repoPath + '/actions/runs/' + pipelineId + '/artifacts', {
                operation: 'listar artifacts',
                returnNull: true,
            });
            const artifacts = (data && data.artifacts) || [];
            return artifacts.map((/** @type {any} */ a) => ({ id: a.id, name: a.name }));
        } catch (err) {
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
            handleError(this.log, 'baixar artifact', err);
            throw err;
        }
    }

    async getCICDVariables() {
        try {
            const data = await this._get(this._repoPath + '/actions/variables', {
                operation: 'buscar variaveis',
                params: { per_page: 100 },
                returnNull: true,
            });
            const variables = (data && data.variables) || [];
            return variables.map((v) => ({
                key: v.name,
                value: v.value,
                type: 'variable',
            }));
        } catch (err) {
            return [];
        }
    }

    async isApproved(prNumber) {
        try {
            const data = await this._get(this._repoPath + '/pulls/' + prNumber + '/reviews', {
                operation: 'verificar reviews',
                returnNull: true,
            });
            return (data || []).some(r => r.state === 'APPROVED');
        } catch (err) {
            return false;
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
            approved: false,
        };
    }
}

module.exports = GitHubManager;
