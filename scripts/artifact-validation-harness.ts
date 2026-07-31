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
import { exportTestsCsv, exportTestsJson } from '../shared/report/report-export.js';
import { mdToHtml } from '../shared/report/markdown.js';
import type { AiMetricsResult } from '../shared/types/data-hub-extensions.js';
import type { AiComparisonResult } from '../shared/report/ai-comparison.js';
import type { IncidentReport } from '../shared/report/incident-report.js';
import type { ImpactAlertResult } from '../shared/report/impact-alert.js';
import type { TraceabilityResult } from '../shared/report/traceability-matrix.js';
import type { FlakinessEntry } from '../shared/types/data-hub.js';
import type { BacklogHealthResult } from '../shared/report/backlog-health.js';
import type { PipelineCostResult } from '../shared/quality/pipeline-cost.js';
import type { OptimizationResult } from '../shared/quality/suite-optimization.js';
import type { CrossSquadResult } from '../shared/quality/cross-squad-benchmark.js';
import type { ReleaseScoreResult } from '../shared/quality/release-score.js';
import type { RegressionResult } from '../shared/quality/silent-regression.js';
import type { DefectTrendResult } from '../shared/quality/defect-trend.js';
import type { SeasonalityResult } from '../shared/quality/defect-seasonality.js';
import type { DeveloperProfileResult } from '../shared/quality/developer-profile.js';
import type { RequirementScoreResult } from '../shared/quality/requirement-score.js';
import type { CoverageGapResult } from '../shared/types/coverage.js';
import type { FlatTest } from '../shared/result_parser.js';

const OUT_DIR = join(import.meta.dirname, '..', 'reports', 'validation');

function write(name: string, html: string): void {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, name), html);
    const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
    const doctype = html.startsWith('<!DOCTYPE html>') ? 'ok' : 'MISSING';
    const err = html.includes('Error generating') || html.includes('FAILED') ? 'ERROR-PAGE' : '';
    console.log(`${name.padEnd(45)} ${kb.padStart(8)}KB  doctype=${doctype} ${err}`);
}

