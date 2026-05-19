const axios = require('axios');
const { createAgent } = require('../shared/tls');
const { info } = require('../shared/prompt');
const { Logger } = require('../shared/logger');

class GitLabManager {
    constructor(projectId, apiToken, gitlabBaseUrl) {
        this.projectId = projectId;
        this.apiToken = apiToken;
        this.gitlabBaseUrl = gitlabBaseUrl;
        this.apiUrl = `${this.gitlabBaseUrl}/api/v4/projects/${this.projectId}`;
        this.agent = createAgent();
        this.log = new Logger({ resource: 'GitLab', projectId });
    }

    async triggerPipeline(payload) {
		const url = `${this.apiUrl}/pipeline`;

		try {
			const response = await axios.post(url, payload, {
				headers: {
					'PRIVATE-TOKEN': this.apiToken,
				},
				httpsAgent: this.agent,
			});
			return response.data;
		} catch (err) {
			this.log.error('Erro ao disparar pipeline: ' + (err.response?.data?.message || err.message), {
			    status: err.response?.status
			});
		}
	}

    async getSchedules() {
        const url = `${this.apiUrl}/pipeline_schedules`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao listar schedules: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
        }
    }

    async runSchedule(scheduleId) {
        const url = `${this.apiUrl}/pipeline_schedules/${scheduleId}/play`;

        try {
            const response = await axios.post(url, {}, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao disparar schedule: ' + (err.response?.data?.message || err.message), {
                scheduleId,
                status: err.response?.status
            });
        }
    }

    async createMergeRequest(sourceBranch, targetBranch, title, description) {
        const url = `${this.apiUrl}/merge_requests`;
        const body = {
            id: this.projectId,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title,
            description,
        };

        try {
            const response = await axios.post(url, body, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
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
        const url = `${this.apiUrl}/merge_requests/${iid}`;
        const body = {
            title,
            description,
        };

        try {
            const response = await axios.put(url, body, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao atualizar MR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
        }
    }

    async getUserId(username) {
        const url = `${this.gitlabBaseUrl}/api/v4/users?username=${username}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar usuario: ' + (err.response?.data?.message || err.message), {
                username,
                status: err.response?.status
            });
        }
    }

    async searchMergeRequests(sourceBranch, targetBranch, searchStatus) {
        const url = `${this.apiUrl}/merge_requests?state=${searchStatus}&source_branch=${sourceBranch}&target_branch=${targetBranch}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar MRs: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
        }
    }

    async acceptMergeRequest(iid, shouldRemoveSourceBranch = true) {
        const url = `${this.apiUrl}/merge_requests/${iid}/merge`;
        const body = { should_remove_source_branch: shouldRemoveSourceBranch };

        try {
            const response = await axios.put(url, body, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao fazer merge: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
        }
    }

    async getMergeRequestStatus(iid) {
        const url = `${this.apiUrl}/merge_requests/${iid}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao verificar status do MR: ' + JSON.stringify(err.response?.data?.message || err.message), {
                iid,
                status: err.response?.status
            });
        }
    }

    async getCICDVariables() {
        const url = `${this.apiUrl}/variables`;

        try {
            const response = await axios.get(url, {
                headers: {
                    'PRIVATE-TOKEN': this.apiToken,
                },
                httpsAgent: this.agent,
            });
            return response.data;
        } catch (err) {
            this.log.error('Erro ao buscar variaveis CI/CD: ' + (err.response?.data?.message || err.message), {
                status: err.response?.status
            });
        }
    }
}

module.exports = GitLabManager;
