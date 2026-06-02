import { createThrottledClient } from '../shared/http-client';
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
    Issue,
    JsonObject,
} from '../shared/types';
import {
    glTriggerPipeline,
    glGetRecentPipelines,
    glGetPipeline,
    glGetPipelineJobs,
    glListPipelineArtifacts,
    glDownloadArtifact,
    glGetCICDVariables,
    glGetJobLogs,
    glGetSchedules,
    glRunSchedule,
} from './gitlab-workflow';
import {
    glCreateMergeRequest,
    glUpdateMergeRequest,
    glGetMergeRequest,
    glSearchMergeRequests,
    glAcceptMergeRequest,
    glIsApproved,
} from './gitlab-pr';
import { glGetOpenIssues } from './gitlab-issues';
import { glGetBranch, glGetDiff } from './gitlab-branch';

class GitLabManager extends GitProviderBase implements GitProvider {
    provider = 'gitlab' as const;
    projectId: string;
    owner: string;
    repo: string;
    apiToken: string;
    apiUrl: string;
    client: ReturnType<typeof createThrottledClient>;
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
        this.apiUrl = `${gitlabBaseUrl}/api/v4`;
        this.owner = '';
        this.repo = projectId;
        this.client = createThrottledClient({
            baseUrl: this.apiUrl,
            authHeader: { 'PRIVATE-TOKEN': apiToken },
            maxConcurrency: 3,
        });
        this.log = new Logger({ resource: 'GitLab', projectId });
    }

    async _put<T = JsonObject>(url: string, body?: unknown, opts?: { operation?: string }): Promise<T | null> {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.put<T>(url, ...args);
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
        return glTriggerPipeline(this.client, this.owner, this.repo, payload);
    }

    async getSchedules(): Promise<ScheduleInfo[]> {
        return glGetSchedules(this.client, this.owner, this.repo);
    }

    async runSchedule(scheduleId: string | number): Promise<JsonObject> {
        return glRunSchedule(this.client, this.owner, this.repo, scheduleId);
    }

    async createMergeRequest(
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        return glCreateMergeRequest(this.client, this.owner, this.repo, sourceBranch, targetBranch, title, description);
    }

    async updateMergeRequest(
        iid: string | number,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        return glUpdateMergeRequest(this.client, this.owner, this.repo, iid, title, description);
    }

    async getMergeRequest(iid: string | number): Promise<MergeRequestInfo | null> {
        return glGetMergeRequest(this.client, this.owner, this.repo, iid);
    }

    async searchMergeRequests(
        sourceBranch: string,
        targetBranch: string,
        searchStatus: string,
    ): Promise<MergeRequestInfo[]> {
        return glSearchMergeRequests(this.client, this.owner, this.repo, sourceBranch, targetBranch, searchStatus);
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true): Promise<MergeRequestInfo | null> {
        return glAcceptMergeRequest(this.client, this.owner, this.repo, iid, shouldRemoveSourceBranch);
    }

    async getRecentPipelines(count = 5): Promise<PipelineRun[]> {
        return glGetRecentPipelines(this.client, this.owner, this.repo, count);
    }

    async getPipeline(pipelineId: string | number): Promise<PipelineInfo | null> {
        return glGetPipeline(this.client, this.owner, this.repo, pipelineId);
    }

    async getPipelineJobs(pipelineId: string | number): Promise<PipelineJob[]> {
        return glGetPipelineJobs(this.client, this.owner, this.repo, pipelineId);
    }

    async listPipelineArtifacts(pipelineId: string | number): Promise<ArtifactInfo[]> {
        return glListPipelineArtifacts(this.client, this.owner, this.repo, pipelineId);
    }

    async getCICDVariables(): Promise<CICDVariable[]> {
        return glGetCICDVariables(this.client, this.owner, this.repo);
    }

    async getBranch(branch: string): Promise<{ name: string } | null> {
        return glGetBranch(this.client, this.owner, this.repo, branch);
    }

    async getDiff(source: string, target: string): Promise<string> {
        return glGetDiff(this.client, this.owner, this.repo, source, target);
    }

    async isApproved(mergeRequestIid: string | number): Promise<boolean> {
        return glIsApproved(this.client, this.owner, this.repo, mergeRequestIid);
    }

    async downloadArtifact(artifactId: string | number): Promise<{ buffer: Buffer; filename: string }> {
        return glDownloadArtifact(this.client, this.owner, this.repo, artifactId);
    }

    async getOpenIssues(): Promise<Issue[]> {
        return glGetOpenIssues(this.client, this.owner, this.repo);
    }

    async getJobLogs(jobId: string | number, maxBytes = 10240): Promise<string | null> {
        return glGetJobLogs(this.client, this.owner, this.repo, jobId, maxBytes);
    }
}

export default GitLabManager;
