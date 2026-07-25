/**
 * Integration tests — Cross-Squad Compute Module (R1.4)
 *
 * Validates computeCrossSquad end-to-end with hub data.
 */
import { describe, expect, it } from 'vitest';
import { computeCrossSquad } from '../../data-hub/compute/cross-squad.js';
import { createTestHub } from '../test-hub.js';
import type { RawData, ComputedMetrics } from '../../types/data-hub.js';

function makeHub(overrides?: { raw?: Partial<RawData>; computed?: Partial<ComputedMetrics> }) {
    const hub = createTestHub(overrides?.computed);
    if (overrides?.raw) {
        Object.assign(hub.raw, overrides.raw);
    }
    return hub;
}

describe('ComputeCrossSquad — integration', () => {
    it('produces valid CrossSquadResult shape from hub data', () => {
        const hub = makeHub();
        const result = computeCrossSquad(hub.raw, hub.computed);

        expect(result).toHaveProperty('benchmarks');
        expect(result).toHaveProperty('topSquad');
        expect(result).toHaveProperty('bottomSquad');
        expect(result).toHaveProperty('averageScore');
        expect(result).toHaveProperty('stdDev');
        expect(result).toHaveProperty('timestamp');
    });

    it('returns empty benchmarks when no squad data', () => {
        const hub = makeHub();
        const result = computeCrossSquad(hub.raw, hub.computed);

        expect(result.benchmarks).toHaveLength(0);
    });

    it('produces timestamp in ISO format', () => {
        const hub = makeHub();
        const result = computeCrossSquad(hub.raw, hub.computed);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
