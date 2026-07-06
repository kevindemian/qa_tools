import { describe, it, expect } from 'vitest';
import { exportMetricsCsv } from '../../metrics/csv-exporter.js';
import { importMetricsCsv } from '../../metrics/csv-importer.js';
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

describe('exportMetricsCsv', () => {
    it('R1: exporta como CSV string', () => {
        const csv = exportMetricsCsv(FAKE_METRICS);
        expect(csv).toContain('passRate');
        expect(csv).toContain('85');
    });

    it('R2: CSV tem cabeçalho e ao menos uma linha de dados', () => {
        const csv = exportMetricsCsv(FAKE_METRICS);
        const lines = csv.trim().split('\n');
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines[0]!).toContain('metric');
    });
});

describe('importMetricsCsv', () => {
    it('R3: importa CSV de volta para métricas', () => {
        const csv = exportMetricsCsv(FAKE_METRICS);
        const result = importMetricsCsv(csv);
        expect(result).not.toBeNull();
        expect(result!.passRate).toBe(85);
    });

    it('R4: CSV inválido → retorna null', () => {
        const result = importMetricsCsv('');
        expect(result).toBeNull();
    });

    it('R5: CSV sem cabeçalho esperado → retorna null', () => {
        const result = importMetricsCsv('foo,bar\n1,2');
        expect(result).toBeNull();
    });
});
