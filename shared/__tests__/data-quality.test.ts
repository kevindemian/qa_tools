import { describe, expect, it, vi } from 'vitest';
import { makeDataHubMock } from '../test-utils/factories/data-hub-mock.js';
import { summarizeDataQuality } from '../quality/data-quality.js';
import type { FailureRecord } from '../types/data-hub.js';
import type { QualityCategory } from '../data-hub/quality.js';

function makeFailureRecord(overrides: Partial<FailureRecord> = {}): FailureRecord {
    return {
        name: 'test failed',
        status: 'failed',
        confidence: 1,
        source: 'github-api',
        ...overrides,
    };
}

describe('Summarize data quality', () => {
    it('reports missing when no gated category carries data', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock();

        const summary = summarizeDataQuality(hub);

        expect(summary.status).toBe('missing');
        expect(summary.minConfidence).toBeNull();
        expect(summary.categories).toStrictEqual({});
        expect(summary.notes).toStrictEqual([]);
    });

    it('reports ok when present categories are valid', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock();
        hub.getFailureRecords = vi.fn(() => [makeFailureRecord()]);
        hub.getQuality = vi.fn(() => ({ valid: true, issues: [] }));

        const summary = summarizeDataQuality(hub);

        expect(summary.status).toBe('ok');
        expect(summary.categories.failureRecords).toStrictEqual({ valid: true, issues: [] });
    });

    it('reports degraded with a note when a present category is invalid', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock();
        hub.getFailureRecords = vi.fn(() => [makeFailureRecord()]);
        hub.getQuality = vi.fn((category: QualityCategory) =>
            category === 'failureRecords' ? { valid: false, issues: ['schema mismatch'] } : { valid: true, issues: [] },
        );

        const summary = summarizeDataQuality(hub);

        expect(summary.status).toBe('degraded');
        expect(summary.categories.failureRecords?.valid).toBeFalsy();
        expect(summary.notes[0]).toContain('failureRecords');
        expect(summary.notes[0]).toContain('schema mismatch');
    });

    it('computes minConfidence across provenance sources', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock();
        hub.getFailureRecords = vi.fn(() => [makeFailureRecord()]);
        hub.getQuality = vi.fn(() => ({ valid: true, issues: [] }));
        hub.raw.provenance = new Map([
            ['failureRecords', { confidence: 0.8, source: 'github-api', timestamp: '2026-07-14T00:00:00Z' }],
            ['securityFindings', { confidence: 0.3, source: 'code-scanning', timestamp: '2026-07-14T00:00:00Z' }],
        ]);

        const summary = summarizeDataQuality(hub);

        expect(summary.minConfidence).toBeCloseTo(0.3, 5);
    });

    it('treats a single-object category (doraMetrics) as present data', () => {
        expect.hasAssertions();

        const hub = makeDataHubMock();
        hub.getDoraMetrics = vi.fn(() => ({
            deploymentFrequency: 1,
            leadTimeForChanges: 1,
            meanTimeToRecovery: 1,
            changeFailureRate: 0,
            confidence: 1,
        }));

        const summary = summarizeDataQuality(hub);

        expect(summary.status).toBe('ok');
        expect(summary.categories.doraMetrics).toStrictEqual({ valid: true, issues: [] });
    });
});
