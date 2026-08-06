/**
 * Artifact validation harness — D1 (functional) + D3 (form) evidence generation.
 *
 * Generates real HTML output for every artifact using realistic test data
 * (exact shapes from artifact-content-validation.test.ts — passing suite),
 * and writes it to reports/validation/ for inspection.
 *
 * Usage: npx tsx scripts/artifact-validation-harness.ts
 *
 * @module artifact-validation-harness
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
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
import { renderPipelineHealthHtml } from '../git_triggers/pipeline-health-renderer.js';
import { generateHtmlReport } from '../shared/report/report-html.js';
import { createDataHubFromParseResult } from '../shared/data-hub/factory.js';
import { exportTestsCsv, exportTestsJson } from '../shared/report/report-export.js';
import { mdToHtml } from '../shared/report/markdown.js';
import { loadFixture } from './artifact-fixtures.js';
import type { AiMetricsResult } from '../shared/types/data-hub-extensions.js';
import type { AiComparisonResult } from '../shared/data-hub/compute/ai-comparison.js';
import type { IncidentReport } from '../shared/report/incident-report.js';
import type { ImpactAlertResult } from '../shared/report/impact-alert.js';
import type { TraceabilityResult } from '../shared/report/traceability-matrix.js';
import type { FlakinessEntry } from '../shared/types/data-hub.js';
import type { BacklogHealthResult } from '../shared/report/backlog-health.js';
import type { PipelineCostResult } from '../shared/quality/pipeline-cost.js';
import type { OptimizationResult } from '../shared/types/data-hub-extensions.js';
import type { CrossSquadResult } from '../shared/data-hub/compute/cross-squad-benchmark.js';
import type { ReleaseScoreResult } from '../shared/types/data-hub.js';
import type { RegressionDetectionResult } from '../shared/types/data-hub-extensions.js';
import type { DefectAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { SeasonalityAggregationResult } from '../shared/types/data-hub-extensions.js';
import type { DeveloperProfileResult } from '../shared/quality/developer-profile.js';
import type { RequirementScoreResult } from '../shared/data-hub/compute/requirement-score.js';
import type { CoverageGapResult } from '../shared/types/coverage.js';
import type { FlatTest } from '../shared/result_parser.js';

const OUT_DIR = join(import.meta.dirname, '..', 'reports', 'validation');

/** Fixed generation instant (ISO-8601) for deterministic D1/D3 output.
 *  Fase II/III: same SHA + command -> byte-identical artifacts (sha256 proof). */
const GENERATED_AT = '2026-08-04T00:00:00.000Z';

function write(name: string, html: string): void {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, name), html);
    const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
    const doctype = html.startsWith('<!DOCTYPE html>') ? 'ok' : 'MISSING';
    const err = html.includes('Error generating') || html.includes('FAILED') ? 'ERROR-PAGE' : '';
    console.log(`${name.padEnd(45)} ${kb.padStart(8)}KB  doctype=${doctype} ${err}`);
}

function makeFlatTests(): FlatTest[] {
    return [
        {
            title: 'login should succeed',
            fullTitle: 'Auth > login should succeed',
            state: 'passed',
            duration: 1200,
        },
        {
            title: 'payment should process',
            fullTitle: 'Payments > payment should process',
            state: 'failed',
            duration: 3200,
            error: 'Timeout waiting for element',
        },
        {
            title: 'search should filter',
            fullTitle: 'Search > search should filter',
            state: 'skipped',
            duration: 0,
        },
    ];
}

