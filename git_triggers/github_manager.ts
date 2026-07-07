function stripTrailingSlashes(s: string): string {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 47) end--;
    return s.slice(0, end);
}

import { createThrottledClient } from '../shared/http-client.js';
import { Logger } from '../shared/logger.js';
import { handleError } from '../shared/git-provider-error.js';
import { GitProviderBase } from './git-provider-base.js';
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
    DirEntry,
} from '../shared/types.js';
import type { AxiosInstance } from '../shared/deps.js';
import {
    formatPR,
    prCreateMergeRequest,
    prUpdateMergeRequest,
    prGetMergeRequest,
    prSearchMergeRequests,
    prAcceptMergeRequest,
    prIsApproved,
} from './github-pr.js';
import {
    wfTriggerPipeline,
    wfGetRecentPipelines,
    wfGetPipeline,
    wfGetPipelineJobs,
    wfListPipelineArtifacts,
    wfDownloadArtifact,
    wfGetJobLogs,
    wfGetCICDVariables,
    wfGetSchedules,
    wfRunSchedule,
    wfGetWorkflowRunTiming,
    wfGetFileContents,
    wfListDirectory,
    wfGetRepoTreeCached,
} from './github-workflow.js';
import { getOpenIssues } from './github-issues.js';
import { getBranch, getDiff } from './github-branch.js';

class GitHubManager extends GitProviderBase implements GitProvider {
    provider = 'github' as const;
    repoFullName: string;
    apiToken: string;
    apiUrl: string;
    client: AxiosInstance = {} as AxiosInstance;
    log: Logger = {} as Logger;
    owner: string = '';
    repo: string = '';

    constructor(repoFullName: string, apiToken: string, baseUrl?: string) {
        super();
        this.repoFullName = repoFullName;
        this.apiToken = apiToken;
        this.apiUrl = stripTrailingSlashes(baseUrl || 'https://api.github.com');
        if (!apiToken) {
            throw new Error('GitHub: apiToken é obrigatório');
        }
        if (!repoFullName || !repoFullName.includes('/')) {
            throw new Error('GitHub: repoFullName deve estar no formato "owner/repo"');
        }
        this.client = createThrottledClient({
            baseUrl: this.apiUrl,
            authHeader: { Authorization: 'Bearer ' + apiToken },
            maxConcurrency: 3,
        });
        this.log = new Logger({ resource: 'GitHub', projectId: repoFullName });
        const parts = repoFullName.split('/');
        this.owner = parts[0] as string;
        this.repo = parts.slice(1).join('/');
    }

    get _repoPath(): string {
        return '/repos/' + this.owner + '/' + this.repo;
    }

    async _patch<T = JsonObject>(url: string, body?: unknown, opts?: { operation?: string }): Promise<T> {
        try {
            const args = body !== undefined ? [body] : [];
            const response = await this.client.patch<T>(url, ...args);
            return response.data;
        } catch (err) {
            return handleError(err, { context: opts?.operation || url });
        }
    }

    _formatPR(data: JsonObject | null | undefined): MergeRequestInfo | null {
        if (!data) return null;
        return formatPR(data);
    }

    async triggerPipeline(payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }): Promise<PipelineTriggerResult | undefined> {
        return wfTriggerPipeline(this.client, this.owner, this.repo, this.apiUrl, payload);
    }

    async createMergeRequest(
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        return prCreateMergeRequest(this.client, this.owner, this.repo, sourceBranch, targetBranch, title, description);
    }

    async updateMergeRequest(
        iid: string | number,
        title: string,
        description?: string,
    ): Promise<MergeRequestInfo | null> {
        return prUpdateMergeRequest(this.client, this.owner, this.repo, iid, title, description);
    }

    async getMergeRequest(iid: string | number): Promise<MergeRequestInfo | null> {
        return prGetMergeRequest(this.client, this.owner, this.repo, iid);
    }

    async searchMergeRequests(
        sourceBranch: string,
        targetBranch: string,
        searchStatus: string,
    ): Promise<MergeRequestInfo[]> {
        return prSearchMergeRequests(this.client, this.owner, this.repo, sourceBranch, targetBranch, searchStatus);
    }

    async acceptMergeRequest(iid: string | number, shouldRemoveSourceBranch = true): Promise<MergeRequestInfo | null> {
        return prAcceptMergeRequest(this.client, this.owner, this.repo, iid, shouldRemoveSourceBranch);
    }

    async getRecentPipelines(count = 5): Promise<PipelineRun[]> {
        return wfGetRecentPipelines(this.client, this.owner, this.repo, count);
    }

    async getPipeline(runId: string | number): Promise<PipelineInfo | null> {
        return wfGetPipeline(this.client, this.owner, this.repo, runId);
    }

    async getPipelineJobs(pipelineId: string | number): Promise<PipelineJob[]> {
        return wfGetPipelineJobs(this.client, this.owner, this.repo, pipelineId);
    }

    async listPipelineArtifacts(pipelineId: string | number): Promise<ArtifactInfo[]> {
        return wfListPipelineArtifacts(this.client, this.owner, this.repo, pipelineId);
    }

    async downloadArtifact(artifactId: string | number): Promise<{ buffer: Buffer; filename: string }> {
        return wfDownloadArtifact(this.client, this.owner, this.repo, artifactId);
    }

    async getBranch(branch: string): Promise<{ name: string } | null> {
        return getBranch(this.client, this.owner, this.repo, branch);
    }

    async getCICDVariables(): Promise<CICDVariable[]> {
        return wfGetCICDVariables(this.client, this.owner, this.repo);
    }

    async isApproved(prNumber: string | number): Promise<boolean> {
        return prIsApproved(this.client, this.owner, this.repo, prNumber);
    }

    async getDiff(source: string, target: string): Promise<string> {
        return getDiff(this.client, this.owner, this.repo, source, target);
    }

    async getOpenIssues(): Promise<Issue[]> {
        return getOpenIssues(this.client, this.owner, this.repo);
    }

    async getJobLogs(jobId: string | number, maxBytes = 10240): Promise<string | null> {
        return wfGetJobLogs(this.client, this.owner, this.repo, jobId, maxBytes);
    }

    override async getWorkflowRunTiming(runId: number): Promise<{ run_duration_ms: number } | null> {
        return wfGetWorkflowRunTiming(this.client, this.owner, this.repo, runId);
    }

    override async getFileContents(path: string, ref?: string): Promise<string | null> {
        return wfGetFileContents(this.client, this.owner, this.repo, path, ref);
    }

    override async listDirectory(path: string, ref?: string): Promise<DirEntry[] | null> {
        return wfListDirectory(this.client, this.owner, this.repo, path, ref);
    }

    override getTestReport(_pipelineId: string | number): Promise<null> {
        return Promise.resolve(null);
    }

    /** Get repo tree with caching (for framework detection). */
    async getRepoTree(ref: string): Promise<string[] | null> {
        return wfGetRepoTreeCached(this.client, this.owner, this.repo, ref);
    }

    async getSchedules(): Promise<ScheduleInfo[]> {
        return wfGetSchedules();
    }

    async runSchedule(scheduleId: string | number): Promise<JsonObject> {
        return wfRunSchedule(scheduleId);
    }
}

export default GitHubManager;
