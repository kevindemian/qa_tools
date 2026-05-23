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

export interface GitProvider {
    triggerPipeline: (payload: {
        ref: string;
        variables: Array<{ key: string; value: string }>;
        workflow_id?: string;
    }) => Promise<Record<string, unknown>>;
    getSchedules: () => Promise<Array<Record<string, unknown>>>;
    runSchedule: (scheduleId: string | number) => Promise<Record<string, unknown>>;
    createMergeRequest: (
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ) => Promise<Record<string, unknown>>;
    updateMergeRequest: (
        iid: string | number,
        sourceBranch: string,
        targetBranch: string,
        title: string,
        description?: string,
    ) => Promise<Record<string, unknown>>;
    getMergeRequest: (iid: string | number) => Promise<Record<string, unknown> | null>;
    searchMergeRequests: (
        sourceBranch: string,
        targetBranch: string,
        status: string,
    ) => Promise<Array<Record<string, unknown>>>;
    acceptMergeRequest: (iid: string | number, removeSourceBranch?: boolean) => Promise<Record<string, unknown>>;
    isApproved: (id: string | number) => Promise<boolean>;
    getCICDVariables: () => Promise<Array<Record<string, unknown>>>;
    getRecentPipelines: (count?: number) => Promise<Array<Record<string, unknown>>>;
    getBranch: (branch: string) => Promise<{ name: string } | null>;
    getPipeline: (id: string | number) => Promise<Record<string, unknown> | null>;
    getPipelineJobs: (pipelineId: string | number) => Promise<
        Array<{
            id: string | number;
            name: string;
            stage: string;
            status: string;
        }>
    >;
    listPipelineArtifacts: (pipelineId: string | number) => Promise<
        Array<{
            id: string | number;
            name: string;
        }>
    >;
    downloadArtifact: (artifactId: string | number) => Promise<{ buffer: Buffer; filename: string }>;
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
