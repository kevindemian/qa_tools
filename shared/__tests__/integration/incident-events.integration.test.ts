/**
 * Integration tests — Incident Events Compute Module (R1.2)
 *
 * Validates computeIncidentEvents end-to-end with hub data.
 */
import { describe, expect, it } from 'vitest';
import { computeIncidentEvents } from '../../data-hub/compute/incident-events.js';
import { createTestHub } from '../test-hub.js';
import type { RawData, ComputedMetrics } from '../../types/data-hub.js';

function makeHub(overrides?: { raw?: Partial<RawData>; computed?: Partial<ComputedMetrics> }) {
    const hub = createTestHub(overrides?.computed);
    if (overrides?.raw) {
        Object.assign(hub.raw, overrides.raw);
    }
    return hub;
}

describe('ComputeIncidentEvents — integration', () => {
    it('produces valid IncidentReport shape from hub data', () => {
        const hub = makeHub({ computed: { passRate: 90, runFailureRate: 5 } });
        const result = computeIncidentEvents(hub.raw, hub.computed);

        expect(result).toHaveProperty('events');
        expect(result).toHaveProperty('eventCount');
        expect(result).toHaveProperty('highCount');
        expect(result).toHaveProperty('mediumCount');
        expect(result).toHaveProperty('lowCount');
        expect(result).toHaveProperty('summary');
        expect(result).toHaveProperty('overallSeverity');
        expect(result).toHaveProperty('timestamp');
    });

    it('returns no incidents when metrics are healthy', () => {
        const hub = makeHub({ computed: { passRate: 98, runFailureRate: 2 } });
        const result = computeIncidentEvents(hub.raw, hub.computed);

        expect(result.events).toHaveLength(0);
        expect(result.overallSeverity).toBe('none');
    });

    it('detects high severity from elevated failure rate', () => {
        const hub = makeHub({ computed: { passRate: 40, runFailureRate: 50 } });
        const result = computeIncidentEvents(hub.raw, hub.computed);

        expect(result.highCount).toBeGreaterThanOrEqual(1);
    });

    it('produces timestamp in ISO format', () => {
        const hub = makeHub({ computed: { passRate: 90 } });
        const result = computeIncidentEvents(hub.raw, hub.computed);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
