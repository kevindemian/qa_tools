export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitEntry {
    failures: number;
    breakUntil: number;
    lastProbeAt: number;
}

const store = new Map<string, CircuitEntry>();

export const CIRCUIT_BREAK_THRESHOLD = 5;
export const CIRCUIT_BREAK_MS = 30000;
export const HALF_OPEN_PROBE_INTERVAL_MS = 15000;

function entry(cfgKey: string): CircuitEntry {
    let e = store.get(cfgKey);
    if (!e) {
        e = { failures: 0, breakUntil: 0, lastProbeAt: 0 };
        store.set(cfgKey, e);
    }
    return e;
}

export function getCircuitState(cfgKey: string): CircuitState {
    const e = entry(cfgKey);
    if (e.failures < CIRCUIT_BREAK_THRESHOLD) return 'CLOSED';
    if (Date.now() < e.breakUntil) return 'OPEN';
    return 'HALF_OPEN';
}

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

export function recordCircuitFailure(cfgKey: string): void {
    const e = entry(cfgKey);
    e.failures++;
    if (e.failures >= CIRCUIT_BREAK_THRESHOLD) {
        e.breakUntil = Date.now() + CIRCUIT_BREAK_MS;
    }
}

export function recordCircuitSuccess(cfgKey: string): void {
    const e = entry(cfgKey);
    e.failures = 0;
    e.breakUntil = 0;
    e.lastProbeAt = 0;
}

export function resetCircuitState(): void {
    store.clear();
}
