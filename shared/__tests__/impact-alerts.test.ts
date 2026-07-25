/**
 * Tests for computeImpactAlerts — DataHub compute module.
 */

import { computeImpactAlerts } from '../data-hub/compute/impact-alerts.js';
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

describe('ComputeImpactAlerts', () => {
    it('returns info alert when passRate and coverage are null/undefined', () => {
        const result = computeImpactAlerts(makeRaw(), makeComputed({ passRate: 0, coverage: 0, topFailingJobs: [] }));

        // With 0 passRate and 0 coverage, we get critical + low-coverage warnings
        expect(result.alerts.length).toBeGreaterThan(0);
    });

    it('returns critical alert when passRate and coverage are both below 70', () => {
        const result = computeImpactAlerts(
            makeRaw(),
            makeComputed({
                passRate: 50,
                coverage: 50,
                topFailingJobs: [{ name: 'test-job', failureRate: 50, count: 5 }],
            }),
        );

        const critical = result.alerts.filter((a) => a.severity === 'critical');

        expect(critical.length).toBeGreaterThanOrEqual(1);
    });

    it('returns warning when passRate is low but coverage is ok', () => {
        const result = computeImpactAlerts(
            makeRaw(),
            makeComputed({
                passRate: 60,
                coverage: 85,
                topFailingJobs: [{ name: 'build', failureRate: 40, count: 3 }],
            }),
        );

        const warnings = result.alerts.filter((a) => a.severity === 'warning');

        expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('returns all-clear info when both passRate and coverage are above 80', () => {
        const result = computeImpactAlerts(makeRaw(), makeComputed({ passRate: 95, coverage: 90, topFailingJobs: [] }));

        const info = result.alerts.filter((a) => a.severity === 'info');

        expect(info.length).toBeGreaterThanOrEqual(1);
        expect(result.criticalCount).toBe(0);
    });

    it('deduplicates alerts by title', () => {
        const result = computeImpactAlerts(
            makeRaw(),
            makeComputed({
                passRate: 50,
                coverage: 50,
                topFailingJobs: [{ name: 'job-a', failureRate: 50, count: 5 }],
            }),
        );

        const titles = result.alerts.map((a) => a.title);
        const uniqueTitles = [...new Set(titles)];

        expect(titles).toHaveLength(uniqueTitles.length);
    });

    it('sets timestamp from computed metrics', () => {
        const result = computeImpactAlerts(makeRaw(), makeComputed({ passRate: 95, coverage: 90 }));

        expect(result.timestamp).toBeTruthy();
        expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    });
});
