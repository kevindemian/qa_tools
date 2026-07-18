/** Tri-state circuit breaker for LLM provider resilience.
 * CLOSED → normal operation. OPEN → failures exceeded threshold, reject immediately.
 * HALF_OPEN → cooldown elapsed, allow one probe request before deciding.
 * Tracks per-provider via a config key string. */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitEntry {
    failures: number;
    breakUntil: number;
    lastProbeAt: number;
}

const store = new Map<string, CircuitEntry>();

/** Consecutive failures before tripping the breaker. */
export const CIRCUIT_BREAK_THRESHOLD = 5;
/** Duration (ms) the breaker stays OPEN before transitioning to HALF_OPEN. */
export const CIRCUIT_BREAK_MS = 30000;
/** Minimum interval (ms) between probe requests in HALF_OPEN state. */
export const HALF_OPEN_PROBE_INTERVAL_MS = 15000;

function entry(cfgKey: string): CircuitEntry {
    let e = store.get(cfgKey);
    if (!e) {
        e = { failures: 0, breakUntil: 0, lastProbeAt: 0 };
        store.set(cfgKey, e);
    }
    return e;
}

/** Read the current circuit state for a provider config key. Never throws. */
export function getCircuitState(cfgKey: string): CircuitState {
    const e = entry(cfgKey);
    if (e.failures < CIRCUIT_BREAK_THRESHOLD) return 'CLOSED';
    if (Date.now() < e.breakUntil) return 'OPEN';
    return 'HALF_OPEN';
}

/** Check circuit state and throw if requests should be blocked (OPEN or probe-constrained HALF_OPEN).
 * Updates the probe timestamp when a HALF_OPEN check passes. */
export function checkCircuitBreaker(cfgKey: string): void {
    const state = getCircuitState(cfgKey);
    if (state === 'OPEN') {
        const e = entry(cfgKey);
        throw new Error(
            'Circuit breaker open for provider (retry after ' + Math.ceil((e.breakUntil - Date.now()) / 1000) + 's)',
        );
    }
    if (state === 'HALF_OPEN') {
        const e = entry(cfgKey);
        const elapsed = Date.now() - e.lastProbeAt;
        if (elapsed < HALF_OPEN_PROBE_INTERVAL_MS) {
            throw new Error(
                'Circuit breaker half-open, probe in ' +
                    Math.ceil((HALF_OPEN_PROBE_INTERVAL_MS - elapsed) / 1000) +
                    's',
            );
        }
        e.lastProbeAt = Date.now();
    }
}

/** Record a failure for the provider key. Trips the breaker if threshold is reached. */
export function recordCircuitFailure(cfgKey: string): void {
    const e = entry(cfgKey);
    e.failures++;
    if (e.failures >= CIRCUIT_BREAK_THRESHOLD) {
        e.breakUntil = Date.now() + CIRCUIT_BREAK_MS;
    }
}

/** Record a success for the provider key. Resets the breaker to CLOSED. */
export function recordCircuitSuccess(cfgKey: string): void {
    const e = entry(cfgKey);
    e.failures = 0;
    e.breakUntil = 0;
    e.lastProbeAt = 0;
}

/** Clear all circuit state. Used in tests and when provider configuration changes. */
export function resetCircuitState(): void {
    store.clear();
}
