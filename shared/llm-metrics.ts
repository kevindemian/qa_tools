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
    const xdg = Config.xdgStateHome;
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

let _totalRequests = 0;
let _rejectedByValidator = 0;
let _retryCount = 0;
let _confidenceSum = 0;
let _confidenceCount = 0;
let _latencySum = 0;
let _latencyCount = 0;
let _artifactApproved = 0;
let _artifactRejected = 0;
const _failuresByTier: Partial<Record<LlmTier, number>> = {};
const _rejectionReasons: Record<string, number> = {};

/** Record a successful LLM request (count + latency). */
export function recordLlmRequest(_tier: LlmTier, latencyMs: number): void {
    _totalRequests++;
    _latencySum += latencyMs;
    _latencyCount++;
}

/** Record a failed LLM request, grouped by tier. */
export function recordLlmFailure(tier: LlmTier): void {
    _failuresByTier[tier] = (_failuresByTier[tier] || 0) + 1;
}

/** Record a schema validation rejection with the reason string. */
export function recordValidationRejection(reason: string): void {
    _rejectedByValidator++;
    _rejectionReasons[reason] = (_rejectionReasons[reason] || 0) + 1;
}

let _adversarialRetryCount = 0;

/** Record a standard retry (non-adversarial). */
export function recordRetry(): void {
    _retryCount++;
}

/** Record an adversarial retry (LLM self-critique loop). */
export function recordAdversarialRetry(): void {
    _adversarialRetryCount++;
}

/** Record a confidence rating from the adversarial review pipeline. */
export function recordConfidence(confidence: 'high' | 'medium' | 'low'): void {
    const value = confidence === 'high' ? 1 : confidence === 'medium' ? 0.5 : 0;
    _confidenceSum += value;
    _confidenceCount++;
}

/** Record whether an artifact review was approved or rejected. */
export function recordArtifactReview(approved: boolean): void {
    if (approved) _artifactApproved++;
    else _artifactRejected++;
}

/** Take a snapshot of current metrics, persist to disk, and return it.
 * Includes both in-memory counters and client-level metrics (cache, tokens). */
export function snapshotLlmMetrics(): LlmMetricsSnapshot {
    const cm = getLlmClientMetrics();
    const snapshot: LlmMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        totalRequests: _totalRequests,
        rejectedByValidator: _rejectedByValidator,
        retryCount: _retryCount,
        adversarialRetryCount: _adversarialRetryCount,
        avgConfidence: _confidenceCount > 0 ? _confidenceSum / _confidenceCount : 0,
        avgLatencyMs: _latencyCount > 0 ? Math.round(_latencySum / _latencyCount) : 0,
        failuresByTier: { ..._failuresByTier },
        rejectionReasons: { ..._rejectionReasons },
        artifactApproved: _artifactApproved,
        artifactRejected: _artifactRejected,
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
export function getLlmMetricsHistory(): LlmMetricsSnapshot[] {
    return loadStore().snapshots;
}

/** Reset all in-memory counters and persisted client metrics.
 * Does NOT clear the on-disk snapshot history. */
export function clearLlmMetrics(): void {
    _totalRequests = 0;
    _rejectedByValidator = 0;
    _retryCount = 0;
    _adversarialRetryCount = 0;
    _confidenceSum = 0;
    _confidenceCount = 0;
    _latencySum = 0;
    _latencyCount = 0;
    _artifactApproved = 0;
    _artifactRejected = 0;
    for (const key of Object.keys(_failuresByTier)) delete _failuresByTier[key as LlmTier];
    for (const key of Object.keys(_rejectionReasons)) delete _rejectionReasons[key];
    resetLlmClientMetrics();
}
