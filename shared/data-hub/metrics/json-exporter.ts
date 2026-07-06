import type { ComputedMetrics } from '../../types/data-hub.js';

const REQUIRED_TOP_KEYS = ['passRate', 'avgDuration', 'coverage', 'pipelineCost', 'releaseScore'] as const;

function validateMetricsShape(data: unknown): data is ComputedMetrics {
    if (!data || typeof data !== 'object') return false;
    const obj = data as { [key: string]: unknown };
    for (const key of REQUIRED_TOP_KEYS) {
        if (!(key in obj)) return false;
    }
    return true;
}

export function exportMetricsJson(metrics: ComputedMetrics): string {
    return JSON.stringify(metrics, null, 2);
}

export function importMetricsJson(json: string): ComputedMetrics | null {
    try {
        const parsed = JSON.parse(json);
        if (!validateMetricsShape(parsed)) return null;
        return parsed as ComputedMetrics;
    } catch {
        return null;
    }
}