function run(): void {
    console.log('=== D1/D3 artifact validation harness ===\n');

    const artifacts: Array<[string, () => string]> = [
        ['ai-effectiveness.html', () => generateAiEffectivenessHtml(loadFixture<AiMetricsResult>('ai-effectiveness'))],
        ['ai-comparison.html', () => generateAiComparisonHtml(loadFixture<AiComparisonResult>('ai-comparison'))],
        ['incident-report.html', () => generateIncidentReportHtml(loadFixture<IncidentReport>('incident-report'))],
        ['impact-alert.html', () => generateImpactAlertHtml(loadFixture<ImpactAlertResult>('impact-alert'))],
        ['traceability.html', () => generateTraceabilityHtml(loadFixture<TraceabilityResult>('traceability'))],
        [
            'flakiness.html',
            () =>
                generateFlakinessHtml(loadFixture<FlakinessEntry[]>('flakiness'), undefined, {
                    generatedAt: GENERATED_AT,
                }),
        ],
        [
            'backlog-health.html',
            () =>
                generateBacklogHealthHtml(loadFixture<BacklogHealthResult>('backlog-health'), undefined, GENERATED_AT),
        ],
        ['pipeline-cost.html', () => generatePipelineCostHtml(loadFixture<PipelineCostResult>('pipeline-cost'))],
        [
            'suite-optimization.html',
            () =>
                generateOptimizationHtml(
                    loadFixture<OptimizationResult>('suite-optimization'),
                    undefined,
                    GENERATED_AT,
                ),
        ],
        [
            'cross-squad-benchmark.html',
            () =>
                generateBenchmarkHtml(loadFixture<CrossSquadResult>('cross-squad-benchmark'), undefined, GENERATED_AT),
        ],
        [
            'release-score.html',
            () => generateReleaseScoreHtml(loadFixture<ReleaseScoreResult>('release-score'), GENERATED_AT),
        ],
        [
            'silent-regression.html',
            () => generateSilentRegressionHtml(loadFixture<RegressionDetectionResult>('silent-regression')),
        ],
        [
            'defect-trend.html',
            () =>
                generateDefectTrendHtml(loadFixture<DefectAggregationResult>('defect-trend'), undefined, GENERATED_AT),
        ],
        [
            'defect-seasonality.html',
            () =>
                generateSeasonalityHtml(
                    loadFixture<SeasonalityAggregationResult>('defect-seasonality'),
                    undefined,
                    GENERATED_AT,
                ),
        ],
        [
            'developer-profile.html',
            () => generateDeveloperProfileHtml(loadFixture<DeveloperProfileResult>('developer-profile')),
        ],
        [
            'requirement-score.html',
            () =>
                generateRequirementScoreHtml(
                    loadFixture<RequirementScoreResult>('requirement-score'),
                    undefined,
                    GENERATED_AT,
                ),
        ],
        [
            'coverage-gap.html',
            () =>
                generateCoverageGapHtml(
                    loadFixture<CoverageGapResult>('coverage-gap'),
                    undefined,
                    undefined,
                    undefined,
                    GENERATED_AT,
                ),
        ],
        [
            'test-report.html',
            () => {
                const tests = makeFlatTests();
                // F0-T8 (SSOT): hub dedicado refletindo o run — `computed` é
                // obrigatório no gerador (report-html guard).
                const hub = createDataHubFromParseResult(
                    {
                        tests,
                        stats: { passed: 1, failed: 1, skipped: 1, total: 3, duration: 4400 },
                    },
                    'qa_tools',
                );
                return generateHtmlReport(tests, { computed: hub.computed, generatedAt: GENERATED_AT });
            },
        ],
        ['export.csv', () => exportTestsCsv(makeFlatTests())],
        ['export.json', () => exportTestsJson(makeFlatTests())],
        ['docs.html', () => mdToHtml('# QA Tools Docs\n\n## Installation\n\nRun setup.')],
    ];

    for (const [name, gen] of artifacts) {
        try {
            const html = gen();
            write(name, html);
        } catch (err) {
            console.log(`${name.padEnd(45)} ERROR: ${(err as Error).message}`);
        }
    }

    try {
        const pipelineData = {
            totalRuns: 12,
            passRate: 66.7,
            avgDurationSec: 1800,
            topFailingJobs: [
                { name: 'e2e', failCount: 4, totalCount: 10, rate: 40 },
                { name: 'unit', failCount: 1, totalCount: 10, rate: 10 },
            ],
            failureReasons: ['flaky: login', 'timeout: checkout'],
            branchBreakdown: { main: { passRate: 80, count: 8 }, dev: { passRate: 40, count: 4 } },
        };
        write('pipeline-health.html', renderPipelineHealthHtml(pipelineData, undefined, GENERATED_AT));
    } catch (err) {
        console.log(`pipeline-health.html${' '.repeat(27)} ERROR: ${(err as Error).message}`);
    }

    try {
        const flakyNoHub = generateFlakinessHtml(loadFixture<FlakinessEntry[]>('flakiness'), 'Flakiness (no DataHub)', {
            generatedAt: GENERATED_AT,
        });
        write('flakiness-no-datahub.html', flakyNoHub);
    } catch (err) {
        console.log(`flakiness-no-datahub.html${' '.repeat(23)} ERROR: ${(err as Error).message}`);
    }
}

run();
