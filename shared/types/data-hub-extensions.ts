/**
 * DataHub type extensions for content specification computed metrics.
 *
 * These types are used by new compute modules (ai-metrics, defect-aggregation,
 * regression-detection, optimization-actions) and referenced by ComputedMetrics.
 */

/** Per-version breakdown for AI metrics. */
export interface AiVersionMetric {
    version: string;
    count: number;
    acceptanceRate: number;
}

/** Daily trend point for AI metrics. */
export interface AiTrendPoint {
    date: string;
    acceptanceRate: number;
    generated: number;
}

/** Complete AI metrics result. */
export interface AiMetricsResult {
    acceptanceRate: number;
    totalRecords: number;
    totalGenerated: number;
    totalKept: number;
    totalModified: number;
    totalDeleted: number;
    topPromptVersion: string;
    byVersion: AiVersionMetric[];
    trend: AiTrendPoint[];
    requirementScores: Record<string, number>;
    timestamp: string;
}

/** A single data point in a daily defect trend. */
export interface DefectTrendPoint {
    date: string;
    categories: Record<string, number>;
    total: number;
}

/** A single data point for day-of-week seasonality. */
export interface SeasonalityDay {
    dayOfWeek: string;
    total: number;
    categories: Record<string, number>;
}

/** A single data point for hour-of-day seasonality. */
export interface SeasonalityHour {
    hour: number;
    total: number;
    categories: Record<string, number>;
}

/** Result of defect aggregation by trend. */
export interface DefectAggregationResult {
    trends: DefectTrendPoint[];
    topCategories: Array<{ category: string; count: number }>;
    period: { from: string; to: string };
    totalRecords: number;
}

/** Result of defect seasonality aggregation. */
export interface SeasonalityAggregationResult {
    byDayOfWeek: SeasonalityDay[];
    byHour: SeasonalityHour[];
    peakDay: string;
    peakHour: number;
    totalRecords: number;
    period: { from: string; to: string };
}

/** Regression severity classification. */
export type RegressionSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/** A detected regression entry. */
export interface RegressionEntry {
    title: string;
    meanDuration: number;
    currentDuration: number;
    stdDev: number;
    zScore: number;
    severity: RegressionSeverity;
    previousDurations: number[];
}

/** Result of regression detection. */
export interface RegressionDetectionResult {
    regressions: RegressionEntry[];
    totalTests: number;
    threshold: number;
}

/** Optimization action type. */
export type OptimizationAction = 'quarantine' | 'split' | 'parallelize' | 'remove_wait' | 'speed_up' | 'none';

/** Optimization impact level. */
export type OptimizationImpact = 'high' | 'medium' | 'low';

/** A single test optimization recommendation. */
export interface OptimizationEntry {
    testTitle: string;
    duration: number;
    flakiness: number;
    impact: OptimizationImpact;
    action: OptimizationAction;
    reason: string;
}

/** Complete optimization result. */
export interface OptimizationResult {
    optimizations: OptimizationEntry[];
    totalTests: number;
    totalDuration: number;
    potentialSavings: number;
    slowThreshold: number;
    flakyThreshold: number;
}
