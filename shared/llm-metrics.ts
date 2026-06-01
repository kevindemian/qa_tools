/** Telemetry aggregation for LLM interactions.
 * Tracks request counts, latency, failures, retries, confidence scores, and
 * validation rejections in-memory. `snapshotLlmMetrics()` persists to disk
 * (~/.local/state/qa-tools/llm-metrics.json) for historical analysis.
 * In-memory counters are scoped to the process lifetime. */

import fs from 'fs';
import path from 'path';
import os from 'os';
import Config from './config';
import { rootLogger } from './logger';
import { safeParseJson } from './safe-json';
import type { LlmTier } from './types';
import { getLlmClientMetrics, resetLlmClientMetrics } from './llm-client';

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
    failuresByTier: Partial<Record<LlmTier, number>>;
    rejectionReasons: Record<string, number>;
    artifactApproved: number;
    artifactRejected: number;
    cacheHits: number;
    cacheMisses: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    requestsByProvider: Record<string, number>;
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
        if (!fs.existsSync(p)) return { snapshots: [] };
        return safeParseJson<StoredMetrics>(fs.readFileSync(p, 'utf8'), { snapshots: [] });
    } catch (err: unknown) {
        rootLogger.warn('Failed to load LLM metrics from disk: ' + (err as Error).message);
        return { snapshots: [] };
    }
}

function saveStore(store: StoredMetrics): void {
    try {
        const p = storePath();
        fs.mkdirSync(path.dirname(p), { recursive: true });
        const tmp = p + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
        fs.renameSync(tmp, p);
    } catch (err) {
        rootLogger.error('Failed to persist LLM metrics: ' + (err as Error).message);
        const persistError = new Error('Failed to persist LLM metrics');
        (persistError as unknown as { cause: unknown }).cause = err;
        throw persistError;
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
    private readonly _failuresByTier: Partial<Record<LlmTier, number>> = {};
    private readonly _rejectionReasons: Record<string, number> = {};

    recordLlmRequest(_tier: LlmTier, latencyMs: number): void {
        this._totalRequests++;
        this._latencySum += latencyMs;
        this._latencyCount++;
    }

    recordLlmFailure(tier: LlmTier): void {
        this._failuresByTier[tier] = (this._failuresByTier[tier] || 0) + 1;
    }

    recordValidationRejection(reason: string): void {
        this._rejectedByValidator++;
        this._rejectionReasons[reason] = (this._rejectionReasons[reason] || 0) + 1;
    }

    recordRetry(): void {
        this._retryCount++;
    }

    recordAdversarialRetry(): void {
        this._adversarialRetryCount++;
    }

    recordConfidence(confidence: 'high' | 'medium' | 'low'): void {
        const value = confidence === 'high' ? 1 : confidence === 'medium' ? 0.5 : 0;
        this._confidenceSum += value;
        this._confidenceCount++;
    }

    recordArtifactReview(approved: boolean): void {
        if (approved) this._artifactApproved++;
        else this._artifactRejected++;
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
            failuresByTier: { ...this._failuresByTier },
            rejectionReasons: { ...this._rejectionReasons },
            artifactApproved: this._artifactApproved,
            artifactRejected: this._artifactRejected,
            cacheHits: cm.cacheHits,
            cacheMisses: cm.cacheMisses,
            totalPromptTokens: cm.totalPromptTokens,
            totalCompletionTokens: cm.totalCompletionTokens,
            requestsByProvider: { ...cm.requestsByProviderKey },
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
        for (const key of Object.keys(this._failuresByTier)) delete this._failuresByTier[key as LlmTier];
        for (const key of Object.keys(this._rejectionReasons)) delete this._rejectionReasons[key];
        resetLlmClientMetrics();
    }
}

const _defaultCollector = new LlmMetricsCollector();

export function recordLlmRequest(tier: LlmTier, latencyMs: number): void {
    _defaultCollector.recordLlmRequest(tier, latencyMs);
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

export function recordArtifactReview(approved: boolean): void {
    _defaultCollector.recordArtifactReview(approved);
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
