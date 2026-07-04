/**
 * Data Hub — Compute layer barrel.
 *
 * Re-exports all pure compute functions.
 */
export {
    calcPipelinePassRate,
    calcPipelineFailRate,
    calcTestPassRate,
    calcExpWeightedPassRate,
    calcExecutionRate,
    calcExpWeightedExecutionRate,
} from './pass-rate.js';
export { calcAvgDuration } from './avg-duration.js';
export { calcSuiteSpeedP95, calcTestSuiteSpeed } from './suite-speed.js';
export { calcFlakyFromPipelineRuns, calcFlakyFromMetricsRuns, calcFlakyPercentage } from './flaky-rate.js';
export { extractFailureReasons, calcTopFailureReasons } from './failure-reasons.js';
export { calcBranchBreakdown, calcTopFailingJobs } from './branch-health.js';
export { calcCoverageFromRaw } from './coverage.js';
export type { CoverageResult } from './coverage.js';
export { calcTrendsFromPipelineRuns, calcTrendsFromMetricsRuns } from './trends.js';
export {
    scorePassRate,
    scoreFlakyRate,
    scoreCoverage,
    scoreExecutionRate,
    scoreSuiteSpeed,
    computeGrade,
} from './scoring.js';
export type { Grade, ScoreResult } from './scoring.js';
export { calcReleaseScore, makeDimensionScore } from './release-score.js';
export { calcQuarantineStatus } from './quarantine-status.js';
