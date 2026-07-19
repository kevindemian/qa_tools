/**
 * Quality metrics monitoring — artifact-level tracking.
 *
 * Metrics:
 *   - perInvariantFireCount: how many times each invariant failed
 *   - perLayerPassRate: % pass by layer (layer1 / layer2 / layer3)
 *   - perArtifactTypeCount: generation count by type
 *   - drift alerts: if avg confidence drops >2σ from baseline
 *
 * Persistence is handled by DataHub. Callers should use
 * hub.saveQualityMetrics(snapshot) and hub.loadQualityMetricsHistory()
 * directly.
 */

import type { QualityMetricsSnapshot } from '../types/data-hub.js';

/** Re-export for backward compatibility. */
export type { QualityMetricsSnapshot } from '../types/data-hub.js';

/**
 * Dimension 5 Provenance — documents the source and justification for drift detection threshold.
 * @reference ISO 3534-2 (Statistical process control — 2-sigma rule)
 */
export const DRIFT_DETECTION_PROVENANCE = {
    sigmaThreshold: {
        value: 2,
        source: 'Statistical process control (2-sigma rule)',
        standard: 'ISO 3534-2',
    },
} as const;

type Layer = 'layer1' | 'layer2' | 'layer3';

const MAX_PASS_RATE = 1;
const DRIFT_SIGMA_MULTIPLIER = 2;

export class QualityMetricsCollector {
    private readonly _invariantFireCount = new Map<string, number>();
    private _layerAttempts = { layer1: 0, layer2: 0, layer3: 0 };
    private _layerPasses = { layer1: 0, layer2: 0, layer3: 0 };
    private readonly _artifactTypeCounts = new Map<string, number>();
    private _structureScoreSum = 0;
    private _structureScoreCount = 0;

    recordInvariantFire(invariantId: string): void {
        this._invariantFireCount.set(invariantId, (this._invariantFireCount.get(invariantId) ?? 0) + 1);
    }

    recordLayerAttempt(layer: Layer): void {
        switch (layer) {
            case 'layer1':
                this._layerAttempts.layer1++;
                break;
            case 'layer2':
                this._layerAttempts.layer2++;
                break;
            case 'layer3':
                this._layerAttempts.layer3++;
                break;
        }
    }

    recordLayerPass(layer: Layer): void {
        switch (layer) {
            case 'layer1':
                this._layerPasses.layer1++;
                break;
            case 'layer2':
                this._layerPasses.layer2++;
                break;
            case 'layer3':
                this._layerPasses.layer3++;
                break;
        }
    }

    recordArtifactType(type: string): void {
        this._artifactTypeCounts.set(type, (this._artifactTypeCounts.get(type) ?? 0) + 1);
    }

    recordStructureScore(score: number): void {
        this._structureScoreSum += score;
        this._structureScoreCount++;
    }

    invariantFireRate(invariantId: string): number {
        const total = Array.from(this._invariantFireCount.values()).reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        return (this._invariantFireCount.get(invariantId) ?? 0) / total;
    }

    layerPassRate(layer: Layer): number {
        let attempts: number;
        let passes: number;
        switch (layer) {
            case 'layer1':
                attempts = this._layerAttempts.layer1;
                passes = this._layerPasses.layer1;
                break;
            case 'layer2':
                attempts = this._layerAttempts.layer2;
                passes = this._layerPasses.layer2;
                break;
            case 'layer3':
                attempts = this._layerAttempts.layer3;
                passes = this._layerPasses.layer3;
                break;
        }
        if (attempts === 0) return 1;
        return Math.min(passes / attempts, MAX_PASS_RATE);
    }

