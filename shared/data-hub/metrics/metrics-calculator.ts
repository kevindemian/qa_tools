import type { RawData, ComputedMetrics, HealthDimensions } from '../../types/data-hub.js';
import * as compute from '../compute/index.js';
import {
    DEFAULT_SCORING_CONFIG,
    DEFAULT_PIPELINE_COST_CONFIG,
    DEFAULT_TRENDS_CONFIG,
    DEFAULT_QUARANTINE_CONFIG,
    DEFAULT_WEIGHTS,
} from '../compute/types.js';

export function calculateMetrics(rawData: RawData): ComputedMetrics {
    const runs = rawData.runs.filter((r) => r.id !== undefined);
    const jobsMap = rawData.jobs;

    const passRate = compute.calcPipelinePassRate(runs);
    const avgDuration = compute.calcAvgDuration(runs);

    const flakyRate = compute.calcFlakyFromPipelineRuns(runs, jobsMap);
    const suiteSpeedP95 = compute.calcSuiteSpeedP95(jobsMap);

    let coverage = 0;
    if (rawData.coverage) {
        const cov = compute.calcCoverageFromRaw(rawData.coverage);
        coverage = cov.total;
    }

    const pipelineCost = compute.calcPipelineCost(runs, DEFAULT_PIPELINE_COST_CONFIG.costPerMinute);

    const defectTrends = compute.calcTrendsFromPipelineRuns(runs, DEFAULT_TRENDS_CONFIG.windowSize);

    const branchBreakdown = compute.calcBranchBreakdown(runs);
    const topFailingJobs = compute.calcTopFailingJobs(runs, jobsMap);

    const reasons = compute.calcTopFailureReasons(rawData.failureReasons);
    const topFailureReasons = reasons.map((r) => ({ pattern: r.pattern, count: r.count }));

    const dimPassRate = compute.makeDimensionScore(passRate, DEFAULT_SCORING_CONFIG.passRateTarget);
    const firstFlaky = flakyRate[0];
    const dimFlaky = compute.makeDimensionScore(100 - (firstFlaky ? firstFlaky.rate : 0), 100);
    const dimCoverage = compute.makeDimensionScore(coverage, DEFAULT_SCORING_CONFIG.coverageTarget);
    const dimSuiteSpeed = compute.makeDimensionScore(
        100 - Math.min((suiteSpeedP95 / DEFAULT_SCORING_CONFIG.suiteSpeedTarget) * 100, 100),
        80,
    );
    const dimExecutionRate = compute.makeDimensionScore(passRate, DEFAULT_SCORING_CONFIG.executionRateTarget);

    const dimensions: HealthDimensions = {
        passRate: dimPassRate,
        flakyRate: dimFlaky,
        coverage: dimCoverage,
        suiteSpeed: dimSuiteSpeed,
        executionRate: dimExecutionRate,
    };

    const releaseScore = compute.calcReleaseScore(dimensions, DEFAULT_WEIGHTS);

    const quarantineStatus = compute.calcQuarantineStatus(flakyRate, DEFAULT_QUARANTINE_CONFIG);

    return {
        passRate,
        avgDuration,
        suiteSpeedP95,
        flakyRate,
        coverage,
        pipelineCost,
        defectTrends,
        branchBreakdown,
        topFailingJobs,
        topFailureReasons,
        releaseScore,
        quarantineStatus,
    };
}
