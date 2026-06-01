/** Summary of a CI pipeline execution. */
export interface PipelineInfo {
    /** Pipeline ID. */
    id?: string | number;
    /** URL to the pipeline in the provider UI. */
    web_url?: string;
    /** Pipeline status (e.g. running, success, failed). */
    status?: string;
    /** Pipeline lifecycle state. */
    state?: string;
    /** Git ref (branch or tag) the pipeline ran on. */
    ref?: string;
}

/** A scheduled pipeline trigger. */
export interface ScheduleInfo {
    /** Schedule ID. */
    id: string | number;
    /** Human description of the schedule. */
    description?: string;
    /** ISO date of the next scheduled run. */
    next_run_at?: string;
}

/** Pull / merge request metadata from a Git provider. */
export interface MergeRequestInfo {
    /** Provider-internal IID (GitLab) or PR number (GitHub). */
    iid?: string | number;
    /** PR number (GitHub). */
    number?: string | number;
    /** MR/PR title. */
    title?: string;
    /** Current state (opened, merged, closed). */
    state?: string;
    /** URL to the MR/PR in the provider UI. */
    web_url?: string;
    /** MR/PR body text. */
    description?: string;
    /** Name of the source branch. */
    source_branch?: string;
    /** Name of the target branch. */
    target_branch?: string;
    /** Whether the MR/PR has been approved. */
    approved?: boolean;
}

/** A named CI/CD variable. */
export interface CICDVariable {
    /** Variable name. */
    key: string;
    /** Variable value. */
    value: string;
    /** Variable type (e.g. env_var, file). */
    type?: string;
}

/** A single job within a CI pipeline. */
export interface PipelineJob {
    /** Job ID. */
    id: string | number;
    /** Job name. */
    name: string;
    /** CI stage the job belongs to. */
    stage: string;
    /** Execution status (conclusion from API). */
    status: string;
    /** Individual step conclusions within the job (GitHub API). */
    stepConclusions?: Array<{ name: string; conclusion: string; number: number }>;
}

/** A GitHub issue summary. */
export interface Issue {
    /** Issue number. */
    number: number;
    /** Issue title. */
    title: string;
    /** Current state (open, closed). */
    state: string;
    /** ISO timestamp of last update. */
    updated_at: string;
    /** ISO timestamp of creation. */
    created_at: string;
    /** Issue labels. */
    labels: string[];
    /** Issue URL. */
    html_url: string;
}

/** A pipeline artifact reference. */
export interface ArtifactInfo {
    /** Artifact ID. */
    id: string | number;
    /** Artifact filename. */
    name: string;
}

/** A GitHub Actions / GitLab CI pipeline run summary. */
export interface PipelineRun {
    /** Pipeline run ID. */
    id?: string | number;
    /** Run number (GitHub Actions). */
    run_number?: string | number;
    /** Git ref the pipeline ran on. */
    ref?: string;
    /** Head branch name. */
    head_branch?: string;
    /** Execution status (queued, in_progress, completed). */
    status?: string;
    /** Final conclusion (success, failure, cancelled). */
    conclusion?: string;
    /** URL to the run in the provider UI. */
    web_url?: string;
    /** Trigger event (push, pull_request, workflow_dispatch). */
    event?: string;
    /** ISO timestamp of run creation. */
    created_at?: string;
    /** ISO timestamp of last update. */
    updated_at?: string;
    /** ISO timestamp of run start. */
    run_started_at?: string;
}

/** Result returned after triggering a pipeline. */
export interface PipelineTriggerResult {
    /** Triggered pipeline ID. */
    id?: string | number;
    /** URL to the triggered pipeline. */
    web_url?: string;
    /** Run number (GitHub Actions). */
    run_number?: string | number;
}

/** Abstract interface for Git provider operations (GitLab / GitHub). */
export interface GitProvider {
    triggerPipeline: (payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }) => Promise<PipelineTriggerResult | undefined>;
    getSchedules: () => Promise<ScheduleInfo[]>;
    runSchedule: (scheduleId: string | number) => Promise<Record<string, unknown>>;
    createMergeRequest: (
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ) => Promise<MergeRequestInfo | null>;
    updateMergeRequest: (iid: string | number, title: string, description?: string) => Promise<MergeRequestInfo | null>;
    getMergeRequest: (iid: string | number) => Promise<MergeRequestInfo | null>;
    searchMergeRequests: (sourceBranch: string, targetBranch: string, status: string) => Promise<MergeRequestInfo[]>;
    acceptMergeRequest: (iid: string | number, removeSourceBranch?: boolean) => Promise<MergeRequestInfo | null>;
    isApproved: (id: string | number) => Promise<boolean>;
    getCICDVariables: () => Promise<CICDVariable[]>;
    getRecentPipelines: (count?: number) => Promise<PipelineRun[]>;
    getBranch: (branch: string) => Promise<{ name: string } | null>;
    getPipeline: (id: string | number) => Promise<PipelineInfo | null>;
    getPipelineJobs: (pipelineId: string | number) => Promise<PipelineJob[]>;
    listPipelineArtifacts: (pipelineId: string | number) => Promise<ArtifactInfo[]>;
    downloadArtifact: (artifactId: string | number) => Promise<{ buffer: Buffer; filename: string }>;
    getDiff: (source: string, target: string) => Promise<string>;
    provider: 'gitlab' | 'github';
}

/** GitHub Actions workflow run item. */
export interface GitHubWorkflowRun {
    id: number;
    run_number: number;
    name?: string;
    head_branch?: string;
    head_sha?: string;
    status?: string;
    conclusion?: string;
    created_at?: string;
    updated_at?: string;
    html_url?: string;
    event?: string;
    head_commit?: {
        id?: string;
        message?: string;
        author?: { name?: string };
    };
}

/** GitHub Actions workflow runs API response. */
export interface GitHubWorkflowRunsResponse {
    total_count: number;
    workflow_runs: GitHubWorkflowRun[];
}

/** GitHub Actions artifact item. */
export interface GitHubArtifact {
    id: number;
    name: string;
    size_in_bytes?: number;
    created_at?: string;
}

/** GitHub Actions artifacts API response. */
export interface GitHubArtifactsResponse {
    artifacts: GitHubArtifact[];
}

/** GitLab CI job item. */
export interface GitLabJob {
    id: number;
    name: string;
    stage?: string;
    status?: string;
    artifacts_file?: { filename?: string };
    artifacts?: Array<{ file_type?: string }>;
}
