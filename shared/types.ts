/** Shared type definitions used across all QA Tools layers. */

/** Generic JSON-compatible object shape. */
export type JsonObject = Record<string, unknown>;

/** Arbitrary key-value metadata carried across log calls. */
export type LogContext = Record<string, unknown>;

/** Serializable bag of persisted user state. */
export type StateContainer = Record<string, unknown>;

/** Outcome of a single operation with human-readable feedback. */
export interface TestResult {
    /** 'ok' on success, 'error' on failure. */
    status: 'ok' | 'error';
    /** Short label identifying the operation. */
    label: string;
    /** Descriptive message or error detail. */
    message: string;
}

/** A single step within a manual or automated test case.
 * Field names match the Xray Server REST API exactly.
 * {@link https://docs.getxray.app/display/XRAY/Test+Execution}
 * @production `Expected Result` — field name com espaço exigido pela Xray Server API.
 *   NÃO alterar para `ExpectedResult` sem revalidar contra API de produção.
 */
export interface TestStep {
    fields: {
        /** User-facing action description. */
        Action?: string;
        /** Input data for the step. */
        Data?: string;
        /** Expected outcome after the action.
         * @production Xray Server API exige o nome com espaço (`Expected Result`).
         * Cloud GraphQL mapeia internamente para `result` no mutation `addTestStep`. */
        'Expected Result'?: string;
    };
}

/** A pre-condition listed or created during AI-assisted test generation.
 * @production LLM pode referenciar pre-conditions existentes (reference) ou solicitar criação (create). */
export interface PreConditionInput {
    type: 'reference' | 'create';
    key?: string;
    summary?: string;
}

/** Summary of an existing pre-condition fetched from Jira. */
export interface PreConditionSummary {
    key: string;
    summary: string;
}

/** Summary of a Test Execution issue from a JQL search. */
export interface TestExecutionSummary {
    key: string;
    summary: string;
    status: string;
    created: string;
}

/** Outcome of matching a desired precondition against available ones. */
export interface PreConditionMatchResult {
    /** Resolved reference key, or `'__create__'` when a new one must be created. */
    key: string;
    /** Human summary (matched or original). */
    summary: string;
    /** Whether this is an exact, overlap, or create match. */
    matchType: 'exact' | 'containment' | 'overlap' | 'create';
}

/** A complete test case composed of ordered steps. */
export interface TestCase {
    /** Human-readable test title. */
    title: string;
    /** Optional longer description of the test. */
    description?: string;
    /** Ordered list of execution steps. */
    steps: TestStep[];
    /** Precondition supplied inline or as an external reference. */
    precondition?: {
        type: 'inline' | 'reference';
        value: string;
    };
    /** Logical grouping label (e.g. smoke, regression). */
    group?: string;
    /** Jira issues linked to this test. */
    linkedIssues?: Array<{
        key: string;
        linkType: string;
    }>;
}