    /**
     * Detect drift: if any invariant's fire rate is >2σ from baseline.
     *
     * @param baselineSnapshots - Historical snapshots for baseline calculation.
     * @returns Array of drift alert messages.
     */
    detectDrift(baselineSnapshots: QualityMetricsSnapshot[]): string[] {
        if (baselineSnapshots.length < 2) return [];

        const alerts: string[] = [];

        for (const [invariantId, currentRate] of this._invariantFireCount.entries()) {
            const baselineTotals = baselineSnapshots.map((s) =>
                Object.values(s.invariantFireCount).reduce((a, b) => a + b, 0),
            );
            const ratios = baselineSnapshots
                .map((s, i) => {
                    const total =
                        i < baselineTotals.length ? ((Reflect.get(baselineTotals, i) as number | undefined) ?? 0) : 0;
                    const entries = Object.entries(s.invariantFireCount);
                    const entry = entries.find(([k]) => k === invariantId);
                    const rate = entry?.[1] ?? 0;
                    return total > 0 ? rate / total : 0;
                })
                .filter((r) => r > 0);

            if (ratios.length < 2) continue;

            const totalCurrent = Array.from(this._invariantFireCount.values()).reduce((a, b) => a + b, 0);
            const currentRatio = totalCurrent > 0 ? currentRate / totalCurrent : 0;

            const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            const variance = ratios.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratios.length;
            const stdDev = Math.sqrt(variance);

            // A baseline determinística (stdDev = 0) NÃO deve suprimir drift: um desvio
            // real de currentRatio em relação a mean deve alertar (§24 boundary guard).
            // Sem esta guarda, baseline estável + pico em produção passaria despercebido.
            const DRIFT_MIN_DEVIATION = 1e-6;
            const exceedsBaseline = currentRatio > mean + DRIFT_SIGMA_MULTIPLIER * stdDev;
            const deviatesFromMean = Math.abs(currentRatio - mean) > DRIFT_MIN_DEVIATION;
            if (exceedsBaseline && deviatesFromMean) {
                const firstBaselinePct = ratios[0] !== undefined ? (ratios[0] * 100).toFixed(1) : 'N/A';
                alerts.push(
                    'DRIFT: invariant "' +
                        invariantId +
                        '" fire rate ' +
                        (currentRatio * 100).toFixed(1) +
                        '% exceeds baseline (' +
                        firstBaselinePct +
                        '% +/- ' +
                        (stdDev * 100).toFixed(1) +
                        '%)',
                );
            }
        }

        return alerts;
    }

    /**
     * Create a snapshot of current metrics.
     * Persistence is handled by DataHub — callers should use
     * hub.saveQualityMetrics(snapshot) directly.
     *
     * @returns The created snapshot.
     */
    snapshot(): QualityMetricsSnapshot {
        return {
            timestamp: new Date().toISOString(),
            invariantFireCount: Object.fromEntries(this._invariantFireCount),
            layerPassRates: {
                layer1: this.layerPassRate('layer1'),
                layer2: this.layerPassRate('layer2'),
                layer3: this.layerPassRate('layer3'),
            },
            layerAttempts: { ...this._layerAttempts },
            artifactTypeCounts: Object.fromEntries(this._artifactTypeCounts),
            avgStructureScore:
                this._structureScoreCount > 0 && Number.isFinite(this._structureScoreSum)
                    ? Math.round((this._structureScoreSum / this._structureScoreCount) * 100) / 100
                    : 0,
        };
    }

    /**
     * Get all historical snapshots.
     * Persistence is handled by DataHub — callers should use
     * hub.loadQualityMetricsHistory() directly.
     *
     * @returns Empty array (historical data lives in DataHub).
     */
    getHistory(): QualityMetricsSnapshot[] {
        return [];
    }

    clear(): void {
        this._invariantFireCount.clear();
        this._layerAttempts = { layer1: 0, layer2: 0, layer3: 0 };
        this._layerPasses = { layer1: 0, layer2: 0, layer3: 0 };
        this._artifactTypeCounts.clear();
        this._structureScoreSum = 0;
        this._structureScoreCount = 0;
    }
}

const _defaultCollector = new QualityMetricsCollector();

/**
 * Record an invariant fire event.
 *
 * @param invariantId - The invariant that fired.
 */
export function recordInvariantFire(invariantId: string): void {
    _defaultCollector.recordInvariantFire(invariantId);
}

/**
 * Record a layer attempt.
 *
 * @param layer - The layer that was attempted.
 */
export function recordLayerAttempt(layer: 'layer1' | 'layer2' | 'layer3'): void {
    _defaultCollector.recordLayerAttempt(layer);
}

/**
 * Record a layer pass.
 *
 * @param layer - The layer that passed.
 */
export function recordLayerPass(layer: 'layer1' | 'layer2' | 'layer3'): void {
    _defaultCollector.recordLayerPass(layer);
}

/**
 * Record an artifact type.
 *
 * @param type - The artifact type.
 */
export function recordArtifactType(type: string): void {
    _defaultCollector.recordArtifactType(type);
}

/**
 * Create a snapshot of current quality metrics.
 * Uses configured persistence if available.
 *
 * @returns The created snapshot.
 */
export function snapshotQualityMetrics(): QualityMetricsSnapshot {
    return _defaultCollector.snapshot();
}

/**
 * Detect drift in invariant fire rates.
 *
 * @returns Array of drift alert messages.
 */
export function detectDrift(): string[] {
    const history = _defaultCollector.getHistory();
    return _defaultCollector.detectDrift(history);
}

/**
 * Reset the default collector state.
 */
export function resetQualityMetrics(): void {
    _defaultCollector.clear();
}
