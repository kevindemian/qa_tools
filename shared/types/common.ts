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

/** Grade label for health score classification. */
export type HealthScoreGrade = 'excellent' | 'good' | 'needs_attention' | 'critical';

/** Inline token shape used internally by the markdown lexer/renderer.
 *  Exported here for cross-module type references (F3: replaces `any[]`). */
export interface InlineToken {
    type: string;
    text?: string;
    href?: string;
    tokens?: InlineToken[];
    depth?: number;
    items?: Array<{ tokens: InlineToken[] }>;
    header?: Array<{ tokens: InlineToken[] }>;
    rows?: Array<Array<{ tokens: InlineToken[] }>>;
    align?: string[];
    lang?: string;
}

/** Exit codes for CLI entry points. Maps to POSIX convention. */
export enum ExitCode {
    /** Successful completion. */
    OK = 0,
    /** General error. */
    ERROR = 1,
    /** Incorrect usage / invalid arguments. */
    USAGE = 2,
    /** Required resource unavailable (e.g. API down, missing env). */
    UNAVAILABLE = 3,
}

/** Runtime overrides for any config key. Keys map 1:1 to env var names (lowercase, camelCase).
 * When provided, overrides take precedence over env vars and `.env`.
 * @remarks Moved from `shared/config.ts` to `shared/types.ts` for SRP compliance (J3). */
export interface ConfigOverrides {
    jiraBaseUrl?: string;
    jiraPersonalToken?: string;
    jiraMode?: string;
    xrayBaseUrl?: string;
    xrayMode?: string;
    jiraProject?: string;
    gitToken?: string;
    gitBaseUrl?: string;
    githubToken?: string;
    githubApiUrl?: string;
    cypressProjectPath?: string;
    csvDefaultPath?: string;
    autoChoice?: string;
    autoConfirm?: string | boolean;
    dryRun?: string | boolean;
    debug?: string | boolean;
    quiet?: string | boolean;
    onError?: string;
    csvPath?: string;
    csvLabels?: string;
    jsonPath?: string;
    jsonLabels?: string;
    logLevel?: string;
    logFile?: string | boolean;
    logDir?: string;
    logMaxSize?: string | number;
    xdgStateHome?: string;
    llmApiKey?: string;
    llmModel?: string;
    llmBaseUrl?: string;
    llmSmallApiKey?: string;
    llmSmallModel?: string;
    llmFastApiKey?: string;
    llmFastModel?: string;
    llmFastBaseUrl?: string;
    llmReviewApiKey?: string;
    llmReviewModel?: string;
    llmReviewBaseUrl?: string;
    llmFallbackApiKey?: string;
    llmFallbackModel?: string;
    llmFallbackBaseUrl?: string;
    llmBatchApiKey?: string;
    llmBatchModel?: string;
    llmBatchBaseUrl?: string;
    xrayClientId?: string;
    xrayClientSecret?: string;
    xrayCloudUrl?: string;
    llmMaxTokens?: string | number;
    llmMaxTotalTokens?: string | number;
    knownIssuesPath?: string;
}
