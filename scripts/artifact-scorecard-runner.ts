/**
 * Artifact Quality Score (AQS) runner — I-9.3 deterministic scorecard.
 *
 * Renders every HTML-renderable artifact from the committed JSON fixtures
 * (single source of truth, shared with the harness and content-validation),
 * computes the AQS scorecard, and emits:
 *   - `reports/validation/artifact-scorecard.json` — per-artifact score/overall/checks
 *   - console summary with removable (<60) candidates per I-9.5
 *
 * Deterministic: fixtures are committed, renderers are pure over that input
 * (generation timestamps excluded from the scored output). Exit code 0 when the
 * run completes; per-artifact failures are reported and fail the process
 * (Rule 25: no silent default).
 *
 * Usage: npx tsx scripts/artifact-scorecard-runner.ts
 *
 * @module artifact-scorecard-runner
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS, type ArtifactSpec } from '../shared/types/artifact-specs.js';
import { computeArtifactScorecard, type ArtifactScorecard } from '../shared/quality/artifact-scorecard.js';
import { generateIncidentReportHtml } from '../shared/report/incident-report-renderer.js';
import { generateImpactAlertHtml } from '../shared/report/impact-alert-renderer.js';
import { generateBacklogHealthHtml } from '../shared/report/backlog-health-renderer.js';
import { generatePipelineCostHtml } from '../shared/quality/pipeline-cost-renderer.js';
import { generateReleaseScoreHtml } from '../shared/quality/release-score-renderer.js';
import { generateDefectTrendHtml } from '../shared/quality/defect-trend-renderer.js';
import { generateSeasonalityHtml } from '../shared/quality/defect-seasonality-renderer.js';
import { generateDeveloperProfileHtml } from '../shared/quality/developer-profile-renderer.js';
import { generateCoverageGapHtml } from '../shared/report/generate-coverage-gap-html.js';
import { generateHtmlReport } from '../shared/report/report-html.js';
import { createDataHubFromParseResult } from '../shared/data-hub/factory.js';
import type { FlatTest } from '../shared/result_parser.js';
import { loadFixture } from './artifact-fixtures.js';
import type { IncidentReport } from '../shared/report/incident-report.js';
import type { ImpactAlertResult } from '../shared/report/impact-alert.js';
import type { BacklogHealthResult } from '../shared/report/backlog-health.js';
import type { PipelineCostResult } from '../shared/quality/pipeline-cost.js';
import type { ReleaseScoreResult } from '../shared/types/data-hub.js';
import type { DefectAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { SeasonalityAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { DeveloperProfileResult } from '../shared/quality/developer-profile.js';
import type { CoverageGapResult } from '../shared/types/coverage.js';

const OUT_DIR = join(import.meta.dirname, '..', 'reports', 'validation');

/** Fixed generation instant (ISO-8601) for deterministic scoring. */
const GENERATED_AT = '2026-08-04T00:00:00.000Z';

interface RendererEntry {
    specId: string;
    render: () => string;
}

function makeFlatTests(): FlatTest[] {
    return [
        { title: 'login should succeed', fullTitle: 'Auth > login should succeed', state: 'passed', duration: 1200 },
        {
            title: 'payment should process',
            fullTitle: 'Payments > payment should process',
            state: 'failed',
            duration: 3200,
            error: 'Timeout waiting for element',
        },
        { title: 'search should filter', fullTitle: 'Search > search should filter', state: 'skipped', duration: 0 },
    ];
}

function renderTestReportHtml(): string {
    const tests = makeFlatTests();
    const hub = createDataHubFromParseResult(
        {
            tests,
            stats: { passed: 1, failed: 1, skipped: 1, total: 3, duration: 4400 },
        },
        'qa_tools',
    );
    return generateHtmlReport(tests, { computed: hub.computed, generatedAt: GENERATED_AT });
}

