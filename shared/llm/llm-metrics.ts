/** Telemetry aggregation for LLM interactions.
 * Tracks request counts, latency, failures, retries, confidence scores, and
 * validation rejections in-memory. `snapshotLlmMetrics()` persists to disk
 * (~/.local/state/qa-tools/llm-metrics.json) for historical analysis.
 * In-memory counters are scoped to the process lifetime. */

import { formatErr } from '../errors.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from '../config-accessor.js';
import { rootLogger } from '../logger.js';
import { safeParseJson } from '../safe-json.js';
import type { LlmTier } from '../types.js';
import { getLlmClientMetrics, resetLlmClientMetrics } from './llm-fallback.js';

/** Snapshot of all LLM telemetry at a point in time. Persisted to disk for
 * cross-session trend analysis (see `getLlmMetricsHistory`). */
export interface LlmMetricsSnapshot {
    timestamp: string;
    totalRequests: number;
    rejectedByValidator: number;
    retryCount: number;
    adversarialRetryCount: number;
    avgConfidence: number;
    avgLatencyMs: number;
    failuresByTier?: Partial<Record<LlmTier, number>>;
    rejectionReasons: Record<string, number>;
    artifactApproved: number;
    artifactRejected: number;
    cacheHits: number;
    cacheMisses: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCostUSD: number;
    costPerTier: Partial<Record<LlmTier, number>>;
    requestsByProvider: Record<string, number>;
    /** Latency stats per model ID (e.g. "gpt-4o", "claude-sonnet-4"). */
    latencyByModel: Record<string, { avgMs: number; count: number }>;
    /** @deprecated Moved to quality-metrics.ts. Kept for backward compat. */
    invariantFires?: Record<string, number>;
    /** @deprecated Moved to quality-metrics.ts. Kept for backward compat. */
    layerPassRates?: { layer1: number; layer2: number; layer3: number };
}

interface StoredMetrics {
    snapshots: LlmMetricsSnapshot[];
}

function storePath(): string {
    const xdg = Config.get('xdgStateHome');
    const base = xdg ? path.join(xdg, 'qa-tools') : path.join(os.homedir(), '.local', 'state', 'qa-tools');
    return path.join(base, 'llm-metrics.json');
}

function loadStore(): StoredMetrics {
    try {
        const p = storePath();
        if (!fs.existsSync(path.resolve(p))) return { snapshots: [] };
        return safeParseJson<StoredMetrics>(fs.readFileSync(path.resolve(p), 'utf8'), { snapshots: [] });
    } catch (err: unknown) {
        rootLogger.warn('Failed to load LLM metrics from disk: ' + formatErr(err));
        return { snapshots: [] };
    }
}

