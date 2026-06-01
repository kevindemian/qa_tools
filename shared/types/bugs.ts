import { LLMEnrichment } from './llm';
import { HealthScoreGrade } from './common';

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
