/**
 * Property-Based Tests — Quality Metrics (FT-12)
 *
 * Dimensão 5 — Métricas:
 * - invariantFireRate: sum = 1, cada rate em [0,1]
 * - layerPassRate: em [0,1], default = 1 sem attempts
 * - snapshot: avgStructureScore consistente
 * - clear: reset total
 * - detectDrift: <2 snapshots = [], drift detectado quando ratio > 2σ
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { QualityMetricsCollector } from '../quality-metrics.js';
import type { QualityMetricsSnapshot } from '../quality-metrics.js';

/* ── Helpers ─────────────────────────────────────────────────── */

function invariantArb(): fc.Arbitrary<string> {
    return fc.constantFrom('INV-01', 'INV-02', 'INV-03', 'INV-04', 'INV-05');
}

function layerArb(): fc.Arbitrary<'layer1' | 'layer2' | 'layer3'> {
    return fc.constantFrom('layer1' as const, 'layer2' as const, 'layer3' as const);
}

function snapshotBase(): QualityMetricsSnapshot {
    return {
        timestamp: '2026-01-01T00:00:00.000Z',
        invariantFireCount: {},
        layerPassRates: { layer1: 1, layer2: 1, layer3: 1 },
        layerAttempts: { layer1: 0, layer2: 0, layer3: 0 },
        artifactTypeCounts: {},
        avgStructureScore: 0,
    };
}

/* ── Tests ───────────────────────────────────────────────────── */

describe('QualityMetricsCollector — property-based', () => {
    it('invariantFireRate: sum of all rates = 1 (or 0 when none)', () => {
        fc.assert(
            fc.property(fc.array(fc.record({ id: invariantArb() }), { minLength: 0, maxLength: 50 }), (fires) => {
                const collector = new QualityMetricsCollector();
                for (const f of fires) collector.recordInvariantFire(f.id);

                const ids = [...new Set(fires.map((f) => f.id))];
                const totalRate = ids.reduce((sum, id) => sum + collector.invariantFireRate(id), 0);

                if (fires.length === 0) {
                    expect(totalRate).toBe(0);
                } else {
                    expect(totalRate).toBeCloseTo(1, 5);
                }
            }),
            { numRuns: 100 },
        );
    });

    it('invariantFireRate: each rate in [0, 1]', () => {
        fc.assert(
            fc.property(fc.array(invariantArb(), { minLength: 0, maxLength: 50 }), (fires) => {
                const collector = new QualityMetricsCollector();
                for (const id of fires) collector.recordInvariantFire(id);

                const ids = [...new Set(fires)];
                for (const id of ids) {
                    const rate = collector.invariantFireRate(id);

                    expect(rate).toBeGreaterThanOrEqual(0);
                    expect(rate).toBeLessThanOrEqual(1);
                }

                // Unknown invariant → 0
                expect(collector.invariantFireRate('UNKNOWN')).toBe(0);
            }),
            { numRuns: 100 },
        );
    });

    it('layerPassRate: em [0, 1], default 1 sem attempts', () => {
        fc.assert(
            fc.property(
                fc.array(layerArb(), { minLength: 0, maxLength: 30 }),
                fc.array(layerArb(), { minLength: 0, maxLength: 30 }),
                (attempts, passes) => {
                    const collector = new QualityMetricsCollector();
                    for (const l of attempts) collector.recordLayerAttempt(l);
                    for (const l of passes) collector.recordLayerPass(l);

                    for (const layer of ['layer1', 'layer2', 'layer3'] as const) {
                        const rate = collector.layerPassRate(layer);

                        expect(rate).toBeGreaterThanOrEqual(0);
                        expect(rate).toBeLessThanOrEqual(1);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it('snapshot: avgStructureScore consistente', () => {
        fc.assert(
            fc.property(
                fc.array(fc.float({ min: 0, max: 100, noNaN: true }), { minLength: 0, maxLength: 20 }),
                (scores) => {
                    const collector = new QualityMetricsCollector();
                    for (const s of scores) collector.recordStructureScore(s);
                    const snapshot = collector.snapshot();

                    if (scores.length === 0) {
                        expect(snapshot.avgStructureScore).toBe(0);
                    } else {
                        const expected = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;

                        expect(snapshot.avgStructureScore).toBe(expected);
                    }
                },
            ),
            { numRuns: 30 },
        );
    });

    it('clear: reseta todos os acumuladores', () => {
        fc.assert(
            fc.property(
                fc.array(invariantArb(), { minLength: 1, maxLength: 20 }),
                fc.array(layerArb(), { minLength: 1, maxLength: 10 }),
                (invariants, layers) => {
                    const collector = new QualityMetricsCollector();
                    for (const id of invariants) collector.recordInvariantFire(id);
                    for (const l of layers) collector.recordLayerAttempt(l);
                    collector.recordStructureScore(50);

                    collector.clear();

                    for (const id of [...new Set(invariants)]) {
                        expect(collector.invariantFireRate(id)).toBe(0);
                    }

                    expect(collector.layerPassRate('layer1')).toBe(1);
                    expect(collector.layerPassRate('layer2')).toBe(1);
                    expect(collector.layerPassRate('layer3')).toBe(1);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('detectDrift: < 2 snapshots → []', () => {
        fc.assert(
            fc.property(fc.array(invariantArb(), { minLength: 0, maxLength: 10 }), (fires) => {
                const collector = new QualityMetricsCollector();
                for (const id of fires) collector.recordInvariantFire(id);

                expect(collector.detectDrift([])).toEqual([]);
                expect(collector.detectDrift([snapshotBase()])).toEqual([]);
            }),
            { numRuns: 50 },
        );
    });

    it('detectDrift: invariante sem baseline suficiente é ignorado', () => {
        fc.assert(
            fc.property(
                fc.array(invariantArb(), { minLength: 1, maxLength: 5 }),
                fc.array(invariantArb(), { minLength: 1, maxLength: 5 }),
                (baselineInvariants, currentInvariants) => {
                    const collector = new QualityMetricsCollector();
                    for (const id of currentInvariants) collector.recordInvariantFire(id);

                    const snapshots: QualityMetricsSnapshot[] = [
                        {
                            ...snapshotBase(),
                            invariantFireCount: Object.fromEntries(baselineInvariants.map((id) => [id, 1])),
                        },
                    ];

                    // Only 1 snapshot → should be empty
                    const alerts = collector.detectDrift(snapshots);

                    expect(alerts).toEqual([]);
                },
            ),
            { numRuns: 50 },
        );
    });

    it('detectDrift: drift detectado quando ratio atual > 2σ', () => {
        fc.assert(
            fc.property(fc.integer({ min: 40, max: 49 }), fc.integer({ min: 60, max: 70 }), (lowCount, highCount) => {
                const targetId = 'TARGET';
                const otherId = 'OTHER';
                const total = 100;

                const snapshots: QualityMetricsSnapshot[] = [
                    {
                        ...snapshotBase(),
                        invariantFireCount: {
                            [targetId]: lowCount,
                            [otherId]: total - lowCount,
                        },
                    },
                    {
                        ...snapshotBase(),
                        invariantFireCount: {
                            [targetId]: highCount,
                            [otherId]: total - highCount,
                        },
                    },
                ];

                const collector = new QualityMetricsCollector();
                for (let i = 0; i < 99; i++) collector.recordInvariantFire(targetId);
                collector.recordInvariantFire(otherId);

                const alerts = collector.detectDrift(snapshots);

                expect(alerts.length).toBeGreaterThanOrEqual(1);
            }),
            { numRuns: 50 },
        );
    });
});
