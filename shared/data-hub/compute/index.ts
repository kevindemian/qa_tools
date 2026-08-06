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
export { calcPipelineCost, computePipelineCostResult } from './pipeline-cost.js';
export { calcExecutionRate } from './execution-rate.js';
export { calcFlakyPercentage } from './flaky-percentage.js';
export { calcPerRunCosts } from './per-run-costs.js';
export { convertToMetricsRuns } from './metrics-runs.js';
export { calcFlakinessEntries, calculateFlakyTestRate } from './flakiness-entries.js';
export { calcMetricsTrends } from './metrics-trends.js';
export { calcRunPassRate } from './run-pass-rate.js';
export { calcTestDurationP95 } from './test-duration-p95.js';
export { calcRunFailureRate } from './run-failure-rate.js';
export { calcTestDurationMap } from './test-duration-map.js';
export { calcRetryFlaky } from './retry-flaky.js';
export { calcComputeCost } from './compute-cost.js';
export type { RetryFlakyResult, ComputeCostResult } from '../../types/data-hub.js';
export { aggregateDefectTrends, aggregateDefectSeasonality } from './defect-aggregation.js';
export { detectSilentRegressions } from './regression-detection.js';
export { computeAiMetrics } from './ai-metrics.js';
export { computeOptimizationActions } from './optimization-actions.js';
export { computeImpactAlerts } from './impact-alerts.js';
export { computeIncidentEvents } from './incident-events.js';
export { computeTraceabilityTree } from './traceability-tree.js';
export { computeCoverageGap } from './coverage-gap.js';
export { computeCrossSquadBenchmark } from './cross-squad-benchmark.js';
export type { CrossSquadResult, SquadBenchmark } from './cross-squad-benchmark.js';
export { compareAiVsManual } from './ai-comparison.js';
export type { AiComparisonRecord, AiComparisonResult } from './ai-comparison.js';
export { calculateRequirementScores } from './requirement-score.js';
export type { RequirementScoreEntry, RequirementScoreResult } from './requirement-score.js';
export { computeSuiteBreakdown } from './suite-breakdown.js';
export { computeFailureClassifications } from './failure-classifications.js';
export { enrichFailuresWithAuthor } from '../extractors/failure-attribution.js';
export type {
    AiMetricsResult,
    AiVersionMetric,
    AiTrendPoint,
    DefectAggregationResult,
    SeasonalityAggregationResult,
    DefectTrendPoint,
    SeasonalityDay,
    SeasonalityHour,
    RegressionDetectionResult,
    RegressionEntry,
    RegressionSeverity,
    OptimizationResult,
    OptimizationEntry,
    OptimizationAction,
    OptimizationImpact,
} from '../../types/data-hub-extensions.js';
