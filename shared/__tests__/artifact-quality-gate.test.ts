/**
 * AQS — Artifact Quality Score (content compliance).
 *
 * Computes a 0-100 score measuring how well a rendered artifact output
 * complies with its ARTIFACT_SPEC:
 * - each required metric name present in output
 * - each required section name present in output
 * - timestamp when spec.timestamp
 * - data-dashboard attribute
 * - sample-size warning when spec.sampleSizeWarning
 *
 * Rule 24/25: explicit guards (empty/non-string output), non-finite safety,
 * never a fabricated score. Rule 19.13: test-first.
 */

import { describe, it, expect } from 'vitest';
import { computeArtifactQualityScore } from '../quality/artifact-quality-gate.js';
import type { ArtifactSpec } from '../types/artifact-specs.js';

function makeSpec(overrides?: Partial<ArtifactSpec>): ArtifactSpec {
    return {
        id: 'test-artifact',
        purpose: 'Test artifact',
        auditor: 'QA',
        reference: ['ISTQB'],
        ssot: 'dataHub.computed.test',
        file: 'shared/report/test-renderer.ts',
        timestamp: true,
        sampleSizeWarning: false,
        metrics: [
            {
                name: 'Acceptance Rate',
                source: 'result.acceptanceRate',
                format: 'percentage',
                severity: 'info',
                description: 'Taxa de aceitação',
            },
            {
                name: 'Total Records',
                source: 'result.totalRecords',
                format: 'number',
                severity: 'info',
                description: 'Total de registros',
            },
        ],
        sections: [{ name: 'Summary', type: 'MetricGrid', required: true, description: 'Resumo' }],
        actions: [],
        ...overrides,
    };
}

describe('ComputeArtifactQualityScore — AQS', () => {
    it('returns score 100 when all required content is present', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<!DOCTYPE html>
<html><head><title>Test</title></head>
<body>
  <h1>Test Artifact</h1>
  <div data-part="timestamp" data-dashboard="test-artifact">2026-08-04</div>
  <div data-section="summary">Summary</div>
  <p>Acceptance Rate</p>
  <p>Total Records</p>
</body></html>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.specId).toBe('test-artifact');
        expect(result.score).toBe(100);
        expect(result.overall).toBe('pass');
        expect(result.checks).toHaveLength(5);
        expect(result.checks.every((c) => c.status === 'pass')).toBeTruthy();
    });

    it('fails when a required metric is missing from output', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<div data-dashboard="test-artifact" data-part="timestamp">x</div>
<p>Acceptance Rate</p>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.checks.some((c) => c.name.includes('Total Records') && c.status === 'fail')).toBeTruthy();
        expect(result.score).toBeLessThan(100);
        expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it('fails when a required section is missing and records it', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<div data-dashboard="test-artifact" data-part="timestamp">x</div>
<p>Acceptance Rate</p>
<p>Total Records</p>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.missingSections).toContain('Summary');
        expect(result.checks.some((c) => c.name.includes('Summary') && c.status === 'fail')).toBeTruthy();
    });

    it('requires data-dashboard attribute', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<div data-part="timestamp">x</div>
<p>Acceptance Rate</p>
<p>Total Records</p>
<div data-section="summary">Summary</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.checks.some((c) => c.name.includes('data-dashboard') && c.status === 'fail')).toBeTruthy();
        expect(result.score).toBeLessThan(100);
    });

    it('requires timestamp when spec.timestamp is true', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<div data-dashboard="test-artifact">x</div>
<p>Acceptance Rate</p>
<p>Total Records</p>
<div data-section="summary">Summary</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.checks.some((c) => c.name.includes('timestamp') && c.status === 'fail')).toBeTruthy();
    });

    it('checks sample-size warning when spec.sampleSizeWarning is true', () => {
        expect.hasAssertions();

        const spec = makeSpec({ sampleSizeWarning: true });
        const output = `
<div data-dashboard="test-artifact" data-part="timestamp">x</div>
<p>Acceptance Rate</p>
<p>Total Records</p>
<div data-section="summary">Summary</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.checks.some((c) => c.name.includes('sample') && c.status === 'fail')).toBeTruthy();
    });

    it('does not require timestamp or sample warning when spec flags are false', () => {
        expect.hasAssertions();

        const spec = makeSpec({ timestamp: false, sampleSizeWarning: false });
        const output = `
<div data-dashboard="test-artifact">x</div>
<p>Acceptance Rate</p>
<p>Total Records</p>
<div data-section="summary">Summary</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.checks.every((c) => c.status === 'pass')).toBeTruthy();
        expect(result.score).toBe(100);
    });

    it('fails explicitly on empty output (Rule 24/25, never silent 0)', () => {
        expect.hasAssertions();

        const spec = makeSpec();

        const result = computeArtifactQualityScore(spec, '');

        expect(result.score).toBe(0);
        expect(result.overall).toBe('fail');
        expect(result.checks.some((c) => c.status === 'fail')).toBeTruthy();
        expect(result.checks.some((c) => c.details.includes('vazio'))).toBeTruthy();
    });

    it('overall is warn when score is >= 60 and < 80', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `<div data-dashboard="test-artifact" data-part="timestamp">x</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThan(60);
        expect(result.overall).toBe('fail');
    });

    it('score never exceeds bounds (Rule 24/25)', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `<div data-dashboard="test-artifact" data-part="timestamp">x</div>
<p>Acceptance Rate</p><p>Total Records</p><div data-section="summary">Summary</div>`;

        const result = computeArtifactQualityScore(spec, output);

        expect(Number.isFinite(result.score)).toBeTruthy();
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('returns a deterministic score for identical inputs', () => {
        expect.hasAssertions();

        const spec = makeSpec();
        const output = `
<div data-dashboard="test-artifact" data-part="timestamp">x</div>
<p>Acceptance Rate</p><p>Total Records</p><div data-section="summary">Summary</div>`;

        const a = computeArtifactQualityScore(spec, output);
        const b = computeArtifactQualityScore(spec, output);

        expect(a.score).toBe(b.score);
        expect(a.checks).toStrictEqual(b.checks);
    });
});