function saveStore(store: StoredMetrics): void {
    try {
        const p = storePath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tmp = p + '.tmp';
        fs.writeFileSync(path.resolve(tmp), JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(path.resolve(tmp), p);
    } catch (err) {
        rootLogger.error('Failed to persist LLM metrics: ' + formatErr(err));
        throw new Error('Failed to persist LLM metrics', { cause: err });
    }
}

export class LlmMetricsCollector {
    private _totalRequests = 0;
    private _rejectedByValidator = 0;
    private _retryCount = 0;
    private _confidenceSum = 0;
    private _confidenceCount = 0;
    private _latencySum = 0;
    private _latencyCount = 0;
    private _artifactApproved = 0;
    private _artifactRejected = 0;
    private _adversarialRetryCount = 0;
    private readonly _failuresByTier = new Map<LlmTier, number>();
    private readonly _rejectionReasons = new Map<string, number>();
    private readonly _modelLatency = new Map<string, { sum: number; count: number }>();

    /** Record that an LLM request was made. modelId is optional — if provided, per-model latency is tracked. */
    recordLlmRequest(_tier: LlmTier, latencyMs: number, modelId?: string): void {
        this._totalRequests++;
        this._latencySum += latencyMs;
        this._latencyCount++;
        this.recordModelLatency(modelId, latencyMs);
    }

    /** Record per-model latency without incrementing total request count.
     * Used by sendToProvider to track individual model performance.
     * modelId may be omitted to skip per-model tracking. */
    recordModelLatency(modelId: string | undefined, latencyMs: number): void {
        if (!modelId) return;
        const existing = this._modelLatency.get(modelId);
        if (existing) {
            existing.sum += latencyMs;
            existing.count++;
        } else {
            this._modelLatency.set(modelId, { sum: latencyMs, count: 1 });
        }
    }

    /** Return average latency in ms for a given model, or 0 if no data. */
    getModelAvgLatency(modelId: string): number {
        const data = this._modelLatency.get(modelId);
        return data && data.count > 0 ? Math.round(data.sum / data.count) : 0;
    }

    /** Return all per-model latency data. */
    getModelLatencyData(): Record<string, { avgMs: number; count: number }> {
        const entries: [string, { avgMs: number; count: number }][] = [];
        for (const [modelId, data] of this._modelLatency.entries()) {
            entries.push([modelId, { avgMs: Math.round(data.sum / data.count), count: data.count }]);
        }
        return Object.fromEntries(entries);
    }

    recordLlmFailure(tier: LlmTier): void {
        this._failuresByTier.set(tier, (this._failuresByTier.get(tier) ?? 0) + 1);
    }

    recordValidationRejection(reason: string): void {
        this._rejectedByValidator++;
        this._rejectionReasons.set(reason, (this._rejectionReasons.get(reason) ?? 0) + 1);
    }

    recordRetry(): void {
        this._retryCount++;
    }

    recordAdversarialRetry(): void {
        this._adversarialRetryCount++;
    }

    recordConfidence(confidence: 'high' | 'medium' | 'low'): void {
        let value: number;
        if (confidence === 'high') {
            value = 1;
        } else if (confidence === 'medium') {
            value = 0.5;
        } else {
            value = 0;
        }
        this._confidenceSum += value;
        this._confidenceCount++;
    }

    recordArtifactApproved(): void {
        this._artifactApproved++;
    }

    recordArtifactRejected(): void {
        this._artifactRejected++;
    }

    /** Take a snapshot of current metrics, persist to disk, and return it. */
    snapshot(): LlmMetricsSnapshot {
        const cm = getLlmClientMetrics();
        const snapshot: LlmMetricsSnapshot = {
            timestamp: new Date().toISOString(),
            totalRequests: this._totalRequests,
            rejectedByValidator: this._rejectedByValidator,
            retryCount: this._retryCount,
            adversarialRetryCount: this._adversarialRetryCount,
            avgConfidence: this._confidenceCount > 0 ? this._confidenceSum / this._confidenceCount : 0,
            avgLatencyMs: this._latencyCount > 0 ? Math.round(this._latencySum / this._latencyCount) : 0,
            failuresByTier: Object.fromEntries(this._failuresByTier),
            rejectionReasons: Object.fromEntries(this._rejectionReasons),
            artifactApproved: this._artifactApproved,
            artifactRejected: this._artifactRejected,
            cacheHits: cm.cacheHits,
            cacheMisses: cm.cacheMisses,
            totalPromptTokens: cm.totalPromptTokens,
            totalCompletionTokens: cm.totalCompletionTokens,
            totalCostUSD: cm.totalCostUSD,
            costPerTier: { ...cm.costPerTier },
            requestsByProvider: { ...cm.requestsByProviderKey },
            latencyByModel: this.getModelLatencyData(),
        };

        const store = loadStore();
        store.snapshots.push(snapshot);
        saveStore(store);

        return snapshot;
    }

    /** Return all persisted snapshots for cross-session trend analysis. */
    getHistory(): LlmMetricsSnapshot[] {
        return loadStore().snapshots;
    }

    /** Reset all in-memory counters and persisted client metrics.
     * Does NOT clear the on-disk snapshot history. */
    clear(): void {
        this._totalRequests = 0;
        this._rejectedByValidator = 0;
        this._retryCount = 0;
        this._adversarialRetryCount = 0;
        this._confidenceSum = 0;
        this._confidenceCount = 0;
        this._latencySum = 0;
        this._latencyCount = 0;
        this._artifactApproved = 0;
        this._artifactRejected = 0;
        for (const key of this._failuresByTier.keys()) this._failuresByTier.delete(key);
        this._rejectionReasons.clear();
        this._modelLatency.clear();
        resetLlmClientMetrics();
    }
}

const _defaultCollector = new LlmMetricsCollector();

export function recordLlmRequest(tier: LlmTier, latencyMs: number, modelId?: string): void {
    _defaultCollector.recordLlmRequest(tier, latencyMs, modelId);
}

/** Record per-model latency without incrementing total request counter.
 * Used for low-level model timing where the request is already counted
 * by a higher-level recordLlmRequest call. */
export function recordModelLatency(modelId: string, latencyMs: number): void {
    _defaultCollector.recordModelLatency(modelId, latencyMs);
}

export function getDefaultMetrics(): LlmMetricsCollector {
    return _defaultCollector;
}

export function recordLlmFailure(tier: LlmTier): void {
    _defaultCollector.recordLlmFailure(tier);
}

export function recordValidationRejection(reason: string): void {
    _defaultCollector.recordValidationRejection(reason);
}

export function recordRetry(): void {
    _defaultCollector.recordRetry();
}

export function recordArtifactApproved(): void {
    _defaultCollector.recordArtifactApproved();
}

export function recordArtifactRejected(): void {
    _defaultCollector.recordArtifactRejected();
}

export function recordAdversarialRetry(): void {
    _defaultCollector.recordAdversarialRetry();
}

export function recordConfidence(confidence: 'high' | 'medium' | 'low'): void {
    _defaultCollector.recordConfidence(confidence);
}

export function snapshotLlmMetrics(): LlmMetricsSnapshot {
    return _defaultCollector.snapshot();
}

export function getLlmMetricsHistory(): LlmMetricsSnapshot[] {
    return _defaultCollector.getHistory();
}

export function clearLlmMetrics(): void {
    _defaultCollector.clear();
}
