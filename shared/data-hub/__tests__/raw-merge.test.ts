/**
 * ST-1 raw-merge tests — verify the shared merge semantics used by both the
 * hub and CompositeProvider: array categories accumulate with dedup by natural
 * key (no silent drop, no duplicate); object categories use first-non-null.
 */
import { describe, it, expect } from 'vitest';
import type { RawData } from '../../types/data-hub.js';
import { mergeCategoryArrays, mergeProvenance } from '../raw-merge.js';

function emptyRaw(): RawData {
    return { runs: [], jobs: new Map(), artifacts: new Map(), failureReasons: new Map() };
}

describe('ST-1 mergeCategoryArrays: array categories', () => {
    it('accumulates distinct items across providers', () => {
        const target = emptyRaw();
        const source: RawData = {
            ...emptyRaw(),
            failureRecords: [{ name: 'a', status: 'failed', confidence: 1, source: 'junit' }],
            deployments: [{ id: 'd1', environment: 'prod', status: 'success', createdAt: 't', confidence: 1 }],
        };

        mergeCategoryArrays(target, source);

        expect(target.failureRecords).toHaveLength(1);
        expect(target.deployments).toHaveLength(1);
    });

    it('dedups by natural key — no duplicate, no silent drop', () => {
        const target: RawData = {
            ...emptyRaw(),
            failureRecords: [{ name: 'a', status: 'failed', confidence: 1, source: 'junit' }],
        };
        const source: RawData = {
            ...emptyRaw(),
            failureRecords: [
                { name: 'a', status: 'failed', confidence: 1, source: 'junit' },
                { name: 'b', status: 'broken', confidence: 0.8, source: 'junit' },
            ],
        };

        mergeCategoryArrays(target, source);

        expect(target.failureRecords).toHaveLength(2);
        expect(target.failureRecords?.map((r) => r.name)).toStrictEqual(['a', 'b']);
    });

    it('same natural key with different source is NOT deduped', () => {
        const target: RawData = {
            ...emptyRaw(),
            failureRecords: [{ name: 'a', status: 'failed', confidence: 1, source: 'junit' }],
        };
        const source: RawData = {
            ...emptyRaw(),
            failureRecords: [{ name: 'a', status: 'failed', confidence: 0.9, source: 'ctrf' }],
        };

        mergeCategoryArrays(target, source);

        expect(target.failureRecords).toHaveLength(2);
    });

    it('empty source leaves target array intact', () => {
        const target: RawData = {
            ...emptyRaw(),
            securityFindings: [{ tool: 'gitleaks', severity: 'high', title: 'x', confidence: 1 }],
        };
        const source = emptyRaw();

        mergeCategoryArrays(target, source);

        expect(target.securityFindings).toHaveLength(1);
    });

    it('merges releases/pmIssues/coverageFiles across providers', () => {
        const target: RawData = {
            ...emptyRaw(),
            releases: [{ id: 'r1', tag: 'v1', draft: false, prerelease: false, createdAt: 't', confidence: 1 }],
            pmIssues: [
                { source: 'github', id: 1, title: 'a', state: 'open', labels: [], createdAt: 't', confidence: 1 },
            ],
            coverageFiles: [{ file: 'a.ts', lines: { total: 1, covered: 1, percentage: 100 }, confidence: 1 }],
        };
        const source: RawData = {
            ...emptyRaw(),
            releases: [{ id: 'r2', tag: 'v2', draft: false, prerelease: false, createdAt: 't', confidence: 1 }],
            pmIssues: [
                { source: 'github', id: 2, title: 'b', state: 'open', labels: [], createdAt: 't', confidence: 1 },
            ],
            coverageFiles: [{ file: 'b.ts', lines: { total: 1, covered: 0, percentage: 0 }, confidence: 1 }],
        };

        mergeCategoryArrays(target, source);

        expect(target.releases).toHaveLength(2);
        expect(target.pmIssues).toHaveLength(2);
        expect(target.coverageFiles).toHaveLength(2);
    });
});

describe('ST-1 mergeCategoryArrays: object categories (first-non-null)', () => {
    it('fills target.doraMetrics only when target is null', () => {
        const target = emptyRaw();
        const source: RawData = {
            ...emptyRaw(),
            doraMetrics: { deploymentFrequency: 5, confidence: 1 },
        };

        mergeCategoryArrays(target, source);

        expect(target.doraMetrics).toStrictEqual({ deploymentFrequency: 5, confidence: 1 });

        const source2: RawData = {
            ...emptyRaw(),
            doraMetrics: { deploymentFrequency: 99, confidence: 1 },
        };
        mergeCategoryArrays(target, source2);

        expect(target.doraMetrics?.deploymentFrequency).toBe(5);
    });

    it('fills target.performanceMetrics only when target is null', () => {
        const target = emptyRaw();
        const source: RawData = {
            ...emptyRaw(),
            performanceMetrics: { pipelineDurationMs: 100, confidence: 1 },
        };

        mergeCategoryArrays(target, source);

        expect(target.performanceMetrics?.pipelineDurationMs).toBe(100);

        mergeCategoryArrays(target, { ...emptyRaw(), performanceMetrics: { pipelineDurationMs: 999, confidence: 1 } });

        expect(target.performanceMetrics?.pipelineDurationMs).toBe(100);
    });
});

describe('ST-1 mergeProvenance: trust channel preserved across providers', () => {
    function withProvenance(entries: Record<string, number>): RawData {
        const map = new Map<string, { confidence: number; source: string; timestamp: string }>();
        for (const [key, confidence] of Object.entries(entries)) {
            map.set(key, { confidence, source: `${key}-src`, timestamp: '2026-01-01T00:00:00Z' });
        }
        return { ...emptyRaw(), provenance: map };
    }

    it('unions distinct provenance keys from source into target', () => {
        const target = withProvenance({ runs: 1 });
        const source = withProvenance({ deployments: 0.9, doraMetrics: 0.9 });

        mergeProvenance(target, source);

        expect(target.provenance?.has('runs')).toBeTruthy();
        expect(target.provenance?.has('deployments')).toBeTruthy();
        expect(target.provenance?.has('doraMetrics')).toBeTruthy();
        expect(target.provenance?.get('deployments')?.confidence).toBeCloseTo(0.9, 5);
    });

    it('target keeps priority for an already-present key (no clobber)', () => {
        const target = withProvenance({ runs: 1 });
        const source = withProvenance({ runs: 0.2 });

        mergeProvenance(target, source);

        expect(target.provenance?.get('runs')?.confidence).toBeCloseTo(1, 5);
    });

    it('initializes target.provenance when target has none', () => {
        const target = emptyRaw();
        const source = withProvenance({ runs: 1 });

        mergeProvenance(target, source);

        expect(target.provenance).toBeDefined();
        expect(target.provenance?.get('runs')?.confidence).toBeCloseTo(1, 5);
    });

    it('no-op when source has no provenance (never drops/throws)', () => {
        const target = withProvenance({ runs: 1 });

        mergeProvenance(target, emptyRaw());

        expect(target.provenance?.has('runs')).toBeTruthy();
        expect(target.provenance).toHaveLength(1);
    });
});