function buildRendererEntries(): RendererEntry[] {
    return [
        {
            specId: 'report-html',
            render: () => renderTestReportHtml(),
        },
        {
            specId: 'incident-report',
            render: () => generateIncidentReportHtml(loadFixture<IncidentReport>('incident-report')),
        },
        {
            specId: 'impact-alert',
            render: () => generateImpactAlertHtml(loadFixture<ImpactAlertResult>('impact-alert')),
        },
        {
            specId: 'backlog-health',
            render: () =>
                generateBacklogHealthHtml(loadFixture<BacklogHealthResult>('backlog-health'), undefined, GENERATED_AT),
        },
        {
            specId: 'pipeline-cost',
            render: () => generatePipelineCostHtml(loadFixture<PipelineCostResult>('pipeline-cost')),
        },
        {
            specId: 'release-score',
            render: () => generateReleaseScoreHtml(loadFixture<ReleaseScoreResult>('release-score'), GENERATED_AT),
        },
        {
            specId: 'defect-trend',
            render: () =>
                generateDefectTrendHtml(loadFixture<DefectAggregationResult>('defect-trend'), undefined, GENERATED_AT),
        },
        {
            specId: 'defect-seasonality',
            render: () =>
                generateSeasonalityHtml(
                    loadFixture<SeasonalityAggregationResult>('defect-seasonality'),
                    undefined,
                    GENERATED_AT,
                ),
        },
        {
            specId: 'developer-profile',
            render: () => generateDeveloperProfileHtml(loadFixture<DeveloperProfileResult>('developer-profile')),
        },
        {
            specId: 'coverage-gap',
            render: () =>
                generateCoverageGapHtml(
                    loadFixture<CoverageGapResult>('coverage-gap'),
                    undefined,
                    undefined,
                    undefined,
                    GENERATED_AT,
                ),
        },
    ];
}

export function runScorecard(): ArtifactScorecard {
    const allSpecs: ArtifactSpec[] = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS];
    const rendererById = new Map(buildRendererEntries().map((e) => [e.specId, e.render]));

    const outputs: Record<string, string> = {};
    const failures: string[] = [];

    for (const entry of buildRendererEntries()) {
        try {
            outputs[entry.specId] = entry.render();
        } catch (err) {
            failures.push(`${entry.specId}: ${(err as Error).message}`);
        }
    }

    if (failures.length > 0) {
        throw new Error(`[aqs-runner] render failures (${failures.length}): ${failures.join(' | ')}`);
    }

    // Only score specs that have a real rendered output (HTML-renderable artifacts).
    const scoreableSpecs = allSpecs.filter((spec) => rendererById.has(spec.id));
    // Non-renderable specs (I-9.4): orchestrators have no standalone artifact;
    // pr-report artifacts carry their own gate (teto T2) — registered explicitly,
    // never scored or flagged removable (the scorecard must account for the 15
    // artifacts vigentes; the 9 deleted dashboards are not registered).
    const unscored: Array<{ specId: string; status: 'gate-proprio' | 'nao-aplicavel'; note: string }> = [
        { specId: 'schedule-handler', status: 'nao-aplicavel', note: 'orchestrator — não gera artefato standalone' },
        { specId: 'interactive-mode', status: 'nao-aplicavel', note: 'orchestrator — não gera artefato standalone' },
        { specId: 'pr-report-markdown', status: 'gate-proprio', note: 'pr-report gate próprio (teto T2)' },
        { specId: 'pr-report-job-summary', status: 'gate-proprio', note: 'pr-report gate próprio (teto T2)' },
        { specId: 'pr-report-html', status: 'gate-proprio', note: 'pr-report gate próprio (teto T2)' },
    ];
    const scorecard = computeArtifactScorecard(scoreableSpecs, outputs, { unscored });

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'artifact-scorecard.json'), JSON.stringify(scorecard, null, 4));

    return scorecard;
}

function main(): void {
    console.log('=== AQS scorecard (I-9.3) ===\n');
    const scorecard = runScorecard();
    console.log(`Total scored:  ${scorecard.total}`);
    console.log(`Registered unscored: ${scorecard.unscored.length}`);
    console.log(`Passed:        ${scorecard.passed}`);
    console.log(`Failed:        ${scorecard.failed}`);
    console.log(`Removable (<60): ${scorecard.removable.length ? scorecard.removable.join(', ') : 'none'}`);
    if (scorecard.removable.length > 0) {
        console.log('\n[aqs-runner] WARNING: removable artifacts detected (AQS < 60) — scorecard JSON updated.');
        console.log('I-9.5: these artifacts must be removed from the codebase or the spec must be satisfied.');
    }
    console.log(`\nScorecard written: ${join(OUT_DIR, 'artifact-scorecard.json')}`);

    if (scorecard.removable.length > 0) {
        process.exitCode = 1;
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
