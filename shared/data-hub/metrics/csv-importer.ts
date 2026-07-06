import type { ComputedMetrics } from '../../types/data-hub.js';

export function importMetricsCsv(csv: string): Partial<ComputedMetrics> | null {
    if (!csv || csv.trim().length === 0) return null;

    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    const header = lines[0]!.trim().toLowerCase();
    const expectedHeader = 'metric,value';
    if (header !== expectedHeader) return null;

    const result: Record<string, string | number> = {};

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i]!.split(',');
        if (parts.length < 2) continue;
        const metric = parts[0]!.trim();
        const value = parts[1]!.trim();
        const num = parseFloat(value);
        result[metric] = Number.isFinite(num) ? num : value;
    }

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
    } as Partial<ComputedMetrics>;
}