function makeAiMetrics(): AiMetricsResult {
    return {
        acceptanceRate: 75,
        totalRecords: 50,
        totalGenerated: 50,
        totalKept: 35,
        totalModified: 10,
        totalDeleted: 5,
        topPromptVersion: 'v2.1',
        byVersion: [
            { version: 'v2.1', count: 30, acceptanceRate: 80 },
            { version: 'v1.0', count: 20, acceptanceRate: 65 },
        ],
        trend: [
            { date: '2026-07-01', acceptanceRate: 70, generated: 25 },
            { date: '2026-07-02', acceptanceRate: 80, generated: 25 },
        ],
        requirementScores: { 'REQ-001': 90, 'REQ-002': 60 },
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeAiComparison(): AiComparisonResult {
    return {
        aiTotal: 30,
        aiPassRate: 80,
        aiFlakinessAvg: 0.1,
        aiAcceptanceRate: 75,
        manualTotal: 20,
        manualPassRate: 65,
        manualFlakinessAvg: 0.2,
        manualAcceptanceRate: 60,
        aiAdvantage: 'pass_rate',
        byVersion: [
            { version: 'v2.1', count: 20, passRate: 85 },
            { version: 'v1.0', count: 10, passRate: 70 },
        ],
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeIncidentReport(): IncidentReport {
    return {
        events: [
            {
                date: '2026-07-25T10:00:00Z',
                type: 'failure',
                title: 'Pipeline failure on main',
                description: 'CI pipeline failed 3 times consecutively',
                severity: 'high',
            },
        ],
        eventCount: 1,
        highCount: 1,
        mediumCount: 0,
        lowCount: 0,
        summary: '1 high severity incident detected',
        overallSeverity: 'high',
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeImpactAlert(): ImpactAlertResult {
    return {
        alerts: [
            {
                severity: 'critical',
                title: 'Critical pipeline failure',
                message: 'Pipeline main failed 3 times consecutively',
                affectedArea: 'CI/CD Pipeline',
                recommendation: 'Check recent commits and rollback if necessary',
            },
        ],
        criticalCount: 1,
        warningCount: 0,
        infoCount: 0,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeTraceability(): TraceabilityResult {
    return {
        nodes: [
            {
                epic: 'AUTH',
                coverage: 80,
                health: 75,
                flakiness: 0.1,
                stories: [
                    {
                        key: 'LOGIN',
                        coverage: 100,
                        health: 100,
                        flakiness: 0,
                        tests: [
                            { title: 'test-login-1', status: 'passed', duration: 100, flakiness: 0 },
                            { title: 'test-login-2', status: 'passed', duration: 120, flakiness: 0 },
                        ],
                    },
                ],
            },
            {
                epic: 'PAYMENT',
                coverage: 50,
                health: 60,
                flakiness: 0.2,
                stories: [],
            },
        ],
        totalEpics: 2,
        totalTests: 5,
        overallCoverage: 65,
        timestamp: '2026-07-25T10:00:00Z',
        awareness: {
            categories: [
                {
                    category: 'coverageFiles',
                    entities: [{ id: 'AUTH', confidence: 0.9, valid: true }],
                },
            ],
            minConfidence: 0.7,
        },
    };
}

function makeFlakiness(): FlakinessEntry[] {
    return [
        {
            title: 'test-login',
            project: 'auth',
            passCount: 7,
            failCount: 3,
            skipCount: 0,
            totalRuns: 10,
            rate: 0.3,
        },
        {
            title: 'test-checkout',
            project: 'payments',
            passCount: 5,
            failCount: 5,
            skipCount: 0,
            totalRuns: 10,
            rate: 0.5,
        },
    ];
}

function makeBacklogHealth(): BacklogHealthResult {
    return {
        unassignedIssues: [],
        staleIssues: [
            {
                key: 'JIRA-1',
                summary: 'Old bug',
                assignee: 'unassigned',
                updated: '2026-04-01T10:00:00Z',
                type: 'bug',
                priority: 'High',
                linkedTestCount: 0,
                epic: 'AUTH',
            },
        ],
        bugsWithoutTests: [],
        densityByEpic: [{ epic: 'AUTH', bugCount: 5, testCount: 20 }],
        totalIssues: 50,
        score: 72,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makePipelineCost(): PipelineCostResult {
    return {
        totalCost: 125.5,
        avgCostPerRun: 25.1,
        totalDurationSec: 3600,
        costPerMinute: 0.21,
        costByRun: [{ timestamp: '2026-07-25T10:00:00Z', durationSec: 720, cost: 25.1, status: 'success' }],
        runCount: 5,
        period: { from: '2026-07-20', to: '2026-07-25' },
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeOptimization(): OptimizationResult {
    return {
        optimizations: [
            {
                testTitle: 'test-slow-integration',
                duration: 300,
                flakiness: 0.3,
                impact: 'high',
                action: 'parallelize',
                reason: 'Long duration and high flakiness',
            },
        ],
        totalTests: 50,
        totalDuration: 3600,
        potentialSavings: 600,
        slowThreshold: 60,
        flakyThreshold: 0.2,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeCrossSquad(): CrossSquadResult {
    return {
        benchmarks: [
            {
                project: 'Frontend',
                healthScore: 85,
                grade: 'A',
                passRate: 90,
                flakyRate: 5,
                coveragePct: 80,
                runCount: 50,
                trend: 'up',
            },
            {
                project: 'Backend',
                healthScore: 72,
                grade: 'B',
                passRate: 80,
                flakyRate: 10,
                coveragePct: 65,
                runCount: 40,
                trend: 'stable',
            },
        ],
        topSquad: 'Frontend',
        bottomSquad: 'Backend',
        averageScore: 78.5,
        stdDev: 9.2,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeReleaseScore(): ReleaseScoreResult {
    return {
        score: 82,
        grade: 'good',
        breakdown: [
            { label: 'Task Completion', score: 85, status: 'pass' },
            { label: 'Health Score', score: 80, status: 'pass' },
            { label: 'Coverage', score: 75, status: 'pass' },
            { label: 'Flakiness', score: 90, status: 'pass' },
        ],
        recommendation: 'Release is ready with good quality metrics',
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeSilentRegression(): RegressionResult {
    return {
        regressions: [
            {
                title: 'test-login',
                meanDuration: 100,
                currentDuration: 200,
                stdDev: 10,
                zScore: 10,
                severity: 'high',
                previousDurations: [100, 105, 95, 110, 100],
            },
        ],
        totalTests: 50,
        threshold: 2,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeDefectTrend(): DefectTrendResult {
    return {
        trends: [
            { date: '2026-07-20', categories: { bug: 5, vulnerability: 1 }, total: 6 },
            { date: '2026-07-21', categories: { bug: 3, vulnerability: 0 }, total: 3 },
        ],
        topCategories: [{ category: 'bug', count: 8 }],
        period: { from: '2026-07-20', to: '2026-07-25' },
    };
}

function makeSeasonality(): SeasonalityResult {
    return {
        byDayOfWeek: [
            { dayOfWeek: 'Monday', total: 10, categories: { bug: 8, vulnerability: 2 } },
            { dayOfWeek: 'Tuesday', total: 5, categories: { bug: 5 } },
        ],
        byHour: [
            { hour: 9, total: 8, categories: { bug: 6, vulnerability: 2 } },
            { hour: 14, total: 7, categories: { bug: 7 } },
        ],
        peakDay: 'Monday',
        peakHour: 9,
        totalRecords: 50,
        period: { from: '2026-07-20', to: '2026-07-25' },
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeDeveloperProfile(): DeveloperProfileResult {
    return {
        authors: [
            {
                author: 'Alice',
                totalFailures: 10,
                categories: { bug: 8, vulnerability: 2 },
                testsTouched: 50,
                failureRate: 0.2,
                topFailureCategory: 'bug',
            },
            {
                author: 'Bob',
                totalFailures: 5,
                categories: { bug: 5 },
                testsTouched: 30,
                failureRate: 0.17,
                topFailureCategory: 'bug',
            },
        ],
        totalAuthors: 2,
        totalFailures: 15,
        topContributor: 'Alice',
        topFailureAuthor: 'Alice',
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeRequirementScore(): RequirementScoreResult {
    return {
        entries: [
            {
                requirementId: 'REQ-001',
                userStory: 'As a user I want to login',
                totalTests: 10,
                keptTests: 8,
                modifiedTests: 1,
                deletedTests: 1,
                acceptanceRate: 85,
                score: 90,
                scoreGrade: 'A',
                promptVersion: 'v2.1',
            },
        ],
        totalRequirements: 1,
        overallScore: 90,
        overallGrade: 'A',
        averageAcceptanceRate: 85,
        totalGenerated: 10,
        totalKept: 8,
        totalModified: 1,
        totalDeleted: 1,
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeCoverageGap(): CoverageGapResult {
    return {
        items: [
            {
                issueKey: 'AUTH-100',
                summary: 'Implement 2FA enrollment flow',
                type: 'Story',
                status: 'In Progress',
                epicKey: 'AUTH',
                epicSummary: 'Auth coverage',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'High',
                coverageWeight: 3,
            },
            {
                issueKey: 'PAY-200',
                summary: 'Payment webhook retry on 5xx',
                type: 'Task',
                status: 'Done',
                epicKey: 'PAYMENT',
                epicSummary: 'Payment coverage',
                hasTest: false,
                linkedTestKeys: [],
                priority: 'Medium',
                coverageWeight: 2,
            },
        ],
        totals: { totalIssues: 50, covered: 35, gap: 15, weightedCoveragePct: 70, rawCoveragePct: 65 },
        byEpic: {
            AUTH: {
                epicSummary: 'Auth coverage',
                total: 20,
                covered: 18,
                weightedPct: 90,
                rawPct: 85,
                gatePass: true,
                issues: [],
            },
            PAYMENT: {
                epicSummary: 'Payment coverage',
                total: 15,
                covered: 10,
                weightedPct: 67,
                rawPct: 60,
                gatePass: false,
                issues: [],
            },
        },
        gateConfig: { minCoveragePct: 70, failingEpics: ['PAYMENT'] },
        hierarchy: [
            {
                key: 'EPIC-AUTH',
                summary: 'Authentication Module',
                type: 'Epic',
                totalIssues: 20,
                coveredIssues: 18,
                coveragePct: 90,
                children: [
                    {
                        key: 'STORY-LOGIN',
                        summary: 'Login flows',
                        type: 'Story',
                        totalIssues: 10,
                        coveredIssues: 8,
                        coveragePct: 80,
                        children: [],
                    },
                ],
            },
        ],
        trends: [],
    };
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
        ['ai-effectiveness.html', () => generateAiEffectivenessHtml(makeAiMetrics())],
        ['ai-comparison.html', () => generateAiComparisonHtml(makeAiComparison())],
        ['incident-report.html', () => generateIncidentReportHtml(makeIncidentReport())],
        ['impact-alert.html', () => generateImpactAlertHtml(makeImpactAlert())],
        ['traceability.html', () => generateTraceabilityHtml(makeTraceability())],
        ['flakiness.html', () => generateFlakinessHtml(makeFlakiness())],
        ['backlog-health.html', () => generateBacklogHealthHtml(makeBacklogHealth())],
        ['pipeline-cost.html', () => generatePipelineCostHtml(makePipelineCost())],
        ['suite-optimization.html', () => generateOptimizationHtml(makeOptimization())],
        ['cross-squad-benchmark.html', () => generateBenchmarkHtml(makeCrossSquad())],
        ['release-score.html', () => generateReleaseScoreHtml(makeReleaseScore())],
        ['silent-regression.html', () => generateSilentRegressionHtml(makeSilentRegression())],
        ['defect-trend.html', () => generateDefectTrendHtml(makeDefectTrend())],
        ['defect-seasonality.html', () => generateSeasonalityHtml(makeSeasonality())],
        ['developer-profile.html', () => generateDeveloperProfileHtml(makeDeveloperProfile())],
        ['requirement-score.html', () => generateRequirementScoreHtml(makeRequirementScore())],
        ['coverage-gap.html', () => generateCoverageGapHtml(makeCoverageGap())],
        ['test-report.html', () => generateHtmlReport(makeFlatTests())],
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
        write('pipeline-health.html', renderPipelineHealthHtml(pipelineData));
    } catch (err) {
        console.log(`pipeline-health.html${' '.repeat(27)} ERROR: ${(err as Error).message}`);
    }

    try {
        const flakyNoHub = generateFlakinessHtml(makeFlakiness(), 'Flakiness (no DataHub)');
        write('flakiness-no-datahub.html', flakyNoHub);
    } catch (err) {
        console.log(`flakiness-no-datahub.html${' '.repeat(23)} ERROR: ${(err as Error).message}`);
    }
}

run();
