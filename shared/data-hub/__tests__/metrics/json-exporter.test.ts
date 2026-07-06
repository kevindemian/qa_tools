import { describe, it, expect } from 'vitest';
import { exportMetricsJson, importMetricsJson } from '../../metrics/json-exporter.js';
import type { ComputedMetrics } from '../../../types/data-hub.js';

const FAKE_METRICS: ComputedMetrics = {
    passRate: 85,
    avgDuration: 120,
    suiteSpeedP95: 500,
    flakyRate: [],
    coverage: 72,
    pipelineCost: { totalMinutes: 100, estimatedCost: 0.8 },
    defectTrends: [{ date: '2026-01-01', passRate: 85, count: 10 }],
    branchBreakdown: { main: { passRate: 90, count: 10 } },
    topFailingJobs: [{ name: 'test', failureRate: 50, count: 2 }],
    topFailureReasons: [{ pattern: 'timeout', count: 5 }],
    releaseScore: {
        score: 85,
        grade: 'B',
        dimensions: {
            passRate: { score: 90, status: 'pass' },
            flakyRate: { score: 100, status: 'pass' },
            coverage: { score: 72, status: 'fail' },
            suiteSpeed: { score: 80, status: 'pass' },
            executionRate: { score: 90, status: 'pass' },
        },
    },
    quarantineStatus: { flakyCount: 0, quarantinedCount: 0 },
};

describe('ExportMetricsJson', () => {
    it('r1: exporta ComputedMetrics como JSON string', () => {
        const json = exportMetricsJson(FAKE_METRICS);
        const parsed = JSON.parse(json) as ComputedMetrics;

        expect(parsed.passRate).toBe(85);
        expect(parsed.pipelineCost.totalMinutes).toBe(100);
    });

    it('r2: JSON resultante tem schema compatível', () => {
        const json = exportMetricsJson(FAKE_METRICS);
        const parsed = JSON.parse(json) as ComputedMetrics;

        expect(parsed).toHaveProperty('passRate');
        expect(parsed).toHaveProperty('avgDuration');
        expect(parsed).toHaveProperty('coverage');
        expect(parsed).toHaveProperty('pipelineCost');
        expect(parsed).toHaveProperty('releaseScore');
    });
});

describe('ImportMetricsJson', () => {
    it('r3: importa JSON string de volta para ComputedMetrics', () => {
        const json = JSON.stringify(FAKE_METRICS);
        const result = importMetricsJson(json);

        expect(result).not.toBeNull();

        const r = result as ComputedMetrics;

        expect(r.passRate).toBe(85);
    });

    it('r4: JSON inválido → retorna null', () => {
        const result = importMetricsJson('not valid json');

        expect(result).toBeNull();
    });

    it('r5: JSON sem campos obrigatórios → retorna null', () => {
        const result = importMetricsJson('{"passRate":85}');

        expect(result).toBeNull();
    });
});
