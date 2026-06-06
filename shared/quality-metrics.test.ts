import { QualityMetricsCollector } from './quality-metrics.js';

describe('QualityMetricsCollector', () => {
    let collector: QualityMetricsCollector;

    beforeEach(() => {
        collector = new QualityMetricsCollector();
    });

    describe('invariant fire tracking', () => {
        it('records invariant fires', async () => {
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-02');
            const snapshot = collector.snapshot();
            expect(snapshot.invariantFireCount['T-01']).toBe(2);
            expect(snapshot.invariantFireCount['T-02']).toBe(1);
        });

        it('calculates fire rate', async () => {
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-02');
            collector.recordInvariantFire('T-02');
            const rate = collector.invariantFireRate('T-02');
            expect(rate).toBeCloseTo(2 / 3);
        });

        it('returns 0 fire rate for unknown invariant', async () => {
            expect(collector.invariantFireRate('UNKNOWN')).toBe(0);
        });
    });

    describe('layer tracking', () => {
        it('tracks layer attempts and passes', async () => {
            collector.recordLayerAttempt('layer1');
            collector.recordLayerPass('layer1');
            collector.recordLayerAttempt('layer1');

            expect(collector.layerPassRate('layer1')).toBe(0.5);
            expect(collector.layerPassRate('layer2')).toBe(1);
        });
    });

    describe('artifact type tracking', () => {
        it('records artifact types', async () => {
            collector.recordArtifactType('test-suite');
            collector.recordArtifactType('test-suite');
            collector.recordArtifactType('analysis');
            const snapshot = collector.snapshot();
            expect(snapshot.artifactTypeCounts['test-suite']).toBe(2);
            expect(snapshot.artifactTypeCounts['analysis']).toBe(1);
        });
    });

    describe('structure score', () => {
        it('averages structure scores', async () => {
            collector.recordStructureScore(0.8);
            collector.recordStructureScore(1.0);
            const snapshot = collector.snapshot();
            expect(snapshot.avgStructureScore).toBe(0.9);
        });

        it('returns 0 when no scores recorded', async () => {
            const snapshot = collector.snapshot();
            expect(snapshot.avgStructureScore).toBe(0);
        });
    });

    describe('clear', () => {
        it('resets all counters', async () => {
            collector.recordInvariantFire('T-01');
            collector.recordLayerAttempt('layer1');
            collector.recordArtifactType('test-suite');
            collector.clear();
            const snapshot = collector.snapshot();
            expect(Object.keys(snapshot.invariantFireCount)).toHaveLength(0);
            expect(snapshot.artifactTypeCounts).toEqual({});
        });
    });

    describe('drift detection', () => {
        it('returns empty alerts with insufficient history', async () => {
            const alerts = collector.detectDrift([]);
            expect(alerts).toHaveLength(0);
        });
    });
});
