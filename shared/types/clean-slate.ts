/** Clean-slate pipeline types — StepResult, StepInfo, SnapshotPartial, StepFailureHandler.
 *
 *  These types govern the tracing and interactive error handling for the clean-slate
 *  update pipeline in issue-snapshot.ts. Every sub-function returns StepResult,
 *  enabling structured tracing and informed user decisions on failure.
 *
 *  Snapshot types (StepSnapshot, LinkSnapshot, IssueFieldSnapshot) live here to
 *  avoid circular dependencies between shared/types and jira_management/. */

// ─────────────────────────────────────────────────────────────────
// SNAPSHOT TYPES (issue state before/after clean-slate)
// ─────────────────────────────────────────────────────────────────

/** Single test step snapshot. */
export interface StepSnapshot {
    id: string;
    action: string;
    data: string;
    result: string;
}

/** Single linked issue snapshot. Direction is preserved so rebuild/restore
 *  recreates the exact link (inward/outward) instead of losing it. */
export interface LinkSnapshot {
    id: string;
    linkType: string;
    inwardKey: string;
    outwardKey: string;
}

/** Complete snapshot of all modifiable fields on a Jira issue. */
export interface IssueFieldSnapshot {
    description: string | null;
    steps: StepSnapshot[];
    preconditions: string[];
    linkedIssues: LinkSnapshot[];
}

// ─────────────────────────────────────────────────────────────────
// STEP RESULT
// ─────────────────────────────────────────────────────────────────

/** Result of a single clean-slate step (clear or rebuild). */
export interface StepResult {
    /** Whether the step completed successfully. */
    ok: boolean;
    /** Step identifier: "clear-description", "clear-steps", etc. */
    step: string;
    /** Human-readable detail: "3 steps removed", "PUT null ok". */
    detail: string;
    /** Error message if ok=false. */
    error?: string;
    /** Context about what caused the failure. */
    context?: {
        issueKey: string;
        input: unknown;
        attempts: number;
    };
    /** Duration in milliseconds. */
    duration: number;
    /** User decision after failure (only set when onStepFailure was called). */
    decision?: 'skip' | 'abort' | 'retry' | 'rollback';
}

// ─────────────────────────────────────────────────────────────────
// STEP INFO (passed to error handler)
// ─────────────────────────────────────────────────────────────────

/** Context passed to StepFailureHandler for informed decision-making. */
export interface StepInfo {
    /** Name of the failed step. */
    step: string;
    /** Total number of steps in this phase (clear or rebuild). */
    totalSteps: number;
    /** Steps already completed (with their results). */
    completedSteps: StepResult[];
    /** The input that was being processed when the failure occurred. */
    currentInput: unknown;
}

// ─────────────────────────────────────────────────────────────────
// SNAPSHOT PARTIAL (per-step rollback)
// ─────────────────────────────────────────────────────────────────

/** A snapshot captured before a specific step, for per-step rollback. */
export interface SnapshotPartial {
    /** Step name this snapshot belongs to. */
    step: string;
    /** The snapshot state before this step executed. */
    snapshot: IssueFieldSnapshot;
}

// ─────────────────────────────────────────────────────────────────
// STEP FAILURE HANDLER
// ─────────────────────────────────────────────────────────────────

/** Decision function called when a clean-slate step fails after retries. */
export type StepFailureHandler = (error: Error, stepInfo: StepInfo) => Promise<'skip' | 'abort' | 'retry' | 'rollback'>;

// ─────────────────────────────────────────────────────────────────
// STEP NAMES (constants)
// ─────────────────────────────────────────────────────────────────

export const CLEAR_STEPS = ['clear-description', 'clear-steps', 'clear-preconditions', 'clear-links'] as const;

export const REBUILD_STEPS = [
    'rebuild-description',
    'rebuild-steps',
    'rebuild-preconditions',
    'rebuild-links',
] as const;

export const ALL_STEPS = [...CLEAR_STEPS, ...REBUILD_STEPS] as const;

export type ClearStepName = (typeof CLEAR_STEPS)[number];
export type RebuildStepName = (typeof REBUILD_STEPS)[number];
export type StepName = (typeof ALL_STEPS)[number];
