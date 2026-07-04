/**
 * Data Hub — Adapter.
 *
 * Converts between DataHub (new) and CiDataHub (legacy) types.
 * Purpose: backward compatibility with existing consumers.
 */
import type { DataHub } from '../types/data-hub.js';
import type { CiDataHub } from '../ci-data.js';

/**
 * Convert a DataHub (new) to CiDataHub (legacy).
 *
 * @param hub - New DataHub instance.
 * @returns CiDataHub for backward compatibility.
 */
export function dataHubToCiDataHub(hub: DataHub): CiDataHub {
    return {
        runs: hub.raw.runs,
        jobs: hub.raw.jobs,
        failureReasons: hub.raw.failureReasons,
        artifacts: hub.raw.artifacts,
        passRate: hub.computed.passRate,
        avgDuration: hub.computed.avgDuration,
        suiteSpeedP95: hub.computed.suiteSpeedP95,
        topFailingJobs: hub.computed.topFailingJobs.map((j) => ({
            name: j.name,
            failureRate: j.failureRate,
            count: j.count,
        })),
        branchBreakdown: hub.computed.branchBreakdown,
        topFailureReasons: hub.computed.topFailureReasons.map((r) => ({
            pattern: r.pattern,
            count: r.count,
        })),
        flakyTests: hub.computed.flakyRate.map((f) => ({
            title: f.title,
            rate: f.rate,
            runs: f.runs,
        })),
        lastFetched: hub.timestamp,
        provider: hub.provider,
        repo: hub.repo,
        recentRunsCount: hub.raw.runs.length,
    };
}

/**
 * Convert a CiDataHub (legacy) to DataHub (new).
 *
 * NOTE: Legacy CiDataHub lacks coverage, pipelineCost, defectTrends,
 * releaseScore, quarantineStatus. These are zeroed on conversion.
 * Consumers needing these metrics should use DataHub directly.
 *
 * @param ciData - Legacy CiDataHub instance.
 * @returns DataHub with new type structure.
 */
export function ciDataHubToDataHub(ciData: CiDataHub): DataHub {
    return {
        raw: {
            runs: ciData.runs,
            jobs: ciData.jobs,
            artifacts: ciData.artifacts,
            failureReasons: ciData.failureReasons,
        },
        computed: {
            passRate: ciData.passRate,
            avgDuration: ciData.avgDuration,
            suiteSpeedP95: ciData.suiteSpeedP95,
            flakyRate: ciData.flakyTests.map((f: { title: string; rate: number; runs: number }) => ({
                title: f.title,
                rate: f.rate,
                runs: f.runs,
            })),
            coverage: 0,
            pipelineCost: { totalMinutes: 0, estimatedCost: 0 },
            defectTrends: [],
            branchBreakdown: ciData.branchBreakdown,
            topFailingJobs: ciData.topFailingJobs.map((j: { name: string; failureRate: number; count: number }) => ({
                name: j.name,
                failureRate: j.failureRate,
                count: j.count,
            })),
            topFailureReasons: ciData.topFailureReasons.map((r: { pattern: string; count: number }) => ({
                pattern: r.pattern,
                count: r.count,
            })),
            releaseScore: { score: 0, dimensions: {} as never, grade: 'critical' },
            quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
        },
        timestamp: ciData.lastFetched,
        provider: ciData.provider,
        repo: ciData.repo,
    };
}
