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
import { exportTestsCsv, exportTestsJson } from '../shared/report/report-export.js';
import { mdToHtml } from '../shared/report/markdown.js';
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
        ['incident-report.html', () => generateIncidentReportHtml(loadFixture<IncidentReport>('incident-report'))],
        ['impact-alert.html', () => generateImpactAlertHtml(loadFixture<ImpactAlertResult>('impact-alert'))],
        [
            'backlog-health.html',
            () =>
                generateBacklogHealthHtml(loadFixture<BacklogHealthResult>('backlog-health'), undefined, GENERATED_AT),
        ],
        ['pipeline-cost.html', () => generatePipelineCostHtml(loadFixture<PipelineCostResult>('pipeline-cost'))],
        [
            'release-score.html',
            () => generateReleaseScoreHtml(loadFixture<ReleaseScoreResult>('release-score'), GENERATED_AT),
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
}

run();
