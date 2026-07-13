/**
 * ST-3 ingest-gate unit tests — `gateRawData` enforces schema, NaN/Infinity
 * guards, confidence-by-source, dedup and provenance at the whole-payload
 * boundary, TAGGING (never dropping) low-quality data.
 */
import { describe, it, expect } from 'vitest';
import type { RawData, FailureRecord, DoraMetrics } from '../../types/data-hub.js';
import { gateRawData, type QualityCategory } from '../quality.js';

function baseRaw(): RawData {
    return {
        runs: [],
        jobs: new Map(),
        artifacts: new Map(),
        failureReasons: new Map(),
    };
}

describe('GateRawData: failure records', () => {
    it('normalizes NaN confidence, dedups by key, tags invalid status and flags missing provenance', () => {
        const recs = [
            { name: 'a', status: 'failed', confidence: NaN, source: 'junit' },
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'weird', confidence: 1, source: 'junit' },
            { name: 'c', status: 'failed', confidence: 1, source: '' },
        ] as unknown as FailureRecord[];

        const { raw, quality } = gateRawData({ ...baseRaw(), failureRecords: recs });

        expect(raw.failureRecords).toHaveLength(3);

        const a = raw.failureRecords?.find((r) => r.name === 'a');

        expect(Number.isFinite(a?.confidence)).toBeTruthy();

        expect(a?.confidence).toBeCloseTo(0.9, 5);

        const b = raw.failureRecords?.find((r) => r.name === 'b');

        expect(b?.status).toBe('weird');

        expect(quality.failureRecords.valid).toBeFalsy();

        const issues = quality.failureRecords.issues.join(' ');

        expect(issues).toContain('schema invalid');

        expect(issues).toContain('confidence normalized');

        expect(issues).toContain('missing provenance');
    });

    it('preserves valid records unchanged and reports valid quality', () => {
        const recs: FailureRecord[] = [
            { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
            { name: 'b', status: 'broken', confidence: 0.8, source: 'ctrf' },
        ];

        const { raw, quality } = gateRawData({ ...baseRaw(), failureRecords: recs });

        expect(raw.failureRecords).toStrictEqual(recs);

        expect(quality.failureRecords.valid).toBeTruthy();
    });
});

describe('GateRawData: non-gated fields', () => {
    it('preserves untouched RawData fields (runs, coverage)', () => {
        const input: RawData = {
            ...baseRaw(),
            coverage: { total: 100, covered: 80, percentage: 80 },
        };

        const { raw } = gateRawData(input);

        expect(raw.runs).toStrictEqual([]);

        expect(raw.coverage).toStrictEqual({ total: 100, covered: 80, percentage: 80 });
    });
});

describe('GateRawData: empty categories', () => {
    it('yields valid empty reports and stable empty arrays', () => {
        const { raw, quality } = gateRawData(baseRaw());

        expect(raw.failureRecords).toStrictEqual([]);

        expect(raw.doraMetrics).toBeUndefined();

        expect(quality.failureRecords.valid).toBeTruthy();

        expect(quality.doraMetrics.valid).toBeTruthy();
    });
});

describe('GateRawData: object categories', () => {
    it('normalizes NaN confidence on DORA metrics and tags them', () => {
        const metrics: DoraMetrics = { deploymentFrequency: 5, confidence: NaN };

        const { raw, quality } = gateRawData({ ...baseRaw(), doraMetrics: metrics });

        expect(Number.isFinite(raw.doraMetrics?.confidence)).toBeTruthy();

        expect(raw.doraMetrics?.confidence).toBeCloseTo(0.5, 5);

        expect(quality.doraMetrics.valid).toBeFalsy();
    });
});

describe('GateRawData: quality map shape', () => {
    it('exposes all 9 category reports', () => {
        const { quality } = gateRawData(baseRaw());

        const keys = Object.keys(quality) as QualityCategory[];

        expect(keys).toStrictEqual([
            'failureRecords',
            'securityFindings',
            'deployments',
            'releases',
            'pmIssues',
            'coverageFiles',
            'doraMetrics',
            'performanceMetrics',
            'pullRequests',
        ]);
    });
});
