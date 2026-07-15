/**
 * Unit tests for the per-file coverage extractor (COV — FASE EXPAND+STORE).
 *
 * Pure transformation: decodes coverage-report artifact buffers (Istanbul /
 * Cobertura / JaCoCo) into `CoverageFile[]`. No I/O, deterministic.
 */
import { describe, it, expect } from 'vitest';
import { extractCoverageFiles, isCoverageArtifact } from '../../extractors/coverage-files-extractor.js';
import AdmZip from 'adm-zip';

/* ── Istanbul json-summary fixtures ───────────────────────────────────────── */

const ISTANBUL_SUMMARY = {
    total: {
        lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 24, skipped: 0, pct: 80 },
    },
    'src/foo.ts': {
        lines: { total: 50, covered: 45, skipped: 0, pct: 90 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 15, covered: 14, skipped: 0, pct: 93.33 },
    },
    'src/bar.ts': {
        lines: { total: 50, covered: 35, skipped: 0, pct: 70 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 15, covered: 10, skipped: 0, pct: 66.67 },
    },
};

const COBERTURA_XML = `<?xml version="1.0"?>
<coverage line-rate="0.8" branch-rate="0.6">
  <packages>
    <package name="src">
      <classes>
        <class name="foo.ts" filename="src/foo.ts" line-rate="0.9" branch-rate="0.7">
          <lines>
            <line number="1" hits="1"/>
            <line number="2" hits="0"/>
          </lines>
        </class>
        <class name="bar.ts" filename="src/bar.ts" line-rate="0.7" branch-rate="0.5">
          <lines>
            <line number="1" hits="3"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`;

/* ── Tests ───────────────────────────────────────────────────────────────── */

describe('ExtractCoverageFiles', () => {
    it('detects coverage artifacts by name', () => {
        expect.hasAssertions();

        expect(isCoverageArtifact('coverage-summary.json')).toBeTruthy();
        expect(isCoverageArtifact('cobertura-coverage.xml')).toBeTruthy();
        expect(isCoverageArtifact('jacoco.xml')).toBeTruthy();
        expect(isCoverageArtifact('test-results.json')).toBeFalsy();
    });

    it('extracts per-file coverage from a raw Istanbul json-summary buffer', () => {
        expect.hasAssertions();

        const result = extractCoverageFiles('coverage-summary.json', Buffer.from(JSON.stringify(ISTANBUL_SUMMARY)));

        expect(result.errors).toHaveLength(0);
        expect(result.files).toHaveLength(2);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.total).toBe(50);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.covered).toBe(45);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.percentage).toBeCloseTo(90, 1);
    });

    it('extracts per-file coverage from a Cobertura xml buffer', () => {
        expect.hasAssertions();

        const result = extractCoverageFiles('cobertura-coverage.xml', Buffer.from(COBERTURA_XML));

        expect(result.errors).toHaveLength(0);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.total).toBe(2);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.covered).toBe(1);
        expect(result.files.find((f) => f.file === 'src/foo.ts')?.lines.percentage).toBeCloseTo(50, 1);
    });

    it('extracts from a zip artifact containing multiple coverage reports', () => {
        expect.hasAssertions();

        const zip = new AdmZip();
        zip.addFile('coverage/coverage-summary.json', Buffer.from(JSON.stringify(ISTANBUL_SUMMARY)));
        zip.addFile('coverage/cobertura-coverage.xml', Buffer.from(COBERTURA_XML));
        const buffer = zip.toBuffer();

        const result = extractCoverageFiles('coverage-artifact.zip', buffer);

        expect(result.errors).toHaveLength(0);
        expect(result.files.length).toBeGreaterThanOrEqual(4);
    });

    it('reports malformed entries in errors instead of swallowing them', () => {
        expect.hasAssertions();

        const result = extractCoverageFiles('coverage-summary.json', Buffer.from('{ not valid json'));

        expect(result.files).toHaveLength(0);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('omits percentage when total <= 0 and never stores NaN', () => {
        expect.hasAssertions();

        const empty = {
            total: { lines: { total: 0, covered: 0, skipped: 0, pct: 0 } },
            'src/empty.ts': { lines: { total: 0, covered: 0, skipped: 0, pct: 0 } },
        };
        const result = extractCoverageFiles('coverage-summary.json', Buffer.from(JSON.stringify(empty)));

        expect(result.files).toHaveLength(1);

        const percentage = result.files.find((f) => f.file === 'src/empty.ts')?.lines.percentage;

        expect(percentage).toBeUndefined();
        expect(percentage).not.toBeNaN();
    });
});
