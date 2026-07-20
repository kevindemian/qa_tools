/**
 * ST-2 quality layer tests — verify validateAndScore enforces schema, NaN/empty
 * guards, confidence-by-source, dedup and provenance WITHOUT dropping data.
 */
import { describe, it, expect } from 'vitest';
import type {
    FailureRecord,
    SecurityFinding,
    Deployment,
    Release,
    RawIssue,
    CoverageFile,
    DoraMetrics,
    PerformanceMetrics,
} from '../../types/data-hub.js';
import {
    confidenceForSource,
    validateAndScoreFailureRecords,
    validateAndScoreSecurityFindings,
    validateAndScoreDeployments,
    validateAndScoreReleases,
    validateAndScorePmIssues,
    validateAndScoreCoverageFiles,
    validateAndScoreDoraMetrics,
    validateAndScorePerformanceMetrics,
    gateRawData,
} from '../quality.js';

describe('ConfidenceForSource', () => {
    it('assigns high confidence to structured extraction', () => {
        expect(confidenceForSource('ctrf')).toBeCloseTo(0.9, 5);

        expect(confidenceForSource('check-run-annotation')).toBeCloseTo(0.9, 5);

        expect(confidenceForSource('github')).toBeCloseTo(0.9, 5);
    });

    it('assigns low confidence to regex/log extraction', () => {
        expect(confidenceForSource('log-regex')).toBeCloseTo(0.4, 5);

        expect(confidenceForSource('regex')).toBeCloseTo(0.4, 5);
    });

    it('assigns medium confidence to manual extraction', () => {
        expect(confidenceForSource('manual')).toBeCloseTo(0.6, 5);
    });

    it('assigns medium confidence when source is unknown', () => {
        expect(confidenceForSource(undefined)).toBeCloseTo(0.5, 5);

        expect(confidenceForSource('')).toBeCloseTo(0.5, 5);
    });
});

describe('ValidateAndScoreFailureRecords', () => {
    it('passes a valid record through unchanged', () => {
        const rec: FailureRecord = { name: 'a', status: 'failed', confidence: 1, source: 'junit' };

        const { items, quality } = validateAndScoreFailureRecords([rec]);

        expect(quality.valid).toBeTruthy();
        expect(quality.issues).toStrictEqual([]);
        expect(items).toStrictEqual([rec]);
    });

    it('keeps an invalid (bad status) record and tags quality', () => {
        const rec = { name: 'a', status: 'weird', confidence: 1, source: 'junit' } as unknown as FailureRecord;

        const { items, quality } = validateAndScoreFailureRecords([rec]);

        expect(items).toHaveLength(1);
        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });

    it('normalizes NaN confidence instead of dropping', () => {
        const rec: FailureRecord = { name: 'a', status: 'failed', confidence: NaN, source: 'junit' };

        const { items, quality } = validateAndScoreFailureRecords([rec]);

        expect(items[0]?.confidence).toBeCloseTo(0.9, 5);
        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('confidence normalized');
    });

    it('flags missing provenance', () => {
        const rec: FailureRecord = { name: 'a', status: 'failed', confidence: 1, source: '' };

        const { quality } = validateAndScoreFailureRecords([rec]);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('missing provenance');
    });

    it('dedups by natural key without dropping distinct data', () => {
        const a: FailureRecord = { name: 'a', status: 'failed', confidence: 1, source: 'junit' };
        const b: FailureRecord = { name: 'b', status: 'broken', confidence: 0.8, source: 'junit' };
        const dup: FailureRecord = { name: 'a', status: 'failed', confidence: 1, source: 'junit' };

        const { items } = validateAndScoreFailureRecords([a, b, dup]);

        expect(items).toHaveLength(2);
        expect(items.map((r) => r.name)).toStrictEqual(['a', 'b']);
    });
});

describe('ValidateAndScoreSecurityFindings', () => {
    it('passes a valid finding through', () => {
        const f: SecurityFinding = { tool: 'gitleaks', severity: 'high', title: 'x', confidence: 1 };

        const { items, quality } = validateAndScoreSecurityFindings([f]);

        expect(quality.valid).toBeTruthy();
        expect(items).toStrictEqual([f]);
    });

    it('requires valid severity enum', () => {
        const f = { tool: 't', severity: 'criticalish', title: 'x', confidence: 1 } as unknown as SecurityFinding;

        const { quality } = validateAndScoreSecurityFindings([f]);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });
});

describe('ValidateAndScoreDeployments', () => {
    it('passes a valid deployment through', () => {
        const d: Deployment = { id: 'd1', environment: 'prod', status: 'success', createdAt: 't', confidence: 1 };

        const { items, quality } = validateAndScoreDeployments([d]);

        expect(quality.valid).toBeTruthy();
        expect(items).toStrictEqual([d]);
    });

    it('rejects negative confidence', () => {
        const d: Deployment = { id: 'd1', environment: 'prod', status: 'success', createdAt: 't', confidence: -1 };

        const { quality } = validateAndScoreDeployments([d]);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('confidence normalized');
    });
});

