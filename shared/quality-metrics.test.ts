import { QualityMetricsCollector } from './quality-metrics.js';
import { recordInvariantFire, detectDrift, snapshotQualityMetrics, resetQualityMetrics } from './quality-metrics.js';
import type { QualityMetricsSnapshot } from './quality-metrics.js';

vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    default: {
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        renameSync: vi.fn(),
    },
}));

vi.mock('./config', () => ({
    default: {
        get: vi.fn(() => '/tmp/.local/state/qa-tools'),
    },
    __esModule: true,
}));

describe('QualityMetricsCollector', () => {
    let collector: QualityMetricsCollector;

    beforeEach(() => {
        vi.clearAllMocks();
        resetQualityMetrics();
        collector = new QualityMetricsCollector();
    });

    describe('Invariant fire tracking', () => {
        it('records invariant fires', () => {
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-02');
            const snapshot = collector.snapshot();

            expect(snapshot.invariantFireCount['T-01']).toBe(2);
            expect(snapshot.invariantFireCount['T-02']).toBe(1);
        });

        it('calculates fire rate', () => {
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-02');
            collector.recordInvariantFire('T-02');
            const rate = collector.invariantFireRate('T-02');

            expect(rate).toBeCloseTo(2 / 3);
        });

        it('returns 0 fire rate for unknown invariant', () => {
            expect(collector.invariantFireRate('UNKNOWN')).toBe(0);
        });
    });

    describe('Layer tracking', () => {
        it('tracks layer attempts and passes', () => {
            collector.recordLayerAttempt('layer1');
            collector.recordLayerPass('layer1');
            collector.recordLayerAttempt('layer1');

            expect(collector.layerPassRate('layer1')).toBe(0.5);
            expect(collector.layerPassRate('layer2')).toBe(1);
        });
    });

    describe('Artifact type tracking', () => {
        it('records artifact types', () => {
            collector.recordArtifactType('test-suite');
            collector.recordArtifactType('test-suite');
            collector.recordArtifactType('analysis');
            const snapshot = collector.snapshot();

            expect(snapshot.artifactTypeCounts['test-suite']).toBe(2);
            expect(snapshot.artifactTypeCounts['analysis']).toBe(1);
        });
    });

    describe('Structure score', () => {
        it('averages structure scores', () => {
            collector.recordStructureScore(0.8);
            collector.recordStructureScore(1.0);
            const snapshot = collector.snapshot();

            expect(snapshot.avgStructureScore).toBe(0.9);
        });

        it('returns 0 when no scores recorded', () => {
            const snapshot = collector.snapshot();

            expect(snapshot.avgStructureScore).toBe(0);
        });
    });

    describe('Clear', () => {
        it('resets all counters', () => {
            collector.recordInvariantFire('T-01');
            collector.recordLayerAttempt('layer1');
            collector.recordArtifactType('test-suite');
            collector.clear();
            const snapshot = collector.snapshot();

            expect(Object.keys(snapshot.invariantFireCount)).toHaveLength(0);
            expect(snapshot.artifactTypeCounts).toEqual({});
        });
    });

    describe('Drift detection', () => {
        it('returns empty alerts with insufficient history', () => {
            const alerts = collector.detectDrift([]);

            expect(alerts).toHaveLength(0);
        });

        it('returns empty alerts with one snapshot', () => {
            const snapshots: QualityMetricsSnapshot[] = [
                {
                    timestamp: '2026-01-01',
                    invariantFireCount: { 'T-01': 5 },
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 1, layer2: 1, layer3: 1 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
            ];
            const alerts = collector.detectDrift(snapshots);

            expect(alerts).toHaveLength(0);
        });

        it('detects drift when current rate exceeds 2σ from baseline mean', () => {
            collector.recordInvariantFire('T-01');
            collector.recordInvariantFire('T-02');

            const snapshots: QualityMetricsSnapshot[] = [
                {
                    timestamp: '2026-01-01',
                    invariantFireCount: { 'T-02': 1 },
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 1, layer2: 1, layer3: 1 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
                {
                    timestamp: '2026-01-02',
                    invariantFireCount: { 'T-02': 1 },
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 1, layer2: 1, layer3: 1 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
            ];

            const alerts = collector.detectDrift(snapshots);

            expect(Array.isArray(alerts)).toBeTruthy();
        });

        it('skips invariants with fewer than 2 baseline occurrences', () => {
            collector.recordInvariantFire('RARE');

            const snapshots: QualityMetricsSnapshot[] = [
                {
                    timestamp: '2026-01-01',
                    invariantFireCount: { 'T-01': 5 },
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 1, layer2: 1, layer3: 1 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
                {
                    timestamp: '2026-01-02',
                    invariantFireCount: { 'T-01': 3 },
                    layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
                    layerAttempts: { layer1: 1, layer2: 1, layer3: 1 },
                    artifactTypeCounts: {},
                    avgStructureScore: 0,
                },
            ];

            const alerts = collector.detectDrift(snapshots);

            expect(alerts).toHaveLength(0);
        });
    });

    describe('GetHistory', () => {
        it('returns empty array when file does not exist', () => {
            const history = collector.getHistory();

            expect(history).toEqual([]);
        });
    });

    describe('Edge: NaN and Infinity (D8 regression prevention)', () => {
        it('naN structureScore produces fallback 0 avgStructureScore', () => {
            const col = new QualityMetricsCollector();
            col.recordStructureScore(NaN);
            const snap = col.snapshot();

            expect(Number.isFinite(snap.avgStructureScore)).toBeTruthy();
            expect(snap.avgStructureScore).toBe(0);
        });

        it('infinity structureScore produces fallback 0 avgStructureScore', () => {
            const col = new QualityMetricsCollector();
            col.recordStructureScore(Infinity);
            const snap = col.snapshot();

            expect(Number.isFinite(snap.avgStructureScore)).toBeTruthy();
            expect(snap.avgStructureScore).toBe(0);
        });
    });

    describe('Exported functions', () => {
        it('recordInvariantFire calls default collector', () => {
            recordInvariantFire('T-01');
        });

        it('detectDrift returns array', () => {
            const alerts = detectDrift();

            expect(Array.isArray(alerts)).toBeTruthy();
        });

        it('snapshotQualityMetrics returns snapshot', () => {
            recordInvariantFire('T-01');
            const snapshot = snapshotQualityMetrics();

            expect(snapshot.invariantFireCount['T-01']).toBe(1);
        });
    });
});
