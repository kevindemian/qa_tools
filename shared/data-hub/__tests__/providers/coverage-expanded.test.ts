/**
 * Expanded coverage extraction tests (FASE EXPAND+STORE).
 *
 * Verifies that CoverageDataProvider.fetchRawData populates raw.coverageFiles
 * (per-file CoverageFile[]) from CI run artifacts via the injected GitProvider
 * (getRecentPipelines / listPipelineArtifacts / downloadArtifact), parsing
 * Istanbul json-summary, Cobertura and JaCoCo reports — with correct per-file
 * numbers, provenance, and negative/edge cases:
 *   - total === 0 → percentage OMITTED (file kept, never NaN/fabricated)
 *   - malformed JSON → entry dropped (valid files preserved), logged not swallowed
 *   - no coverage artifact → coverageFiles === []
 */
import { describe, it, expect, vi } from 'vitest';
import { CoverageDataProvider } from '../../providers/coverage-provider.js';
import { createMockGitProvider } from '../../../test-utils/factories/git-provider-factory.js';
import { rootLogger } from '../../../logger.js';
import type { FetchOptions } from '../../../types/data-hub.js';
import type { ArtifactInfo, PipelineRun } from '../../../types/ci-cd.js';

interface FakeArtifact {
    name: string;
    buffer: Buffer;
    filename?: string;
}

const OPTIONS: FetchOptions = { repo: 'owner/repo', count: 1 };
const MISSING_LOCAL_PATH = '/nonexistent/coverage-summary.json';

function buildProvider(artifacts: FakeArtifact[], runs: PipelineRun[] = [{ id: 1 }]): CoverageDataProvider {
    const git = createMockGitProvider();

    git.getRecentPipelines.mockResolvedValue(runs);
    const byId = new Map<number, FakeArtifact>(artifacts.map((a, i) => [100 + i, a]));
    const infos: ArtifactInfo[] = [...byId].map(([id, a]) => ({ id, name: a.name }));

    git.listPipelineArtifacts.mockResolvedValue(infos);
    git.downloadArtifact.mockImplementation((id: string | number) => {
        const artifact = byId.get(Number(id));

        if (!artifact) throw new Error(`unexpected artifact id ${String(id)}`);

        return Promise.resolve({ buffer: artifact.buffer, filename: artifact.filename ?? artifact.name });
    });

    return new CoverageDataProvider(MISSING_LOCAL_PATH, git);
}

function istanbulFixture(): Buffer {
    return Buffer.from(
        JSON.stringify({
            total: {
                lines: { total: 10, covered: 7, skipped: 0, pct: 70 },
                functions: { total: 4, covered: 3, skipped: 0, pct: 75 },
                branches: { total: 4, covered: 2, skipped: 0, pct: 50 },
                statements: { total: 10, covered: 7, skipped: 0, pct: 70 },
            },
            'src/a.ts': {
                lines: { total: 4, covered: 3, skipped: 0, pct: 75 },
                functions: { total: 2, covered: 2, skipped: 0, pct: 100 },
                branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
                statements: { total: 4, covered: 3, skipped: 0, pct: 75 },
            },
            'src/b.ts': {
                lines: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
                functions: { total: 2, covered: 1, skipped: 0, pct: 50 },
                branches: { total: 2, covered: 1, skipped: 0, pct: 50 },
                statements: { total: 6, covered: 4, skipped: 0, pct: 66.67 },
            },
        }),
    );
}

const COBERTURA_FIXTURE = Buffer.from(
    `<?xml version="1.0" ?>
<coverage line-rate="0.5" version="1.9">
  <packages>
    <package name="src">
      <classes>
        <class filename="src/foo.ts" line-rate="0.5">
          <lines>
            <line number="1" hits="3"/>
            <line number="2" hits="0" branch="true" condition-coverage="50% (1/2)"/>
          </lines>
        </class>
      </classes>
    </package>
  </packages>
</coverage>`,
);

const JACOCO_FIXTURE = Buffer.from(
    `<?xml version="1.0" ?>
<report name="app">
  <package name="com/example">
    <sourcefile name="Foo.java">
      <counter type="LINE" missed="3" covered="7"/>
      <counter type="BRANCH" missed="1" covered="1"/>
      <counter type="METHOD" missed="0" covered="2"/>
    </sourcefile>
  </package>
</report>`,
);

function sortStrings(values: string[]): string[] {
    return [...values].sort((a, b) => a.localeCompare(b));
}

