export type JsonObject = Record<string, unknown>;
export type LogContext = Record<string, unknown>;
export type StateContainer = Record<string, unknown>;

export interface LoggerLike {
    info(msg: string, ctx?: Record<string, unknown>): void;
    warn(msg: string, ctx?: Record<string, unknown>): void;
    error(msg: string, ctx?: Record<string, unknown>): void;
    child?(context: Record<string, unknown>): LoggerLike;
}

export interface TestResult {
    status: 'ok' | 'error';
    label: string;
    message: string;
}

export interface TestStep {
    fields: {
        Action?: string;
        Data?: string;
        ExpectedResult?: string;
    };
}

export interface TestCase {
    title: string;
    description?: string;
    steps: TestStep[];
    precondition?: {
        type: 'inline' | 'reference';
        value: string;
    };
    group?: string;
    linkedIssues?: Array<{
        key: string;
        linkType: string;
    }>;
}

export interface JiraIssue {
    key: string;
    fields: {
        description?: string;
        summary?: string;
        project?: {
            key: string;
        };
        issuetype?: {
            name: string;
        };
        labels?: string[];
    };
}

export interface StateSchema {
    lastChoice?: string;
    lastProject?: string;
    lastCypressPath?: string;
    lastJsonDir?: string;
    lastLabels?: string;
    lastCsvPath?: string;
    lastJsonPath?: string;
    history?: Array<{
        op: string;
        detail: string;
        status: string;
        ts: string;
    }>;
    _checkpoint?: {
        csvPath: string;
        jsonPath: string;
        project: string;
        testCount: number;
        done: Array<{
            key: string;
            title: string;
        }>;
        ts: string;
    };
}

export interface ApiConfig {
    baseUrl: string;
    token: string;
    logger?: LoggerLike;
}

export interface PipelineInfo {
    id?: string | number;
    web_url?: string;
    status?: string;
    state?: string;
    ref?: string;
}

export interface ScheduleInfo {
    id: string | number;
    description?: string;
    next_run_at?: string;
}

export interface MergeRequestInfo {
    iid?: string | number;
    number?: string | number;
    title?: string;
    state?: string;
    web_url?: string;
    description?: string;
    source_branch?: string;
    target_branch?: string;
    approved?: boolean;
}

export interface CICDVariable {
    key: string;
    value: string;
    type?: string;
}

export interface PipelineJob {
    id: string | number;
    name: string;
    stage: string;
    status: string;
}

export interface ArtifactInfo {
    id: string | number;
    name: string;
}

export interface PipelineRun {
    id?: string | number;
    run_number?: string | number;
    ref?: string;
    head_branch?: string;
    status?: string;
    conclusion?: string;
    web_url?: string;
}

export interface PipelineTriggerResult {
    id?: string | number;
    web_url?: string;
    run_number?: string | number;
}

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
    updateMergeRequest: (
        iid: string | number,
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ) => Promise<MergeRequestInfo | null>;
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

export interface JiraIssueLinkType {
    id: string;
    name: string;
    inward: string;
    outward: string;
}

export interface ProjectVersion {
    id: string;
    name: string;
    released: boolean;
    [key: string]: unknown;
}

export type SearchResult = {
    issues: JiraIssue[];
    total: number;
};

export interface LLMEnrichment {
    enrichedAt: string;
    model: string;
    suggestedFix?: string;
    rootCause?: string;
    confidence?: number;
}

export interface BugReport {
    summary: string;
    description: string;
    source: 'automated' | 'manual';
    stepsToReproduce?: string[];
    expectedResult?: string;
    actualResult?: string;
    environment?: string;
    severity: 'trivial' | 'minor' | 'major' | 'critical';
    component?: string;
    llmEnrichment?: LLMEnrichment;
    metadata?: {
        pipelineId?: string;
        branch?: string;
        commitSha?: string;
        provider?: string;
    };
}

export class JiraResourceError extends Error {
    status?: number;
    resource?: string;
    body?: unknown;

    constructor(message: string, options?: { status?: number; resource?: string; body?: unknown }) {
        super(message);
        this.name = 'JiraResourceError';
        this.status = options?.status;
        this.resource = options?.resource;
        this.body = options?.body;
    }
}
