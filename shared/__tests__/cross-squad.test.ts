/**
 * Tests for computeCrossSquad — DataHub compute module.
 */

import { computeCrossSquad } from '../data-hub/compute/cross-squad.js';
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

describe('ComputeCrossSquad', () => {
    it('returns empty result when no squad data available', () => {
        const result = computeCrossSquad(makeRaw(), makeComputed());

        expect(result.benchmarks).toHaveLength(0);
        expect(result.topSquad).toBe('');
        expect(result.bottomSquad).toBe('');
    });

    it('returns CrossSquadResult shape', () => {
        const result = computeCrossSquad(makeRaw(), makeComputed());

        expect(result).toHaveProperty('benchmarks');
        expect(result).toHaveProperty('topSquad');
        expect(result).toHaveProperty('bottomSquad');
        expect(result).toHaveProperty('averageScore');
        expect(result).toHaveProperty('stdDev');
        expect(result).toHaveProperty('timestamp');
    });

    it('sets timestamp', () => {
        const result = computeCrossSquad(makeRaw(), makeComputed());

        expect(result.timestamp).toBeTruthy();
        expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
});