describe('ValidateAndScoreReleases', () => {
    it('passes a valid release through', () => {
        const r: Release = { id: 'r1', tag: 'v1', draft: false, prerelease: false, createdAt: 't', confidence: 1 };

        const { items, quality } = validateAndScoreReleases([r]);

        expect(quality.valid).toBeTruthy();
        expect(items).toStrictEqual([r]);
    });
});

describe('ValidateAndScorePmIssues', () => {
    it('passes a valid issue through', () => {
        const i: RawIssue = {
            source: 'github',
            id: 1,
            title: 'a',
            state: 'open',
            labels: [],
            createdAt: 't',
            confidence: 1,
        };

        const { items, quality } = validateAndScorePmIssues([i]);

        expect(quality.valid).toBeTruthy();
        expect(items).toStrictEqual([i]);
    });

    it('rejects an out-of-domain issue source', () => {
        const i = {
            source: 'bitbucket',
            id: 1,
            title: 'a',
            state: 'open',
            labels: [],
            createdAt: 't',
            confidence: 1,
        } as unknown as RawIssue;

        const { quality } = validateAndScorePmIssues([i]);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });
});

describe('ValidateAndScoreCoverageFiles', () => {
    it('passes a valid coverage file through', () => {
        const c: CoverageFile = { file: 'a.ts', lines: { total: 10, covered: 8, percentage: 80 }, confidence: 1 };

        const { items, quality } = validateAndScoreCoverageFiles([c]);

        expect(quality.valid).toBeTruthy();
        expect(items).toStrictEqual([c]);
    });

    it('rejects percentage out of [0,100]', () => {
        const c: CoverageFile = { file: 'a.ts', lines: { total: 10, covered: 8, percentage: 250 }, confidence: 1 };

        const { quality } = validateAndScoreCoverageFiles([c]);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });
});

describe('ValidateAndScoreDoraMetrics (object)', () => {
    it('passes valid metrics through', () => {
        const m: DoraMetrics = { deploymentFrequency: 5, confidence: 1 };

        const { value, quality } = validateAndScoreDoraMetrics(m);

        expect(quality.valid).toBeTruthy();
        expect(value).toStrictEqual(m);
    });

    it('normalizes NaN confidence and tags low quality', () => {
        const m: DoraMetrics = { deploymentFrequency: 5, confidence: NaN };

        const { value, quality } = validateAndScoreDoraMetrics(m);

        expect(value?.confidence).toBeCloseTo(0.5, 5);
        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('confidence normalized');
    });

    it('rejects changeFailureRate outside [0,1]', () => {
        const m: DoraMetrics = { changeFailureRate: 5, confidence: 1 };

        const { quality } = validateAndScoreDoraMetrics(m);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });

    it('returns null for absent metrics', () => {
        const { value, quality } = validateAndScoreDoraMetrics(null);

        expect(value).toBeNull();
        expect(quality.valid).toBeTruthy();
    });
});

describe('ValidateAndScorePerformanceMetrics (object)', () => {
    it('passes valid metrics through', () => {
        const m: PerformanceMetrics = { pipelineDurationMs: 100, confidence: 1 };

        const { value, quality } = validateAndScorePerformanceMetrics(m);

        expect(quality.valid).toBeTruthy();
        expect(value).toStrictEqual(m);
    });

    it('normalizes Infinity confidence', () => {
        const m: PerformanceMetrics = { pipelineDurationMs: 100, confidence: Infinity };

        const { value, quality } = validateAndScorePerformanceMetrics(m);

        expect(value?.confidence).toBeCloseTo(0.5, 5);
        expect(quality.valid).toBeFalsy();
    });

    it('rejects negative billableMinutes', () => {
        const m: PerformanceMetrics = { billableMinutes: -3, confidence: 1 };

        const { quality } = validateAndScorePerformanceMetrics(m);

        expect(quality.valid).toBeFalsy();
        expect(quality.issues.join(' ')).toContain('schema invalid');
    });
});

describe('GateRawData (ingest boundary — AGGRESIVE robustness)', () => {
    it('does NOT throw when an array category contains a null/invalid element', () => {
        const raw = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            failureRecords: [
                null as unknown as FailureRecord,
                { source: 'ctrf', name: 'x', status: 'failed', confidence: 1 },
            ],
        } as never;

        expect(() => gateRawData(raw)).not.toThrow();

        const { raw: gated, quality } = gateRawData(raw);

        // Valid element preserved; the null one is rejected from the typed model (cannot be
        // a FailureRecord) but is reported explicitly via quality.issues (AGENTS §25: not silent).
        expect(gated.failureRecords).toHaveLength(1);
        expect(quality.failureRecords.issues.join(' ')).toMatch(/unparseable|invalid/);
    });

    it('preserves all other RawData fields untouched when a category is malformed', () => {
        const raw = {
            runs: [],
            jobs: new Map([[1, [1] as unknown as never]]),
            artifacts: new Map(),
            failureReasons: new Map(),
            deployments: [null as unknown as Deployment],
        } as never;

        const { raw: gated } = gateRawData(raw);

        expect(gated.jobs.get(1)).toStrictEqual([1]);
    });
});
