/**
 * Quality metrics monitoring — extends llm-metrics.ts with artifact-level
 * tracking: invariant fire rates, layer pass rates, drift detection.
 *
 * Metrics:
 *   - perInvariantFireCount: how many times each invariant failed
 *   - perLayerPassRate: % pass by layer (layer1 / layer2 / layer3)
 *   - perArtifactTypeCount: generation count by type
 *   - drift alerts: if avg confidence drops >2σ from baseline
 *
 * Persisted via the existing llm-metrics.json mechanism.
 */

import { rootLogger } from './logger.js';
import { safeParseJson } from './safe-json.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config.js';

const MAX_PASS_RATE = 1;
const DRIFT_SIGMA_MULTIPLIER = 2;

export interface QualityMetricsSnapshot {
    timestamp: string;
    invariantFireCount: Record<string, number>;
    layerPassRates: {
        layer1: number;
        layer2: number;
        layer3: number;
    };
    layerAttempts: {
        layer1: number;
        layer2: number;
        layer3: number;
    };
    artifactTypeCounts: Record<string, number>;
    avgStructureScore: number;
}

interface StoredQualityMetrics {
    snapshots: QualityMetricsSnapshot[];
}

function storePath(): string {
    const xdg = Config.get('xdgStateHome');
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
    return path.join(base, 'quality-metrics.json');
}

function loadStore(): StoredQualityMetrics {
    try {
        const p = storePath();
        if (!fs.existsSync(p)) return { snapshots: [] };
        return safeParseJson<StoredQualityMetrics>(fs.readFileSync(p, 'utf8'), { snapshots: [] });
    } catch (err) {
        rootLogger.warn(
            'Failed to load quality metrics: ' +
                (err instanceof Error ? err.message : String(err)) +
                '. Starting with empty state.',
        );
        return { snapshots: [] };
    }
}

function saveStore(store: StoredQualityMetrics): void {
    try {
        const p = storePath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tmp = p + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(tmp, p);
    } catch (err) {
        rootLogger.error(
            'Failed to persist quality metrics: ' +
                (err instanceof Error ? err.message : String(err)) +
                '. Check disk space and permissions for the state directory.',
        );
    }
}

export class QualityMetricsCollector {
    private readonly _invariantFireCount: Record<string, number> = {};
    private _layerAttempts = { layer1: 0, layer2: 0, layer3: 0 };
    private _layerPasses = { layer1: 0, layer2: 0, layer3: 0 };
    private readonly _artifactTypeCounts: Record<string, number> = {};
    private _structureScoreSum = 0;
    private _structureScoreCount = 0;

    recordInvariantFire(invariantId: string): void {
        this._invariantFireCount[invariantId] = (this._invariantFireCount[invariantId] || 0) + 1;
    }

    recordLayerAttempt(layer: 'layer1' | 'layer2' | 'layer3'): void {
        this._layerAttempts[layer]++;
    }

    recordLayerPass(layer: 'layer1' | 'layer2' | 'layer3'): void {
        this._layerPasses[layer]++;
    }

    recordArtifactType(type: string): void {
        this._artifactTypeCounts[type] = (this._artifactTypeCounts[type] || 0) + 1;
    }

    recordStructureScore(score: number): void {
        this._structureScoreSum += score;
        this._structureScoreCount++;
    }

    invariantFireRate(invariantId: string): number {
        const total = Object.values(this._invariantFireCount).reduce((a, b) => a + b, 0);
        if (total === 0) return 0;
        return (this._invariantFireCount[invariantId] || 0) / total;
    }

    layerPassRate(layer: 'layer1' | 'layer2' | 'layer3'): number {
        const attempts = this._layerAttempts[layer];
        if (attempts === 0) return 1;
        return Math.min(this._layerPasses[layer] / attempts, MAX_PASS_RATE);
    }

    /** Detect drift: if any invariant's fire rate is >2σ from baseline. */
    detectDrift(baselineSnapshots: QualityMetricsSnapshot[]): string[] {
        if (baselineSnapshots.length < 2) return [];

        const alerts: string[] = [];

        for (const [invariantId, currentRate] of Object.entries(this._invariantFireCount)) {
            const baselineTotals = baselineSnapshots.map((s) =>
                Object.values(s.invariantFireCount).reduce((a, b) => a + b, 0),
            );
            const ratios = baselineSnapshots
                .map((s, i) => {
                    const total = baselineTotals[i] ?? 0;
                    const rate = s.invariantFireCount[invariantId] ?? 0;
                    return total > 0 ? rate / total : 0;
                })
                .filter((r) => r > 0);

            if (ratios.length < 2) continue;

            const totalCurrent = Object.values(this._invariantFireCount).reduce((a, b) => a + b, 0);
            const currentRatio = totalCurrent > 0 ? currentRate / totalCurrent : 0;

            const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
            const variance = ratios.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ratios.length;
            const stdDev = Math.sqrt(variance);

            if (stdDev > 0 && currentRatio > mean + DRIFT_SIGMA_MULTIPLIER * stdDev) {
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

    snapshot(): QualityMetricsSnapshot {
        const snapshot: QualityMetricsSnapshot = {
            timestamp: new Date().toISOString(),
            invariantFireCount: { ...this._invariantFireCount },
            layerPassRates: {
                layer1: this.layerPassRate('layer1'),
                layer2: this.layerPassRate('layer2'),
                layer3: this.layerPassRate('layer3'),
            },
            layerAttempts: { ...this._layerAttempts },
            artifactTypeCounts: { ...this._artifactTypeCounts },
            avgStructureScore:
                this._structureScoreCount > 0 && Number.isFinite(this._structureScoreSum)
                    ? Math.round((this._structureScoreSum / this._structureScoreCount) * 100) / 100
                    : 0,
        };

        const store = loadStore();
        store.snapshots.push(snapshot);
        saveStore(store);

        return snapshot;
    }

    getHistory(): QualityMetricsSnapshot[] {
        return loadStore().snapshots;
    }

    clear(): void {
        for (const key of Object.keys(this._invariantFireCount)) delete this._invariantFireCount[key];
        this._layerAttempts = { layer1: 0, layer2: 0, layer3: 0 };
        this._layerPasses = { layer1: 0, layer2: 0, layer3: 0 };
        for (const key of Object.keys(this._artifactTypeCounts)) delete this._artifactTypeCounts[key];
        this._structureScoreSum = 0;
        this._structureScoreCount = 0;
    }
}

const _defaultCollector = new QualityMetricsCollector();

export function recordInvariantFire(invariantId: string): void {
    _defaultCollector.recordInvariantFire(invariantId);
}

export function recordLayerAttempt(layer: 'layer1' | 'layer2' | 'layer3'): void {
    _defaultCollector.recordLayerAttempt(layer);
}

export function recordLayerPass(layer: 'layer1' | 'layer2' | 'layer3'): void {
    _defaultCollector.recordLayerPass(layer);
}

export function recordArtifactType(type: string): void {
    _defaultCollector.recordArtifactType(type);
}

export function snapshotQualityMetrics(): QualityMetricsSnapshot {
    return _defaultCollector.snapshot();
}

export function detectDrift(): string[] {
    const history = _defaultCollector.getHistory();
    return _defaultCollector.detectDrift(history);
}

export function resetQualityMetrics(): void {
    _defaultCollector.clear();
}
