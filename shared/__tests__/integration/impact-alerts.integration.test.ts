/**
 * Integration tests — Impact Alerts Compute Module (R1.1)
 *
 * Validates computeImpactAlerts end-to-end with hub data.
 */
import { describe, expect, it } from 'vitest';
import { computeImpactAlerts } from '../../data-hub/compute/impact-alerts.js';
import { createTestHub } from '../test-hub.js';
import type { RawData, ComputedMetrics } from '../../types/data-hub.js';

function makeHub(overrides?: { raw?: Partial<RawData>; computed?: Partial<ComputedMetrics> }) {
    const hub = createTestHub(overrides?.computed);
    if (overrides?.raw) {
        Object.assign(hub.raw, overrides.raw);
    }
    return hub;
}

describe('ComputeImpactAlerts — integration', () => {
    it('produces valid ImpactAlertResult shape from hub data', () => {
        const hub = makeHub({
            computed: { passRate: 85, coverage: 90, topFailingJobs: [] },
        });
        const result = computeImpactAlerts(hub.raw, hub.computed);

        expect(result).toHaveProperty('alerts');
        expect(result).toHaveProperty('criticalCount');
        expect(result).toHaveProperty('warningCount');
        expect(result).toHaveProperty('infoCount');
        expect(result).toHaveProperty('timestamp');
        expect(Array.isArray(result.alerts)).toBeTruthy();
    });

    it('returns all-clear when pipeline health is good', () => {
        const hub = makeHub({
            computed: { passRate: 98, coverage: 95, topFailingJobs: [] },
        });
        const result = computeImpactAlerts(hub.raw, hub.computed);

        expect(result.criticalCount).toBe(0);
        expect(result.alerts.some((a) => a.severity === 'info')).toBeTruthy();
    });

    it('returns critical alerts when both metrics are poor', () => {
        const hub = makeHub({
            computed: {
                passRate: 40,
                coverage: 35,
                topFailingJobs: [
                    { name: 'integration-tests', failureRate: 60, count: 12 },
                    { name: 'unit-tests', failureRate: 45, count: 8 },
                ],
            },
        });
        const result = computeImpactAlerts(hub.raw, hub.computed);

        expect(result.criticalCount).toBeGreaterThanOrEqual(1);
    });

    it('produces timestamp in ISO format', () => {
        const hub = makeHub({ computed: { passRate: 90, coverage: 85 } });
        const result = computeImpactAlerts(hub.raw, hub.computed);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