describe('CoverageDataProvider — per-file expansion (FASE EXPAND)', () => {
    it('extracts per-file coverage from an Istanbul json-summary artifact', async () => {
        expect.assertions(8);

        const provider = buildProvider([{ name: 'coverage-final.json', buffer: istanbulFixture() }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const byFile = new Map((raw.coverageFiles ?? []).map((c) => [c.file, c]));
        const a = byFile.get('src/a.ts');
        const b = byFile.get('src/b.ts');

        expect(a?.lines).toStrictEqual({ total: 4, covered: 3, percentage: 75 });
        expect(a?.branches).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
        expect(a?.functions).toStrictEqual({ total: 2, covered: 2, percentage: 100 });
        expect(a?.confidence).toBeCloseTo(0.85);
        expect(b?.lines.total).toBe(6);
        expect(b?.lines.covered).toBe(4);
        // percentage recomputed from covered/total, NOT copied from report pct.
        expect(b?.lines.percentage).toBeCloseTo((4 / 6) * 100, 10);
        expect(byFile.has('total')).toBeFalsy();
    });

    it('records provenance for coverageFiles with confidence 0.85', async () => {
        expect.assertions(2);

        const provider = buildProvider([{ name: 'coverage-final.json', buffer: istanbulFixture() }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const source = raw.provenance?.get('coverageFiles');

        expect(source?.confidence).toBeCloseTo(0.85);
        expect(source?.source).toBe('ci-artifacts');
    });

    it('extracts per-file coverage from a Cobertura artifact', async () => {
        expect.assertions(4);

        const provider = buildProvider([{ name: 'cobertura-coverage.xml', buffer: COBERTURA_FIXTURE }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const foo = raw.coverageFiles?.[0];

        expect(raw.coverageFiles).toHaveLength(1);
        expect(foo?.file).toBe('src/foo.ts');
        expect(foo?.lines).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
        expect(foo?.branches).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
    });

    it('extracts per-file coverage from a JaCoCo artifact', async () => {
        expect.assertions(4);

        const provider = buildProvider([{ name: 'jacoco.xml', buffer: JACOCO_FIXTURE }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const foo = raw.coverageFiles?.[0];

        expect(foo?.file).toBe('com/example/Foo.java');
        expect(foo?.lines).toStrictEqual({ total: 10, covered: 7, percentage: 70 });
        expect(foo?.branches).toStrictEqual({ total: 2, covered: 1, percentage: 50 });
        expect(foo?.functions).toStrictEqual({ total: 2, covered: 2, percentage: 100 });
    });

    it('merges files across multiple coverage artifacts in a run', async () => {
        expect.assertions(1);

        const provider = buildProvider([
            { name: 'coverage-final.json', buffer: istanbulFixture() },
            { name: 'cobertura-coverage.xml', buffer: COBERTURA_FIXTURE },
        ]);

        const raw = await provider.fetchRawData(OPTIONS);
        const files = sortStrings((raw.coverageFiles ?? []).map((c) => c.file));

        expect(files).toStrictEqual(['src/a.ts', 'src/b.ts', 'src/foo.ts']);
    });

    // ── NEGATIVE / EDGE CASES ────────────────────────────────────────────────

    it('omits percentage when total === 0 (never NaN, never fabricated), file kept', async () => {
        expect.assertions(4);

        const fixture = Buffer.from(
            JSON.stringify({
                total: { lines: { total: 0, covered: 0, skipped: 0, pct: 100 } },
                'src/empty.ts': { lines: { total: 0, covered: 0, skipped: 0, pct: 100 } },
            }),
        );
        const provider = buildProvider([{ name: 'coverage-final.json', buffer: fixture }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const empty = raw.coverageFiles?.[0];

        expect(raw.coverageFiles).toHaveLength(1);
        expect(empty?.file).toBe('src/empty.ts');
        expect(empty?.lines).toStrictEqual({ total: 0, covered: 0 });
        expect(empty?.lines).not.toHaveProperty('percentage');
    });

    it('drops a malformed JSON artifact but keeps valid files (logged, not swallowed)', async () => {
        expect.assertions(2);

        const warn = vi.spyOn(rootLogger, 'warn');
        const malformed = Buffer.from('{ this is : not valid json ');
        const provider = buildProvider([
            { name: 'broken-coverage.json', buffer: malformed },
            { name: 'coverage-final.json', buffer: istanbulFixture() },
        ]);

        const raw = await provider.fetchRawData(OPTIONS);
        const files = sortStrings((raw.coverageFiles ?? []).map((c) => c.file));

        expect(files).toStrictEqual(['src/a.ts', 'src/b.ts']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken-coverage.json'));

        warn.mockRestore();
    });

    it('drops individual malformed entries within a valid Istanbul report, keeps the rest', async () => {
        expect.assertions(1);

        const fixture = Buffer.from(
            JSON.stringify({
                total: { lines: { total: 4, covered: 3, skipped: 0, pct: 75 } },
                'src/ok.ts': { lines: { total: 4, covered: 3, skipped: 0, pct: 75 } },
                'src/bad.ts': { lines: { total: 'x', covered: 3 } },
                'src/overcount.ts': { lines: { total: 2, covered: 5 } },
            }),
        );
        const provider = buildProvider([{ name: 'coverage-final.json', buffer: fixture }]);

        const raw = await provider.fetchRawData(OPTIONS);
        const files = (raw.coverageFiles ?? []).map((c) => c.file);

        expect(files).toStrictEqual(['src/ok.ts']);
    });

    it('returns empty coverageFiles when no coverage artifact is present', async () => {
        expect.assertions(2);

        const provider = buildProvider([{ name: 'test-results.xml', buffer: Buffer.from('<testsuite/>') }]);

        const raw = await provider.fetchRawData(OPTIONS);

        expect(raw.coverageFiles).toStrictEqual([]);
        expect(raw.provenance?.get('coverageFiles')).toBeUndefined();
    });

    it('returns empty coverageFiles when the pipeline has no artifacts', async () => {
        expect.assertions(1);

        const provider = buildProvider([]);

        const raw = await provider.fetchRawData(OPTIONS);

        expect(raw.coverageFiles).toStrictEqual([]);
    });

    it('does not populate coverageFiles without a GitProvider (never fabricated)', async () => {
        expect.assertions(1);

        const provider = new CoverageDataProvider(MISSING_LOCAL_PATH);

        const raw = await provider.fetchRawData(OPTIONS);

        expect(raw.coverageFiles).toBeUndefined();
    });
});
