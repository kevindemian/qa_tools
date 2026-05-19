// @ts-check
const { createHttpClient } = require('../shared/http-client');
const { info } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

class GitLabManager {
    /** @param {string} projectId @param {string} apiToken @param {string} gitlabBaseUrl */
    constructor(projectId, apiToken, gitlabBaseUrl) {
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
        }
    }

    async getSchedules() {
        try {
            const response = await this.client.get('/pipeline_schedules');
            return response.data;
        } catch (err) {
            this.log.error('Erro ao listar schedules: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
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
            if (err.response?.data?.message?.base?.[0]?.includes('already')) {
                info('Merge request already exists. Attempting to update it.');
                const existingMr = await this.searchMergeRequests(sourceBranch, targetBranch, 'opened');
                if (existingMr && existingMr.length > 0) {
                    return await this.updateMergeRequest(existingMr[0].iid, sourceBranch, targetBranch, title, description);
                }
            }
            this.log.error('Erro ao criar MR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                status: err.response?.status
            });
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
        }
    }

    async searchMergeRequests(sourceBranch, targetBranch, searchStatus) {
        try {
            const response = await this.client.get('/merge_requests', {
                params: { state: searchStatus, source_branch: sourceBranch, target_branch: targetBranch }
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar MRs: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
        }
    }

    async acceptMergeRequest(iid, shouldRemoveSourceBranch = true) {
        const body = { should_remove_source_branch: shouldRemoveSourceBranch };

        try {
            const response = await this.client.put(`/merge_requests/${iid}/merge`, body);
            return response.data;
        } catch (err) {
            this.log.error('Erro ao fazer merge: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
        }
    }

    async getCICDVariables() {
        try {
            const response = await this.client.get('/variables');
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar variaveis CI/CD: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
        }
    }
}

module.exports = GitLabManager;
