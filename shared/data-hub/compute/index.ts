/**
 * Data Hub — Compute layer barrel.
 *
 * Re-exports all pure compute functions.
 */
export { calcPipelinePassRate } from './pass-rate.js';
export { calcAvgDuration } from './avg-duration.js';
export { calcSuiteSpeedP95 } from './suite-speed.js';
export { calcFlakyFromPipelineRuns } from './flaky-rate.js';
export { extractFailureReasons, calcTopFailureReasons } from './failure-reasons.js';
export { calcBranchBreakdown, calcTopFailingJobs } from './branch-health.js';
export { calcCoverageFromRaw } from './coverage.js';
export type { CoverageResult } from './coverage.js';
export { calcTrendsFromPipelineRuns } from './trends.js';
export { computeGrade } from './scoring.js';
export type { Grade, ScoreResult } from './scoring.js';
export { calcReleaseScore, makeDimensionScore } from './release-score.js';
export { calcQuarantineStatus } from './quarantine-status.js';
export { calcPipelineCost } from './pipeline-cost.js';
export { calcDefectTrends } from './defect-trends.js';
export type { DefectTrendPoint, DefectTrendResult } from './defect-trends.js';
