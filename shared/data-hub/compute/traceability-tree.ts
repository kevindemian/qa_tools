/**
 * Compute: Traceability Tree.
 *
 * Produces TraceabilityResult from hub data by delegating to the barrel's
 * buildTraceabilityMatrix function. Extracts metricsRuns and flakyRate
 * from computed metrics.
 *
 * @module traceability-tree
 */

import type { RawData, ComputedMetrics, DataHub } from '../../types/data-hub.js';
import type { TraceabilityResult } from '../../report/traceability-matrix.js';
import { buildTraceabilityMatrix } from '../../report/traceability-matrix.js';
import { rootLogger } from '../../logger.js';

/**
 * Create a minimal DataHub adapter for traceability computation.
 * Implements only the methods required by buildTraceabilityMatrix.
 * Persistence methods are no-ops (traceability is read-only).
 */
function createTraceabilityAdapter(raw: RawData, computed: ComputedMetrics): DataHub {
    const noop = () => {
        /* traceability is read-only; persistence not needed */
    };
    return {
        raw,
        computed,
        timestamp: new Date(),
        provider: 'github',
        repo: '',
        saveRun: noop,
        saveCoverageSnapshot: noop,
        saveFailureClassification: noop,
        flush: noop,
        loadCoverageHistory: () => [],
        loadFailureClassifications: () => [],
        saveMetricsStore: noop,
        saveParseResult: () => ({
            timestamp: new Date().toISOString(),
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: [],
        }),
        saveQualityMetrics: noop,
        loadQualityMetricsHistory: () => [],
        saveFailureRecords: noop,
        loadFailureRecords: () => [],
        saveSecurityFindings: noop,
        loadSecurityFindings: () => [],
        saveDeployments: noop,
        loadDeployments: () => [],
        saveReleases: noop,
        loadReleases: () => [],
        saveDoraMetrics: noop,
        loadDoraMetrics: () => null,
        savePmIssues: noop,
        loadPmIssues: () => [],
        saveCoverageFiles: noop,
        loadCoverageFiles: () => [],
        savePerformanceMetrics: noop,
        loadPerformanceMetrics: () => null,
        savePullRequests: noop,
        loadPullRequests: () => [],
        getProvenance: () => undefined,
        getQuality: () => undefined,
        getPmIssues: () => [],
        getPullRequests: () => [],
        getFailureRecords: () => [],
        getSecurityFindings: () => [],
        getDeployments: () => [],
        getReleases: () => [],
        getDoraMetrics: () => undefined,
        getCoverageFiles: () => [],
        getPerformanceMetrics: () => undefined,
        getRuns: () => [],
        getCoverage: () => undefined,
        getBranchPassRate: () => 0,
        mergeIncremental: noop,
        getQuarantine: () => ({ entries: [] }),
        loadReport: () => null,
        saveReport: noop,
        put: noop,
        getBranch: () => [],
        loadMetrics: () => null,
        saveMetrics: noop,
    } as DataHub;
}

/**
 * Compute traceability tree from hub data.
 *
 * @param _raw - Raw CI/CD data from the hub (reserved for future use).
 * @param computed - Pre-computed metrics from the hub.
 * @returns TraceabilityResult with epic > story > test tree structure.
 */
export function computeTraceabilityTree(_raw: RawData, computed: ComputedMetrics): TraceabilityResult {
    const metricsRuns = computed.metricsRuns ?? [];
    const hubLike = createTraceabilityAdapter(_raw, computed);
    try {
        return buildTraceabilityMatrix(metricsRuns, undefined, hubLike);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error('computeTraceabilityTree failed', {
            operation: 'computeTraceabilityTree',
            cause: msg,
            metricsRunCount: metricsRuns.length,
            hasFlakyRate: computed.flakyRate.length > 0,
            remediation: 'Verify that metrics run data and computed flaky rate are valid.',
        });
        return {
            nodes: [],
            totalEpics: 0,
            totalTests: 0,
            overallCoverage: 0,
            timestamp: new Date().toISOString(),
            awareness: { categories: [], minConfidence: null },
        };
    }
}