/** Persisted CLI session state, checkpointed between runs. */
export interface StateSchema {
    /** Last interactive menu choice. */
    lastChoice?: string;
    /** Last selected project key. */
    lastProject?: string;
    /** Last Cypress results path. */
    lastCypressPath?: string;
    /** Last JSON output directory. */
    lastJsonDir?: string;
    /** Last labels filter string. */
    lastLabels?: string;
    /** Last CSV import path. */
    lastCsvPath?: string;
    /** Last JSON test file path. */
    lastJsonPath?: string;
    /** Command history log. */
    history?: Array<{
        op: string;
        detail: string;
        status: string;
        ts: string;
    }>;
    /** Resumable checkpoint for multi-step workflows. */
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

/** AI-generated enrichment metadata attached to a bug report. */
export interface LLMEnrichment {
    /** ISO timestamp when enrichment was performed. */
    enrichedAt: string;
    /** Model identifier used for enrichment. */
    model: string;
    /** Suggested code fix, if any. */
    suggestedFix?: string;
    /** Identified root cause description. */
    rootCause?: string;
    /** Confidence score (0-1) of the enrichment. */
    confidence?: number;
}

/** A structured bug report, optionally enriched by LLM analysis. */
export interface BugReport {
    /** One-line summary of the issue. */
    summary: string;
    /** Detailed description of the bug. */
    description: string;
    /** Whether the bug was found by automation or reported manually. */
    source: 'automated' | 'manual';
    /** Ordered steps to reproduce the issue. */
    stepsToReproduce?: string[];
    /** Expected behaviour. */
    expectedResult?: string;
    /** Actual observed behaviour. */
    actualResult?: string;
    /** Environment description (OS, browser, version, etc.). */
    environment?: string;
    /** Impact severity. */
    severity: 'trivial' | 'minor' | 'major' | 'critical';
    /** Affected component or module. */
    component?: string;
    /** LLM enrichment data, if requested. */
    llmEnrichment?: LLMEnrichment;
    /** Jira issues linked to this bug report. */
    linkedIssues?: Array<{
        key: string;
        linkType: string;
    }>;
    /** CI/CD context in which the bug was detected. */
    metadata?: {
        pipelineId?: string;
        branch?: string;
        commitSha?: string;
        provider?: string;
    };
}

/** A single item in a coverage gap analysis. */
export interface CoverageGapItem {
    issueKey: string;
    summary: string;
    type: 'Story' | 'Task' | 'Bug' | 'Epic';
    status: string;
    epicKey?: string;
    epicSummary?: string;
    hasTest: boolean;
    linkedTestKeys: string[];
    priority: string;
    coverageWeight: number;
    lastRunPassed?: boolean;
    lastRunDate?: string;
}

/** Result of a coverage gap analysis. */
export interface CoverageGapResult {
    items: CoverageGapItem[];
    totals: { totalIssues: number; covered: number; gap: number; weightedCoveragePct: number; rawCoveragePct: number };
    byEpic: Record<string, EpicCoverage>;
    gateConfig: { minCoveragePct: number; failingEpics: string[] };
    hierarchy: CoverageHierarchyNode[];
    trends: import('./metrics').CoverageSnapshot[];
}

/** Coverage data for a single epic. */
export interface EpicCoverage {
    epicSummary: string;
    total: number;
    covered: number;
    weightedPct: number;
    rawPct: number;
    gatePass: boolean;
    issues: CoverageGapItem[];
}

/** A node in the coverage hierarchy tree. */
export interface CoverageHierarchyNode {
    key: string;
    summary: string;
    type: 'Epic' | 'Story' | 'Task' | 'Bug';
    children: CoverageHierarchyNode[];
    totalIssues: number;
    coveredIssues: number;
    coveragePct: number;
}

/** Configuration for flaky auto-actions. */
export interface FlakyActionConfig {
    threshold: number;
    autoCreateBug: boolean;
    bugPriority: string;
    minTotalRuns: number;
    dedupSearch: boolean;
    windowSize: number;
}

/** A flaky auto-action result. */
export interface FlakyAction {
    testTitle: string;
    flakyRate: number;
    passCount: number;
    failCount: number;
    totalRuns: number;
    lastErrorMessages: string[];
    action: 'create_bug' | 'flag_in_report' | 'quarantine' | 'reenable' | 'none';
    jiraBugKey?: string;
    reason: string;
}

/** Maps source file patterns to associated test metadata (for Tier 3 explicit mapping). */
export interface FileTestMapping {
    files: string[];
    testKeys: string[];
    testTitles: string[];
    testFiles: string[];
}

/** Test impact analysis result. */
export interface TestImpactResult {
    changedFiles: string[];
    impactedTests: ImpactedTest[];
    unaffected: { total: number; skippedDueTo: string[] };
    suggestedCommand?: string;
    confidence: 'high' | 'medium' | 'low';
}

/** A single impacted test. */
export interface ImpactedTest {
    testKey?: string;
    title: string;
    reason: string;
    matchMode: 'mapping' | 'keyword' | 'jest_find_related';
    filePattern?: string;
}

/** AI generation feedback record. */
export interface AiGenerationRecord {
    id: string;
    generatedAt: string;
    promptVersion: string;
    userStory: string;
    acceptanceCriteria: string;
    generatedTests: Array<{ title: string; preConditions: string[]; stepCount: number }>;
    preconditionMatches: Array<{ summary: string; matchType: string }>;
    feedback?: AiModification[];
}

/** A single AI modification record. */
export interface AiModification {
    testKey: string;
    recordedAt: string;
    action: 'kept' | 'modified' | 'deleted';
    reason?: string;
}

/** Grade label for health score classification. */
export type HealthScoreGrade = 'excellent' | 'good' | 'needs_attention' | 'critical';

/** Result for a single dimension within the health score. */
export interface HealthScoreDimensionResult {
    score: number;
    status: 'pass' | 'fail';
}

/** All four dimensions of the health score. */
export interface HealthScoreDimensions {
    passRate: HealthScoreDimensionResult;
    flakyRate: HealthScoreDimensionResult;
    coverage: HealthScoreDimensionResult;
    suiteSpeed: HealthScoreDimensionResult;
}

/** Overall health score result with per-dimension breakdown. */
export interface HealthScoreResult {
    overall: number;
    grade: HealthScoreGrade;
    qualityGate: 'pass' | 'fail';
    dimensions: HealthScoreDimensions;
    runCount: number;
    timestamp: string;
}
