/**
 * Tests for computeTraceabilityTree — DataHub compute module.
 */

import { computeTraceabilityTree } from '../data-hub/compute/traceability-tree.js';
import type { RawData, ComputedMetrics } from '../types/data-hub.js';
import { createTestHub } from './test-hub.js';

function makeRaw(overrides?: Partial<RawData>): RawData {
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
        ...overrides,
    };
}

function makeComputed(overrides?: Partial<ComputedMetrics>): ComputedMetrics {
    return {
        ...createTestHub().computed,
        ...overrides,
    };
}

describe('ComputeTraceabilityTree', () => {
    it('returns empty result when no metricsRuns', () => {
        const result = computeTraceabilityTree(makeRaw(), makeComputed({ metricsRuns: [] }));

        expect(result.nodes).toHaveLength(0);
        expect(result.totalEpics).toBe(0);
        expect(result.totalTests).toBe(0);
    });

    it('sets timestamp', () => {
        const result = computeTraceabilityTree(makeRaw(), makeComputed({ metricsRuns: [] }));

        expect(result.timestamp).toBeTruthy();
        expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('returns TraceabilityResult shape', () => {
        const result = computeTraceabilityTree(makeRaw(), makeComputed({ metricsRuns: [] }));

        expect(result).toHaveProperty('nodes');
        expect(result).toHaveProperty('totalEpics');
        expect(result).toHaveProperty('totalTests');
        expect(result).toHaveProperty('overallCoverage');
        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('awareness');
    });
});
