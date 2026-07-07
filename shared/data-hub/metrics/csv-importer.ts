import type { ComputedMetrics } from '../../types/data-hub.js';

function safeNumber(value: string | number | undefined, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function safeString(value: string | number | undefined, fallback: string): string {
    return String(value ?? fallback);
}

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
        'testPassRate',
        'testCounts.passed',
        'testCounts.failed',
        'testCounts.skipped',
        'testCounts.total',
        'framework',
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
        passRate: safeNumber(result['passRate'], 0),
        avgDuration: safeNumber(result['avgDuration'], 0),
        suiteSpeedP95: safeNumber(result['suiteSpeedP95'], 0),
        coverage: safeNumber(result['coverage'], 0),
        pipelineCost: {
            totalMinutes: safeNumber(result['pipelineCost.totalMinutes'], 0),
            estimatedCost: safeNumber(result['pipelineCost.estimatedCost'], 0),
        },
        releaseScore: {
            score: safeNumber(result['releaseScore.score'], 0),
            grade: safeString(result['releaseScore.grade'], 'F'),
            dimensions: {
                passRate: { score: 0, status: 'fail' },
                flakyRate: { score: 0, status: 'fail' },
                coverage: { score: 0, status: 'fail' },
                suiteSpeed: { score: 0, status: 'fail' },
                executionRate: { score: 0, status: 'fail' },
            },
        },
        quarantineStatus: {
            flakyCount: safeNumber(result['quarantineStatus.flakyCount'], 0),
            quarantinedCount: safeNumber(result['quarantineStatus.quarantinedCount'], 0),
        },
        testPassRate: safeNumber(result['testPassRate'], 0),
        testCounts: {
            passed: safeNumber(result['testCounts.passed'], 0),
            failed: safeNumber(result['testCounts.failed'], 0),
            skipped: safeNumber(result['testCounts.skipped'], 0),
            total: safeNumber(result['testCounts.total'], 0),
        },
        framework: safeString(result['framework'], 'unknown'),
    } satisfies Partial<ComputedMetrics>;
}
