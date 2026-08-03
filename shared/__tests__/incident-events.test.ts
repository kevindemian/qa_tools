/**
 * Tests for computeIncidentEvents — DataHub compute module.
 */

import { computeIncidentEvents } from '../data-hub/compute/incident-events.js';
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

describe('ComputeIncidentEvents', () => {
    it('returns no incidents when data is insufficient', () => {
        const result = computeIncidentEvents(makeRaw(), makeComputed({ passRate: 0, runFailureRate: 0 }));

        expect(result.events).toHaveLength(0);
        expect(result.overallSeverity).toBe('none');
    });

    it('returns high severity when failure rate exceeds threshold', () => {
        const result = computeIncidentEvents(makeRaw(), makeComputed({ passRate: 50, runFailureRate: 40 }));

        expect(result.highCount).toBeGreaterThanOrEqual(1);
        expect(result.overallSeverity).toBe('high');
    });

    it('returns high severity when regressions exceed threshold', () => {
        const result = computeIncidentEvents(
            makeRaw(),
            makeComputed({
                passRate: 70,
                runFailureRate: 10,
                regressionDetection: {
                    regressions: [
                        {
                            title: 'r1',
                            meanDuration: 100,
                            currentDuration: 200,
                            stdDev: 10,
                            zScore: 10,
                            severity: 'high',
                            previousDurations: [],
                        },
                        {
                            title: 'r2',
                            meanDuration: 100,
                            currentDuration: 200,
                            stdDev: 10,
                            zScore: 10,
                            severity: 'high',
                            previousDurations: [],
                        },
                        {
                            title: 'r3',
                            meanDuration: 100,
                            currentDuration: 200,
                            stdDev: 10,
                            zScore: 10,
                            severity: 'high',
                            previousDurations: [],
                        },
                    ],
                    totalTests: 100,
                    threshold: 2,
                    timestamp: '2026-07-25T10:00:00Z',
                },
            }),
        );

        expect(result.highCount).toBeGreaterThanOrEqual(1);
    });

    it('sets timestamp', () => {
        const result = computeIncidentEvents(makeRaw(), makeComputed({ passRate: 90 }));

        expect(result.timestamp).toBeTruthy();
        expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
});
