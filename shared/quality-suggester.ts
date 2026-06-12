/** Central quality-signal detection engine.
 *
 *   - Drift detection (via quality-metrics.ts)
 *   - High latency / high failure rate (via llm-metrics.ts)
 *   - Benchmark regression (called from llm-benchmark.ts, SW-15)
 *
 * Outputs QualitySignal[] and persists to _llmConfigSuggestions in state. */
import { detectDrift } from './quality-metrics.js';
import { snapshotLlmMetrics } from './llm-metrics.js';
import { updateTyped } from './state.js';

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

function severityFromLatency(avgMs: number): QualitySignal['severity'] {
    if (avgMs >= LATENCY_CRITICAL_MS) return 'critical';
    if (avgMs >= LATENCY_WARNING_MS) return 'warning';
    return 'info';
}

function failureRate(failures: number, total: number): number {
    return total > 0 ? failures / total : 0;
}

/** Run the full quality-signal pipeline and persist results to state.
 *
 *  1. Run detectDrift() — invariant drift alerts
 *  2. Snapshot LLM metrics — check average latency, failure rate per tier
 *  3. Benchmark regression (optional) — passed externally from llm-benchmark
 *
 * Returns the generated signals. */
export function checkQualitySignals(benchmarkSignals?: QualitySignal[]): QualitySignal[] {
    const signals: QualitySignal[] = [];

    // 1. Drift detection
    const driftAlerts = detectDrift();
    for (const alert of driftAlerts) {
        signals.push({
            severity: 'warning',
            source: 'quality-metrics',
            message: alert,
            suggestedAction: 'Revise alterações recentes que podem ter introduzido regressão na qualidade.',
        });
    }

    // 2. LLM metrics analysis
    const snapshot = snapshotLlmMetrics();
    const totalRequests = snapshot.totalRequests || 0;

    if (totalRequests > 0) {
        // Average latency check
        if (snapshot.avgLatencyMs > LATENCY_WARNING_MS) {
            signals.push({
                severity: severityFromLatency(snapshot.avgLatencyMs),
                source: 'llm-metrics',
                message: `Latência média ${snapshot.avgLatencyMs.toFixed(0)}ms acima do limiar de alerta.`,
                suggestedAction:
                    'Considere trocar para um modelo mais rápido ou verificar a conectividade com o provedor.',
            });
        }

        // Per-tier failure rate
        const totalFailures = Object.values(snapshot.failuresByTier).reduce((a, b) => a + b, 0);
        const rate = failureRate(totalFailures, totalRequests);
        if (rate > FAILURE_RATE_WARNING) {
            signals.push({
                severity: rate > FAILURE_RATE_CRITICAL ? 'critical' : 'warning',
                source: 'llm-metrics',
                message: `Taxa de falha ${(rate * 100).toFixed(1)}% (${totalFailures}/${totalRequests}) acima do limiar de alerta.`,
                suggestedAction:
                    'Verifique a chave de API, o status do provedor ou alterne para um provedor alternativo.',
            });
        }
    }

    // 3. Benchmark signals (passed externally)
    if (benchmarkSignals) {
        signals.push(...benchmarkSignals);
    }

    // Persist to state
    updateTyped((s) => {
        s._llmConfigSuggestions = {
            pending: signals.length > 0,
            qualitySignals: signals,
            timestamp: new Date().toISOString(),
        };
    });

    return signals;
}
