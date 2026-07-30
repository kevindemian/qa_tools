/**
 * Integration tests — Traceability Tree Compute Module (R1.3)
 *
 * Validates computeTraceabilityTree end-to-end with hub data.
 */
import { describe, expect, it } from 'vitest';
import { computeTraceabilityTree } from '../../data-hub/compute/traceability-tree.js';
import { createTestHub } from '../test-hub.js';
import type { RawData, ComputedMetrics } from '../../types/data-hub.js';

function makeHub(overrides?: { raw?: Partial<RawData>; computed?: Partial<ComputedMetrics> }) {
    const hub = createTestHub({
        raw: {
            xray: { requirementCoverage: [], testRuns: [], testExecutions: [] },
            pmIssues: [],
        },
        ...overrides,
    });
    if (overrides?.raw) {
        Object.assign(hub.raw, overrides.raw);
    }
    return hub;
}

describe('ComputeTraceabilityTree — integration', () => {
    it('produces valid TraceabilityResult shape from hub data', () => {
        const hub = makeHub({ computed: { metricsRuns: [] } });
        const result = computeTraceabilityTree(hub.raw, hub.computed);

        expect(result).toHaveProperty('nodes');
        expect(result).toHaveProperty('totalEpics');
        expect(result).toHaveProperty('totalTests');
        expect(result).toHaveProperty('overallCoverage');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('awareness');
    });

    it('returns empty nodes when no metricsRuns', () => {
        const hub = makeHub({ computed: { metricsRuns: [] } });
        const result = computeTraceabilityTree(hub.raw, hub.computed);

        expect(result.nodes).toHaveLength(0);
        expect(result.totalEpics).toBe(0);
    });

    it('produces timestamp in ISO format', () => {
        const hub = makeHub({ computed: { metricsRuns: [] } });
        const result = computeTraceabilityTree(hub.raw, hub.computed);

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});
