import type { DataHub, ComputedMetrics } from '../types/data-hub.js';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';

/**
 * Reusable DataHub test double. Defaults to a healthy-ish hub; override
 * any ComputedMetrics field via `overrides`. Persistence methods are mocks.
 */
export function createTestHub(overrides: Partial<ComputedMetrics> = {}): DataHub {
    return makeDataHubMock({
        computed: {
            passRate: 50,
            avgDuration: 1000,
            suiteSpeedP95: 500,
            coverage: 42,
            testPassRate: 50,
            testCounts: { passed: 50, failed: 50, skipped: 0, total: 100 },
            framework: 'vitest',
            ...overrides,
        },
    });
}
