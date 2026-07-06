import type { ComputedMetrics } from '../../types/data-hub.js';

export function importMetricsCsv(csv: string): Partial<ComputedMetrics> | null {
    if (!csv || csv.trim().length === 0) return null;

    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    const header = (lines[0] as string).trim().toLowerCase();
    const expectedHeader = 'metric,value';
    if (header !== expectedHeader) return null;

    const KNOWN_METRICS = new Set([
        'passRate',
        'avgDuration',
        'suiteSpeedP95',
        'coverage',
        'pipelineCost.totalMinutes',
        'pipelineCost.estimatedCost',
        'releaseScore.score',
        'releaseScore.grade',
        'quarantineStatus.flakyCount',
        'quarantineStatus.quarantinedCount',
    ]);

    const resultMap = new Map<string, string | number>();

    for (const line of lines.slice(1)) {
        const parts = line.split(',');
        if (parts.length < 2) continue;
        const metric = (parts[0] as string).trim();
        const value = (parts[1] as string).trim();
        const num = parseFloat(value);
        if (KNOWN_METRICS.has(metric)) {
            resultMap.set(metric, Number.isFinite(num) ? num : value);
        }
    }

    const result: Record<string, string | number> = Object.fromEntries(resultMap);

    if (result['passRate'] === undefined) return null;

    return {
        passRate: Number(result['passRate']) || 0,
        avgDuration: Number(result['avgDuration']) || 0,
        suiteSpeedP95: Number(result['suiteSpeedP95']) || 0,
        coverage: Number(result['coverage']) || 0,
        pipelineCost: {
            totalMinutes: Number(result['pipelineCost.totalMinutes']) || 0,
            estimatedCost: Number(result['pipelineCost.estimatedCost']) || 0,
        },
        releaseScore: {
            score: Number(result['releaseScore.score']) || 0,
            grade: String(result['releaseScore.grade'] || 'F'),
            dimensions: {
                passRate: { score: 0, status: 'fail' },
                flakyRate: { score: 0, status: 'fail' },
                coverage: { score: 0, status: 'fail' },
                suiteSpeed: { score: 0, status: 'fail' },
                executionRate: { score: 0, status: 'fail' },
            },
        },
        quarantineStatus: {
            flakyCount: Number(result['quarantineStatus.flakyCount']) || 0,
            quarantinedCount: Number(result['quarantineStatus.quarantinedCount']) || 0,
        },
    } satisfies Partial<ComputedMetrics>;
}
