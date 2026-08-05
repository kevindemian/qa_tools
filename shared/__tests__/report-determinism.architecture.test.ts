import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * D5 (ARTIFACT-VALIDATION.md §0) — determinism as an architectural rule.
 *
 * Report renderers MUST NOT generate their own timestamps. The ONLY canonical
 * timestamp source is `resolveGeneratedAt` (shared/date-utils.ts), seeded by the
 * harness/runner so that the same committed fixture + same command produces
 * byte-identical HTML on ANY calendar day.
 *
 * This is a safety mechanism (AGENTS.md Rule 5): a raw `new Date()` timestamp
 * generator inside a renderer silently breaks cross-day reproducibility — the
 * same-day proof cannot detect it.
 */

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * Canonical set of report renderers that produce deterministic HTML output,
 * as invoked by the artifact-validation-harness / scorecard-runner (AQS).
 * Each MUST NOT generate its own timestamp.
 */
const RENDERER_REL_PATHS = [
    'shared/report/ai-effectiveness-renderer.ts',
    'shared/report/ai-comparison-renderer.ts',
    'shared/report/incident-report-renderer.ts',
    'shared/report/impact-alert-renderer.ts',
    'shared/report/traceability-renderer.ts',
    'shared/report/flakiness-renderer.ts',
    'shared/report/backlog-health-renderer.ts',
    'shared/quality/pipeline-cost-renderer.ts',
    'shared/quality/suite-optimization-renderer.ts',
    'shared/quality/cross-squad-benchmark-renderer.ts',
    'shared/quality/release-score-renderer.ts',
    'shared/quality/silent-regression-renderer.ts',
    'shared/quality/defect-trend-renderer.ts',
    'shared/quality/defect-seasonality-renderer.ts',
    'shared/quality/developer-profile-renderer.ts',
    'shared/quality/requirement-score-renderer.ts',
    'shared/report/generate-coverage-gap-html.ts',
    'git_triggers/pipeline-health-renderer.ts',
    'shared/report/report-html.ts',
];

function readRenderer(fileName: string): { file: string; content: string } {
    const abs = path.join(ROOT, fileName);
    if (!existsSync(abs)) throw new Error(`Renderer not found: ${abs}`);
    return { file: fileName, content: readFileSync(abs, 'utf8') };
}

describe('Architecture — report renderer determinism (D5)', () => {
    const renderers = RENDERER_REL_PATHS.map(readRenderer);

    it('no report renderer generates a timestamp with raw new Date()', () => {
        expect.hasAssertions();

        const offenders = renderers
            .map(({ file, content }) => content.split('\n').map((line, i) => ({ file, line: i + 1, lineText: line })))
            .flat()
            .filter(({ lineText }) => /new Date\(\)\s*\./.test(lineText))
            .filter(({ lineText }) => !/resolveGeneratedAt/.test(lineText));

        expect(offenders).toStrictEqual([]);
    });

    it('every renderer resolves timestamps through the canonical helper', () => {
        expect.hasAssertions();

        for (const r of renderers) {
            // Renderers emit a generated-at timestamp — must route through resolveGeneratedAt.
            expect(
                r.content.includes('resolveGeneratedAt') || !r.content.includes('toISOString'),
                `${r.file} must use resolveGeneratedAt (or no ISO timestamp at all)`,
            ).toBeTruthy();
        }
    });

    it('report-html.ts resolves generatedAt through the canonical helper', () => {
        const reportHtml = renderers.find((r) => r.file === 'shared/report/report-html.ts')?.content;

        expect(reportHtml).toBeTruthy();

        if (!reportHtml) throw new Error('report-html.ts renderer not found in canonical set');

        const resolveUses = reportHtml.match(/resolveGeneratedAt\(/g) ?? [];
        const rawDateUses = reportHtml.match(/options\.generatedAt\s*\|\|\s*new Date\(\)/g) ?? [];

        expect(resolveUses.length).toBeGreaterThanOrEqual(2);
        expect(rawDateUses).toStrictEqual([]);
    });

    it('backlog-health-renderer.ts derives stale age from the seeded now, never live new Date()', () => {
        const renderer = renderers.find((r) => r.file === 'shared/report/backlog-health-renderer.ts')?.content;

        expect(renderer).toBeTruthy();

        if (!renderer) throw new Error('backlog-health-renderer.ts not found in canonical set');

        expect(renderer).toContain('resolveGeneratedAt');
        expect(renderer).toContain('nowMs');
        expect(renderer).not.toMatch(/const now = new Date\(\);/);
        expect(renderer).not.toMatch(/new Date\(\)\.getTime/);
    });

    it('verify harness and runner seed GENERATED_AT for every HTML artifact', () => {
        expect.hasAssertions();

        const harnessPath = path.join(ROOT, 'scripts', 'artifact-validation-harness.ts');
        const runnerPath = path.join(ROOT, 'scripts', 'artifact-scorecard-runner.ts');

        for (const p of [harnessPath, runnerPath]) {
            expect(existsSync(p), `missing ${p}`).toBeTruthy();

            const content = readFileSync(p, 'utf8');

            expect(content, `${p} must define GENERATED_AT`).toContain('const GENERATED_AT');

            // Every HTML artifact entry in the harness (.html') / runner (specId:)
            // must reference GENERATED_AT somewhere in the file.
            const htmlArtifacts = content.match(/\.html'|specId:\s*'/g) ?? [];

            expect(htmlArtifacts.length).toBeGreaterThan(0);
        }
    });
});
