/**
 * Integration tests — Quality Metrics (FT-12)
 *
 * Validates the quality metrics collector:
 * - Record invariant fires and compute fire rates
 * - Record layer attempts/passes and compute pass rates
 * - Record artifact types
 * - Record structure scores
 * - Snapshot creation and persistence
 * - Drift detection from baseline snapshots
 * - Clear resets all accumulators
 * - Module-level convenience functions
 *
 * Pure function + in-memory collector — no filesystem for core logic.
 */
import { describe, expect, it } from 'vitest';

describe('Integration: Quality Metrics', () => {
    describe('FT-12a: invariant fire counting', () => {
        it('counts fires per invariant and computes rate', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            collector.recordInvariantFire('A-01');
            collector.recordInvariantFire('A-01');
            collector.recordInvariantFire('A-02');

            // A-01 fired 2/3 times
            expect(collector.invariantFireRate('A-01')).toBeCloseTo(2 / 3);
            expect(collector.invariantFireRate('A-02')).toBeCloseTo(1 / 3);
        });

        it('returns 0 for unknown invariant', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            expect(collector.invariantFireRate('UNKNOWN')).toBe(0);
        });
    });

    describe('FT-12b: layer pass rates', () => {
        it('computes pass rate per layer', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            collector.recordLayerAttempt('layer1');
            collector.recordLayerAttempt('layer1');
            collector.recordLayerPass('layer1');

            expect(collector.layerPassRate('layer1')).toBeCloseTo(0.5);
        });

        it('returns 1 when no attempts', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            expect(collector.layerPassRate('layer1')).toBe(1);
        });
    });

    describe('FT-12c: artifact type counting', () => {
        it('counts artifact types', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            collector.recordArtifactType('test-case');
            collector.recordArtifactType('test-case');
            collector.recordArtifactType('bug-report');

            const snapshot = collector.snapshot();

            expect(snapshot.artifactTypeCounts['test-case']).toBe(2);
            expect(snapshot.artifactTypeCounts['bug-report']).toBe(1);
        });
    });

    describe('FT-12d: snapshot', () => {
        it('creates snapshot with all fields', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            collector.recordInvariantFire('T-01');
            collector.recordLayerAttempt('layer1');
            collector.recordLayerPass('layer1');
            collector.recordArtifactType('test');
            collector.recordStructureScore(85);

            const snapshot = collector.snapshot();

            expect(snapshot.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
            expect(snapshot.invariantFireCount['T-01']).toBe(1);
            expect(snapshot.layerPassRates.layer1).toBe(1);
            expect(snapshot.layerAttempts.layer1).toBe(1);
            expect(snapshot.artifactTypeCounts['test']).toBe(1);
            expect(snapshot.avgStructureScore).toBe(85);
        });
    });

    describe('FT-12e: clear', () => {
        it('resets all accumulators', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();

            collector.recordInvariantFire('A-01');
            collector.recordLayerAttempt('layer1');
            collector.recordArtifactType('test');
            collector.clear();

            expect(collector.invariantFireRate('A-01')).toBe(0);
            expect(collector.layerPassRate('layer1')).toBe(1);
        });
    });

    describe('FT-12f: drift detection', () => {
        it('detects drift when current ratio exceeds 2σ from baseline', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            // Baseline: A-02 ratio = 0.91, 0.89 => mean 0.90, σ 0.01, 2σ upper = 0.92
            const baseline = [
                {
                    invariantFireCount: { 'A-01': 1, 'A-02': 10 },
                    timestamp: '',
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 0, layer2: 0, layer3: 0 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
                {
                    invariantFireCount: { 'A-01': 2, 'A-02': 18 },
                    timestamp: '',
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 0, layer2: 0, layer3: 0 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
            ];

            const collector = new QualityMetricsCollector();
            // Current: A-02 ratio = 0.98 > 0.92 => drift
            for (let i = 0; i < 98; i++) collector.recordInvariantFire('A-02');
            collector.recordInvariantFire('A-01');
            collector.recordInvariantFire('A-01');

            const alerts = collector.detectDrift(baseline);

            expect(alerts).toHaveLength(1);
            expect(alerts[0]).toContain('DRIFT');
            expect(alerts[0]).toContain('"A-02"');
        });

        it('returns empty when baseline too small', async () => {
            expect.hasAssertions();

            const { QualityMetricsCollector } = await import('../../quality-metrics.js');
            const collector = new QualityMetricsCollector();
            collector.recordInvariantFire('A-01');

            const alerts = collector.detectDrift([]);

            expect(alerts).toStrictEqual([]);
        });
    });
});
