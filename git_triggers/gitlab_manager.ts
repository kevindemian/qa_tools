import { createHttpClient } from '../shared/http-client';
import { info, extractErrorMessage } from '../shared/prompt';
import { Logger } from '../shared/logger';

function handleError(log: Logger, op: string, err: any, opts?: { returnNull?: boolean }) {
  const msg = extractErrorMessage(err);
  log.error(`Erro ao ${op}: ${msg}`, { status: err.response?.status });
  if (opts?.returnNull) return null;
  throw err;
}

class GitLabManager {
    provider: 'gitlab' = 'gitlab';
    projectId: string;
    apiToken: string;
    apiUrl: string;
    client: ReturnType<typeof createHttpClient>;
    log: Logger;

    constructor(projectId: string, apiToken: string, gitlabBaseUrl: string) {
        this.projectId = projectId;
        this.apiToken = apiToken;
        this.apiUrl = `${gitlabBaseUrl}/api/v4/projects/${this.projectId}`;
        this.client = createHttpClient({
            baseUrl: this.apiUrl,
            authHeader: { 'PRIVATE-TOKEN': apiToken },
        });
        this.log = new Logger({ resource: 'GitLab', projectId });
    }

    async _get(url: string, opts?: { operation?: string; returnNull?: boolean; params?: Record<string, any> }) {
        try {
            const args = opts?.params ? [{ params: opts.params }] : [];
            const response = await this.client.get(url, ...args);
            return response.data;
        } catch (err) {
            return (handleError(this.log, opts?.operation || url, err, { returnNull: opts?.returnNull }));
        }
    }

    async _post(url: string, body?: any, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.post(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(this.log, opts?.operation || url, err);
        }
    }

    async _put(url: string, body?: any, opts?: { operation?: string }) {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.put(url, ...args);
            return response.status === 204 ? null : response.data;
        } catch (err) {
            return handleError(this.log, opts?.operation || url, err);
        }
    }

    async triggerPipeline(payload: { ref: string; variables: Array<{ key: string; value: string }>; workflow_id?: string }) {
        return await this._post('/pipeline', payload, { operation: 'disparar pipeline' });
    }

    async getSchedules() {
        return await this._get('/pipeline_schedules', { operation: 'listar schedules', params: { per_page: 100 }, returnNull: true }) || [];
    }

    async runSchedule(scheduleId: string | number) {
        return await this._post(`/pipeline_schedules/${scheduleId}/play`, undefined, { operation: 'disparar schedule' });
    }

    async createMergeRequest(sourceBranch: string, targetBranch: string, title: string, description?: string) {
        const body = {
            id: this.projectId,
            source_branch: sourceBranch,
            target_branch: targetBranch,
            title,
            description,
        };

        try {
            return await this._post('/merge_requests', body, { operation: 'criar MR' });
        } catch (err: any) {
            if (err.response?.status === 409) {
                info('MR already exists. Searching for existing...');
                const existing = await this.searchMergeRequests(sourceBranch, targetBranch, 'opened');
                if (existing && existing.length > 0) {
                    return await this.updateMergeRequest(existing[0].iid, sourceBranch, targetBranch, title, description!);
                }
            }
            throw err;
        }
    }

    async updateMergeRequest(iid: string | number, sourceBranch: string, targetBranch: string, title: string, description?: string) {
        return await this._put(`/merge_requests/${iid}`, { title, description }, { operation: 'atualizar MR' });
    }

    async getMergeRequest(iid: string | number) {
        return await this._get(`/merge_requests/${iid}`, { operation: 'buscar MR', returnNull: true });
    }

    async searchMergeRequests(sourceBranch: string, targetBranch: string, searchStatus: string) {
        return await this._get('/merge_requests', {
            operation: 'buscar MRs',
            params: { state: searchStatus, source_branch: sourceBranch, target_branch: targetBranch, per_page: 100 },
            returnNull: true,
        }) || [];
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true) {
        try {
            const mr = await this.getMergeRequest(iid);
            if (!mr) throw new Error(`MR #${iid} not found`);
            if ((mr as any).state === 'merged') {
                info(`MR #${iid} already merged`);
                return mr;
            }
            return await this._put(`/merge_requests/${iid}/merge`, { should_remove_source_branch: shouldRemoveSourceBranch }, { operation: 'fazer merge' });
        } catch (err) {
            return handleError(this.log, 'fazer merge', err);
        }
    }

    async getRecentPipelines(count = 5) {
        return await this._get('/pipelines', { operation: 'buscar pipelines', params: { per_page: count, order_by: 'updated_at' }, returnNull: true }) || [];
    }

    async getPipeline(pipelineId: string | number) {
        return await this._get(`/pipelines/${pipelineId}`, { operation: 'buscar pipeline', returnNull: true });
    }

    async getPipelineJobs(pipelineId: string | number) {
        try {
            const data = await this._get(`/pipelines/${pipelineId}/jobs`, { operation: 'listar jobs', returnNull: true });
            return (data || []).map((j: any) => ({
                id: j.id,
                name: j.name,
                stage: j.stage,
                status: j.status,
            }));
        } catch (err) {
            return [];
        }
    }

    async listPipelineArtifacts(pipelineId: string | number) {
        try {
            const data = await this._get(`/pipelines/${pipelineId}/jobs`, { operation: 'listar artifacts', returnNull: true });
            const jobs = data || [];
            return jobs
                .filter((j: any) => j.artifacts_file || (j.artifacts && j.artifacts.length > 0))
                .map((j: any) => ({ id: j.id, name: j.name }));
        } catch (err) {
            return [];
        }
    }

    async downloadArtifact(jobId: string | number) {
        try {
            const response = await this.client.get('/jobs/' + jobId + '/artifacts', {
                responseType: 'arraybuffer',
            });
            const disposition = response.headers['content-disposition'] || '';
            const match = disposition.match(/filename="?(.+?)"?$/);
            const filename = match ? match[1] : 'artifacts.zip';
            return { buffer: Buffer.from(response.data), filename };
        } catch (err) {
            handleError(this.log, 'baixar artifact', err);
            throw err;
        }
    }

    async isApproved(mrIid: string | number) {
        try {
            const res = await this.client.get(`/merge_requests/${mrIid}/approvals`);
            return (res.data as any).approved === true;
        } catch (err: any) {
            this.log.error(`Erro ao verificar approvals do MR #${mrIid}: ${extractErrorMessage(err)}`, { status: err.response?.status });
            return false;
        }
    }

    async getCICDVariables() {
        return await this._get('/variables', { operation: 'buscar variaveis CI/CD', params: { per_page: 100 }, returnNull: true }) || [];
    }
}

export = GitLabManager;
