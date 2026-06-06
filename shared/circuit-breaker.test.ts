import {
    checkCircuitBreaker,
    recordCircuitFailure,
    recordCircuitSuccess,
    resetCircuitState,
    getCircuitState,
    CIRCUIT_BREAK_THRESHOLD,
    CIRCUIT_BREAK_MS,
    HALF_OPEN_PROBE_INTERVAL_MS,
} from './circuit-breaker.js';

const CFG_KEY = 'test-provider';

beforeEach(() => {
    resetCircuitState();
});

describe('CircuitBreaker', () => {
    it('starts CLOSED for any provider', async () => {
        expect(getCircuitState(CFG_KEY)).toBe('CLOSED');
    });

    it('opens after threshold failures', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        expect(getCircuitState(CFG_KEY)).toBe('OPEN');
    });

    it('blocks requests when OPEN', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        expect(() => checkCircuitBreaker(CFG_KEY)).toThrow('Circuit breaker open');
    });

    it('enters HALF_OPEN after cooldown expires', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        // Simulate cooldown expiry
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + CIRCUIT_BREAK_MS + 1000);
        expect(getCircuitState(CFG_KEY)).toBe('HALF_OPEN');
        vi.useRealTimers();
    });

    it('allows probe in HALF_OPEN and transitions to CLOSED on success', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + CIRCUIT_BREAK_MS + 1000);
        // First call should allow probe (no recent probe)
        expect(() => checkCircuitBreaker(CFG_KEY)).not.toThrow();
        recordCircuitSuccess(CFG_KEY);
        expect(getCircuitState(CFG_KEY)).toBe('CLOSED');
        vi.useRealTimers();
    });

    it('rejects second probe within interval', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + CIRCUIT_BREAK_MS + 1000);
        checkCircuitBreaker(CFG_KEY); // first probe allowed
        expect(() => checkCircuitBreaker(CFG_KEY)).toThrow('half-open');
        vi.useRealTimers();
    });

    it('opens again when probe fails', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + CIRCUIT_BREAK_MS + 1000);
        checkCircuitBreaker(CFG_KEY); // probe allowed
        recordCircuitFailure(CFG_KEY); // probe fails
        expect(getCircuitState(CFG_KEY)).toBe('OPEN');
        vi.useRealTimers();
    });

    it('allows second probe after interval passes', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + CIRCUIT_BREAK_MS + 1000);
        checkCircuitBreaker(CFG_KEY); // first probe
        vi.setSystemTime(Date.now() + HALF_OPEN_PROBE_INTERVAL_MS + 1000);
        expect(() => checkCircuitBreaker(CFG_KEY)).not.toThrow(); // second probe
        vi.useRealTimers();
    });

    it('resets to CLOSED after success', async () => {
        recordCircuitFailure(CFG_KEY);
        recordCircuitSuccess(CFG_KEY);
        expect(getCircuitState(CFG_KEY)).toBe('CLOSED');
    });

    it('remains CLOSED below threshold', async () => {
        for (let i = 0; i < CIRCUIT_BREAK_THRESHOLD - 1; i++) {
            recordCircuitFailure(CFG_KEY);
        }
        expect(getCircuitState(CFG_KEY)).toBe('CLOSED');
    });
});
