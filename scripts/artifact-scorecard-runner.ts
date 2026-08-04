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
import { generateAiEffectivenessHtml } from '../shared/report/ai-effectiveness-renderer.js';
import { generateAiComparisonHtml } from '../shared/report/ai-comparison-renderer.js';
import { generateIncidentReportHtml } from '../shared/report/incident-report-renderer.js';
import { generateImpactAlertHtml } from '../shared/report/impact-alert-renderer.js';
import { generateTraceabilityHtml } from '../shared/report/traceability-renderer.js';
import { generateFlakinessHtml } from '../shared/report/flakiness-renderer.js';
import { generateBacklogHealthHtml } from '../shared/report/backlog-health-renderer.js';
import { generatePipelineCostHtml } from '../shared/quality/pipeline-cost-renderer.js';
import { generateOptimizationHtml } from '../shared/quality/suite-optimization-renderer.js';
import { generateBenchmarkHtml } from '../shared/quality/cross-squad-benchmark-renderer.js';
import { generateReleaseScoreHtml } from '../shared/quality/release-score-renderer.js';
import { generateSilentRegressionHtml } from '../shared/quality/silent-regression-renderer.js';
import { generateDefectTrendHtml } from '../shared/quality/defect-trend-renderer.js';
import { generateSeasonalityHtml } from '../shared/quality/defect-seasonality-renderer.js';
import { generateDeveloperProfileHtml } from '../shared/quality/developer-profile-renderer.js';
import { generateRequirementScoreHtml } from '../shared/quality/requirement-score-renderer.js';
import { generateCoverageGapHtml } from '../shared/report/generate-coverage-gap-html.js';
import { generateHtmlReport } from '../shared/report/report-html.js';
import { createDataHubFromParseResult } from '../shared/data-hub/factory.js';
import { renderPipelineHealthHtml } from '../git_triggers/pipeline-health-renderer.js';
import type { FlatTest } from '../shared/result_parser.js';
import { loadFixture } from './artifact-fixtures.js';
import type { AiMetricsResult } from '../shared/types/data-hub-extensions.js';
import type { AiComparisonResult } from '../shared/report/ai-comparison.js';
import type { IncidentReport } from '../shared/report/incident-report.js';
import type { ImpactAlertResult } from '../shared/report/impact-alert.js';
import type { TraceabilityResult } from '../shared/report/traceability-matrix.js';
import type { FlakinessEntry } from '../shared/types/data-hub.js';
import type { BacklogHealthResult } from '../shared/report/backlog-health.js';
import type { PipelineCostResult } from '../shared/quality/pipeline-cost.js';
import type { OptimizationResult } from '../shared/types/data-hub-extensions.js';
import type { CrossSquadResult } from '../shared/quality/cross-squad-benchmark.js';
import type { ReleaseScoreResult } from '../shared/types/data-hub.js';
import type { RegressionDetectionResult } from '../shared/types/data-hub-extensions.js';
import type { DefectAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { SeasonalityAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { DeveloperProfileResult } from '../shared/quality/developer-profile.js';
import type { RequirementScoreResult } from '../shared/quality/requirement-score.js';
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

function renderPipelineHealthOutput(): string {
    return renderPipelineHealthHtml(
        {
            totalRuns: 12,
            passRate: 66.7,
            avgDurationSec: 1800,
            topFailingJobs: [
                { name: 'e2e', failCount: 4, totalCount: 10, rate: 40 },
                { name: 'unit', failCount: 1, totalCount: 10, rate: 10 },
            ],
            failureReasons: ['flaky: login', 'timeout: checkout'],
            branchBreakdown: { main: { passRate: 80, count: 8 }, dev: { passRate: 40, count: 4 } },
        },
        undefined,
        GENERATED_AT,
    );
}

function buildRendererEntries(): RendererEntry[] {
    return [
        {
            specId: 'report-html',
            render: () => renderTestReportHtml(),
        },
        {
            specId: 'pipeline-health',
            render: () => renderPipelineHealthOutput(),
        },
        {
            specId: 'ai-effectiveness',
            render: () => generateAiEffectivenessHtml(loadFixture<AiMetricsResult>('ai-effectiveness')),
        },
        {
            specId: 'ai-comparison',
            render: () => generateAiComparisonHtml(loadFixture<AiComparisonResult>('ai-comparison')),
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
            specId: 'traceability',
            render: () => generateTraceabilityHtml(loadFixture<TraceabilityResult>('traceability')),
        },
        {
            specId: 'flakiness',
            render: () =>
                generateFlakinessHtml(loadFixture<FlakinessEntry[]>('flakiness'), undefined, {
                    generatedAt: GENERATED_AT,
                }),
        },
        {
            specId: 'backlog-health',
            render: () => generateBacklogHealthHtml(loadFixture<BacklogHealthResult>('backlog-health')),
        },
        {
            specId: 'pipeline-cost',
            render: () => generatePipelineCostHtml(loadFixture<PipelineCostResult>('pipeline-cost')),
        },
        {
            specId: 'suite-optimization',
            render: () =>
                generateOptimizationHtml(
                    loadFixture<OptimizationResult>('suite-optimization'),
                    undefined,
                    GENERATED_AT,
                ),
        },
        {
            specId: 'cross-squad-benchmark',
            render: () =>
                generateBenchmarkHtml(loadFixture<CrossSquadResult>('cross-squad-benchmark'), undefined, GENERATED_AT),
        },
        {
            specId: 'release-score',
            render: () => generateReleaseScoreHtml(loadFixture<ReleaseScoreResult>('release-score'), GENERATED_AT),
        },
        {
            specId: 'silent-regression',
            render: () => generateSilentRegressionHtml(loadFixture<RegressionDetectionResult>('silent-regression')),
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
            specId: 'requirement-score',
            render: () =>
                generateRequirementScoreHtml(
                    loadFixture<RequirementScoreResult>('requirement-score'),
                    undefined,
                    GENERATED_AT,
                ),
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
    // never scored or flagged removable (the scorecard must account for all 24).
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
