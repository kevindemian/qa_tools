/** Central quality-signal detection engine.
 *
 *   - Drift detection (via quality-metrics.ts)
 *   - High latency / high failure rate (via llm-metrics.ts)
 *   - Benchmark regression (called from llm-benchmark.ts, SW-15)
 *
 * Outputs QualitySignal[] and persists to _llmConfigSuggestions in state. */
import { rootLogger } from '../logger.js';
import { detectDrift } from './quality-metrics.js';
import { snapshotLlmMetrics } from '../llm/llm-metrics.js';
import { updateTyped } from '../state.js';

export interface QualitySignal {
    severity: 'info' | 'warning' | 'critical';
    source: string;
    message: string;
    suggestedAction: string;
}

const LATENCY_WARNING_MS = 3000;
const LATENCY_CRITICAL_MS = 8000;
const FAILURE_RATE_WARNING = 0.15;
const FAILURE_RATE_CRITICAL = 0.35;

export function severityFromLatency(avgMs: number): QualitySignal['severity'] {
    if (avgMs >= LATENCY_CRITICAL_MS) return 'critical';
    if (avgMs >= LATENCY_WARNING_MS) return 'warning';
    return 'info';
}

export function failureRate(failures: number, total: number): number {
    if (total <= 0 || !Number.isFinite(failures) || failures < 0 || !Number.isFinite(total)) return 0;
    return Math.min(failures / total, 1);
}

/** Run the full quality-signal pipeline and persist results to state.
 *
 *  1. Run detectDrift() — invariant drift alerts
 *  2. Snapshot LLM metrics — check average latency, failure rate per tier
 *  3. Benchmark regression (optional) — passed externally from llm-benchmark
 *
 * Returns the generated signals. */
function analyzeSnapshotMetrics(snapshot: ReturnType<typeof snapshotLlmMetrics>, signals: QualitySignal[]): void {
    const totalRequests = snapshot.totalRequests;
    if (totalRequests === 0) return;

    if (snapshot.avgLatencyMs > LATENCY_WARNING_MS) {
        signals.push({
            severity: severityFromLatency(snapshot.avgLatencyMs),
            source: 'llm-metrics',
            message: `Latência média ${snapshot.avgLatencyMs.toFixed(0)}ms acima do limiar de alerta.`,
            suggestedAction: 'Considere trocar para um modelo mais rápido ou verificar a conectividade com o provedor.',
        });
    }

    const totalFailures = Object.values(snapshot.failuresByTier ?? {}).reduce((a, b) => a + b, 0);
    const rate = failureRate(totalFailures, totalRequests);
    if (rate > FAILURE_RATE_WARNING) {
        signals.push({
            severity: rate > FAILURE_RATE_CRITICAL ? 'critical' : 'warning',
            source: 'llm-metrics',
            message: `Taxa de falha ${(rate * 100).toFixed(1)}% (${totalFailures}/${totalRequests}) acima do limiar de alerta.`,
            suggestedAction: 'Verifique a chave de API, o status do provedor ou alterne para um provedor alternativo.',
        });
    }
}

export function checkQualitySignals(benchmarkSignals?: QualitySignal[]): QualitySignal[] {
    const signals: QualitySignal[] = [];

    let driftAlerts: string[];
    try {
        driftAlerts = detectDrift();
    } catch (err) {
        rootLogger.warn('quality-suggester: detectDrift failed', String(err));
        driftAlerts = [];
    }
    for (const alert of driftAlerts) {
        signals.push({
            severity: 'warning',
            source: 'quality-metrics',
            message: alert,
            suggestedAction: 'Revise alterações recentes que podem ter introduzido regressão na qualidade.',
        });
    }

    let snapshot: ReturnType<typeof snapshotLlmMetrics> | null = null;
    try {
        snapshot = snapshotLlmMetrics();
    } catch (err) {
        rootLogger.warn('quality-suggester: snapshotLlmMetrics failed', String(err));
    }
    if (snapshot) {
        analyzeSnapshotMetrics(snapshot, signals);
    }

    if (benchmarkSignals) {
        signals.push(...benchmarkSignals);
    }

    try {
        updateTyped((s) => {
            s._llmConfigSuggestions = {
                pending: signals.length > 0,
                qualitySignals: signals,
                timestamp: new Date().toISOString(),
            };
        });
    } catch (err) {
        rootLogger.warn('quality-suggester: updateTyped failed', String(err));
    }

    return signals;
}
