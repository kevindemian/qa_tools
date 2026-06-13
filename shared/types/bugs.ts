import { LLMEnrichment } from './llm.js';
import { HealthScoreGrade } from './common.js';

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

/** All five dimensions of the health score. */
export interface HealthScoreDimensions {
    passRate: HealthScoreDimensionResult;
    flakyRate: HealthScoreDimensionResult;
    coverage: HealthScoreDimensionResult;
    suiteSpeed: HealthScoreDimensionResult;
    executionRate: HealthScoreDimensionResult;
}

/** Provenance entry for a single health score dimension — documents source, formula, and threshold basis. */
export interface HealthScoreProvenanceEntry {
    dimension: string;
    source: string;
    standard: string;
    formula: string;
    thresholdBasis: string;
    /** Whether the threshold/boundary can be overridden by config. */
    configurable: boolean;
    /** True when the user provided a non-default value for this dimension. */
    overridden?: boolean;
}

/** Full provenance for all health score dimensions. */
export type HealthScoreProvenance = HealthScoreProvenanceEntry[];

/** Overall health score result with per-dimension breakdown. */
export interface HealthScoreResult {
    overall: number;
    grade: HealthScoreGrade;
    qualityGate: 'pass' | 'fail';
    dimensions: HealthScoreDimensions;
    /** Provenance metadata for each dimension, when enabled. */
    provenance?: HealthScoreProvenance;
    runCount: number;
    timestamp: string;
}
