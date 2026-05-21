// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { info } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

class GitLabManager {
    /** @param {string} projectId @param {string} apiToken @param {string} gitlabBaseUrl */
    constructor(projectId, apiToken, gitlabBaseUrl) {
        /** @type {'gitlab'} */
        this.provider = 'gitlab';
        this.projectId = projectId;
        this.apiToken = apiToken;
        this.apiUrl = `${gitlabBaseUrl}/api/v4/projects/${this.projectId}`;
        this.client = createHttpClient({
            baseUrl: this.apiUrl,
            authHeader: { 'PRIVATE-TOKEN': apiToken },
        });
        this.log = new Logger({ resource: 'GitLab', projectId });
    }

    async triggerPipeline(payload) {
        try {
            const response = await this.client.post('/pipeline', payload);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao disparar pipeline: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            throw err;
        }
    }

    async getSchedules() {
        try {
            const response = await this.client.get('/pipeline_schedules', {
                params: { per_page: 100 }
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao listar schedules: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    async runSchedule(scheduleId) {
        try {
            const response = await this.client.post(`/pipeline_schedules/${scheduleId}/play`);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao disparar schedule: ' + (err.response?.data?.message || err.message), {
                scheduleId,
                status: err.response?.status
            });
            throw err;
        }
    }

    async createMergeRequest(sourceBranch, targetBranch, title, description) {
        const body = {
            id: this.projectId,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title,
            description,
        };

        try {
            const response = await this.client.post('/merge_requests', body);
            return response.data;
        } catch (err) {
            if (err.response?.status === 409) {
                info('MR already exists. Searching for existing...');
                const existing = await this.searchMergeRequests(sourceBranch, targetBranch, 'opened');
                if (existing && existing.length > 0) {
                    return await this.updateMergeRequest(existing[0].iid, sourceBranch, targetBranch, title, description);
                }
            }
            this.log.error('Erro ao criar MR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            throw err;
        }
    }

    async updateMergeRequest(iid, sourceBranch, targetBranch, title, description) {
        const body = { title, description };

        try {
            const response = await this.client.put(`/merge_requests/${iid}`, body);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao atualizar MR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getMergeRequest(iid) {
        try {
            const response = await this.client.get(`/merge_requests/${iid}`);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar MR: ' + (err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
            return null;
        }
    }

    async searchMergeRequests(sourceBranch, targetBranch, searchStatus) {
        try {
            const response = await this.client.get('/merge_requests', {
                params: { state: searchStatus, source_branch: sourceBranch, target_branch: targetBranch, per_page: 100 }
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar MRs: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    async acceptMergeRequest(iid, shouldRemoveSourceBranch = true) {
        try {
            const mr = await this.getMergeRequest(iid);
            if (!mr) throw new Error(`MR #${iid} not found`);
            if (mr.state === 'merged') {
                info(`MR #${iid} already merged`);
                return mr;
            }
            const body = { should_remove_source_branch: shouldRemoveSourceBranch };
            const response = await this.client.put(`/merge_requests/${iid}/merge`, body);
            return response.data;
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
            const response = await this.client.get('/pipelines', {
                params: { per_page: count, order_by: 'updated_at' }
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar pipelines: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }

    async getPipeline(pipelineId) {
        try {
            const response = await this.client.get('/pipelines/' + pipelineId);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar pipeline: ' + (err.response?.data?.message || err.message), {
                pipelineId,
                status: err.response?.status
            });
            return null;
        }
    }

    /** @param {string|number} pipelineId @returns {Promise<Array<{id:string|number, name:string, stage:string, status:string}>>} */
    async getPipelineJobs(pipelineId) {
        try {
            const response = await this.client.get('/pipelines/' + pipelineId + '/jobs');
            return (response.data || []).map((/** @type {any} */ j) => ({
                id: j.id,
                name: j.name,
                stage: j.stage,
                status: j.status,
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
            const response = await this.client.get('/pipelines/' + pipelineId + '/jobs');
            const jobs = response.data || [];
            return jobs
                .filter((/** @type {any} */ j) => j.artifacts_file || (j.artifacts && j.artifacts.length > 0))
                .map((/** @type {any} */ j) => ({ id: j.id, name: j.name }));
        } catch (err) {
            this.log.error('Erro ao listar artifacts: ' + (err.response?.data?.message || err.message), {
                pipelineId,
                status: err.response?.status
            });
            return [];
        }
    }

    /** @param {string|number} jobId @returns {Promise<{buffer: Buffer, filename: string}>} */
    async downloadArtifact(jobId) {
        try {
            const response = await this.client.get('/jobs/' + jobId + '/artifacts', {
                responseType: 'arraybuffer',
            });
            const disposition = response.headers['content-disposition'] || '';
            const match = disposition.match(/filename="?(.+?)"?$/);
            const filename = match ? match[1] : 'artifacts.zip';
            return { buffer: Buffer.from(response.data), filename };
        } catch (err) {
            this.log.error('Erro ao baixar artifact: ' + (err.response?.data?.message || err.message), {
                jobId,
                status: err.response?.status
            });
            throw err;
        }
    }

    async getCICDVariables() {
        try {
            const response = await this.client.get('/variables', {
                params: { per_page: 100 }
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar variaveis CI/CD: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
            return [];
        }
    }
}

module.exports = GitLabManager;
