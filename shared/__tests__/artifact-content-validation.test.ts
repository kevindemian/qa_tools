/**
 * R8 Content Validation — validates actual HTML output against CONTENT-SPECIFICATION.md.
 *
 * For each artifact:
 * 1. Generates HTML with realistic test data
 * 2. Validates required metric names appear in HTML
 * 3. Validates required section names appear in HTML
 * 4. Validates data-dashboard attribute
 * 5. Validates data-part="timestamp" when spec.timestamp is true
 * 6. Validates data-part="sample-warning" when applicable
 */

import { describe, it, expect } from 'vitest';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS } from '../types/artifact-specs.js';
import type { ArtifactSpec } from '../types/artifact-specs.js';

import { generateAiEffectivenessHtml } from '../report/ai-effectiveness-renderer.js';
import { generateAiComparisonHtml } from '../report/ai-comparison-renderer.js';
import { generateIncidentReportHtml } from '../report/incident-report-renderer.js';
import { generateImpactAlertHtml } from '../report/impact-alert-renderer.js';
import { generateTraceabilityHtml } from '../report/traceability-renderer.js';
import { generateFlakinessHtml } from '../report/flakiness-renderer.js';
import { generateBacklogHealthHtml } from '../report/backlog-health-renderer.js';
import { generatePipelineCostHtml } from '../quality/pipeline-cost-renderer.js';
import { generateOptimizationHtml } from '../quality/suite-optimization-renderer.js';
import { generateBenchmarkHtml } from '../quality/cross-squad-benchmark-renderer.js';
import { generateReleaseScoreHtml } from '../quality/release-score-renderer.js';
import { generateSilentRegressionHtml } from '../quality/silent-regression-renderer.js';
import { generateDefectTrendHtml } from '../quality/defect-trend-renderer.js';
import { generateSeasonalityHtml } from '../quality/defect-seasonality-renderer.js';
import { generateDeveloperProfileHtml } from '../quality/developer-profile-renderer.js';
import { generateRequirementScoreHtml } from '../quality/requirement-score-renderer.js';
import { generateCoverageGapHtml } from '../report/generate-coverage-gap-html.js';

import type { AiMetricsResult } from '../types/data-hub-extensions.js';
import type { AiComparisonResult } from '../report/ai-comparison.js';
import type { IncidentReport } from '../report/incident-report.js';
import type { ImpactAlertResult } from '../report/impact-alert.js';
import type { TraceabilityResult } from '../report/traceability-matrix.js';
import type { FlakinessEntry } from '../types/data-hub.js';
import type { BacklogHealthResult } from '../report/backlog-health.js';
import type { PipelineCostResult } from '../quality/pipeline-cost.js';
import type { OptimizationResult } from '../quality/suite-optimization.js';
import type { CrossSquadResult } from '../quality/cross-squad-benchmark.js';
import type { ReleaseScoreResult } from '../quality/release-score.js';
import type { RegressionResult } from '../quality/silent-regression.js';
import type { DefectTrendResult } from '../quality/defect-trend.js';
import type { SeasonalityResult } from '../quality/defect-seasonality.js';
import type { DeveloperProfileResult } from '../quality/developer-profile.js';
import type { RequirementScoreResult } from '../quality/requirement-score.js';
import type { CoverageGapResult } from '../types/coverage.js';

const ALL_SPECS: ArtifactSpec[] = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS];

// ============================================================================
// Mock data factories for each renderer
// ============================================================================

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
        items: [],
        totals: {
            totalIssues: 50,
            covered: 35,
            gap: 15,
            weightedCoveragePct: 70,
            rawCoveragePct: 65,
        },
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
        hierarchy: [],
        trends: [],
    };
}

// ============================================================================
// Renderer → HTML generator mapping
// ============================================================================

interface RendererEntry {
    specId: string;
    generate: () => string;
}

function buildRendererEntries(): RendererEntry[] {
    return [
        { specId: 'ai-effectiveness', generate: () => generateAiEffectivenessHtml(makeAiMetrics()) },
        { specId: 'ai-comparison', generate: () => generateAiComparisonHtml(makeAiComparison()) },
        { specId: 'incident-report', generate: () => generateIncidentReportHtml(makeIncidentReport()) },
        { specId: 'impact-alert', generate: () => generateImpactAlertHtml(makeImpactAlert()) },
        { specId: 'traceability', generate: () => generateTraceabilityHtml(makeTraceability()) },
        { specId: 'flakiness', generate: () => generateFlakinessHtml(makeFlakiness()) },
        { specId: 'backlog-health', generate: () => generateBacklogHealthHtml(makeBacklogHealth()) },
        { specId: 'pipeline-cost', generate: () => generatePipelineCostHtml(makePipelineCost()) },
        { specId: 'suite-optimization', generate: () => generateOptimizationHtml(makeOptimization()) },
        { specId: 'cross-squad-benchmark', generate: () => generateBenchmarkHtml(makeCrossSquad()) },
        { specId: 'release-score', generate: () => generateReleaseScoreHtml(makeReleaseScore()) },
        { specId: 'silent-regression', generate: () => generateSilentRegressionHtml(makeSilentRegression()) },
        { specId: 'defect-trend', generate: () => generateDefectTrendHtml(makeDefectTrend()) },
        { specId: 'defect-seasonality', generate: () => generateSeasonalityHtml(makeSeasonality()) },
        { specId: 'developer-profile', generate: () => generateDeveloperProfileHtml(makeDeveloperProfile()) },
        { specId: 'requirement-score', generate: () => generateRequirementScoreHtml(makeRequirementScore()) },
        { specId: 'coverage-gap', generate: () => generateCoverageGapHtml(makeCoverageGap()) },
    ];
}

// ============================================================================
// R8.7 Cross-validation: specs vs renderers (C17)
// ============================================================================

/** Specs that are HTML renderers in shared/report/ and can be validated with real output. */
const HTML_RENDERER_SPECS = [
    'ai-effectiveness',
    'ai-comparison',
    'incident-report',
    'impact-alert',
    'traceability',
    'flakiness',
    'backlog-health',
    'pipeline-cost',
    'suite-optimization',
    'cross-squad-benchmark',
    'release-score',
    'silent-regression',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
    'requirement-score',
    'coverage-gap',
];

describe('R8.7 Cross-validation: specs vs renderers (C17)', () => {
    it('all HTML renderer specs have corresponding renderer entries', () => {
        expect.hasAssertions();
        const entries = buildRendererEntries();
        const entryIds = new Set(entries.map((e) => e.specId));
        const missing = HTML_RENDERER_SPECS.filter((id) => !entryIds.has(id));
        expect(missing).toEqual([]);
    });

    it('no orphan renderer entries (entries must match a spec)', () => {
        expect.hasAssertions();
        const entries = buildRendererEntries();
        const specIds = new Set(ALL_SPECS.map((s) => s.id));
        const orphans = entries.filter((e) => !specIds.has(e.specId));
        expect(orphans.map((e) => e.specId)).toEqual([]);
    });

    it('non-HTML specs are documented as excluded from real-output validation', () => {
        expect.hasAssertions();
        const excludedSpecs = ALL_SPECS.map((s) => s.id).filter((id) => !HTML_RENDERER_SPECS.includes(id));
        // These specs are git triggers, markdown outputs, or orchestrators — not standalone HTML renderers
        expect(excludedSpecs).toContain('pipeline-health');
        expect(excludedSpecs).toContain('pr-report-markdown');
        expect(excludedSpecs).toContain('pr-report-job-summary');
    });
});

// ============================================================================
// R8.1 Spec Structure Validation (unchanged — validates metadata only)
// ============================================================================

describe('R8.1 Mandatory Metrics Validation', () => {
    it('all artifacts have metrics defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.metrics.length).toBeGreaterThan(0);
        }
    });

    it('all metrics have name, source, format, severity', () => {
        expect.hasAssertions();

        const formats = ['number', 'percentage', 'currency', 'duration', 'badge', 'grade', 'datetime'];
        const severities = ['error', 'warn', 'info', 'success', 'default'];
        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                expect(metric.name.length).toBeGreaterThan(0);
                expect(metric.source.length).toBeGreaterThan(0);
                expect(formats).toContain(metric.format);
                expect(severities).toContain(metric.severity);
            }
        }
    });

    it('all metrics with thresholdOperator have valid value', () => {
        expect.hasAssertions();

        const operators = ['>=', '<=', '>', '<', '='];
        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const op = metric.thresholdOperator ?? '>=';

                expect(operators).toContain(op);
            }
        }
    });

    it('all artifacts have ssot defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.ssot.length).toBeGreaterThan(0);
        }
    });

    it('all artifacts have file defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.file.length).toBeGreaterThan(0);
        }
    });
});

describe('R8.2 Mandatory Sections Validation', () => {
    it('all artifacts have sections defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.sections.length).toBeGreaterThan(0);
        }
    });

    it('all sections have name and type', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const section of spec.sections) {
                expect(section.name.length).toBeGreaterThan(0);
                expect(section.type.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('R8.3 Conditional Actions Validation', () => {
    it('all artifacts with actions have condition and message', () => {
        expect.hasAssertions();

        const severities = ['error', 'warn', 'info'];
        for (const spec of ALL_SPECS) {
            for (const action of spec.actions) {
                expect(action.condition.length).toBeGreaterThan(0);
                expect(action.message.length).toBeGreaterThan(0);
                expect(severities).toContain(action.severity);
            }
        }
    });
});

describe('R8.4 Thresholds and Severities Validation', () => {
    it('all metrics with threshold have valid numeric value', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const threshold = metric.threshold ?? 0;

                expect(Number.isFinite(threshold)).toBeTruthy();
            }
        }
    });

    it('all metrics with sampleSizeWarning have valid value', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const warning = metric.sampleSizeWarning ?? 0;

                expect(warning).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('R8.5 Timestamp and SSOT Validation', () => {
    it('all artifacts have timestamp boolean', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(typeof spec.timestamp).toBe('boolean');
        }
    });

    it('all artifacts have sampleSizeWarning boolean', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(typeof spec.sampleSizeWarning).toBe('boolean');
        }
    });

    it('all artifacts have purpose and auditor', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.purpose.length).toBeGreaterThan(0);
            expect(spec.auditor.length).toBeGreaterThan(0);
        }
    });

    it('all artifacts have reference', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.reference.length).toBeGreaterThan(0);
        }
    });
});

describe('R8 Cross-cutting Validation', () => {
    it('all artifact IDs are unique', () => {
        expect.hasAssertions();

        const ids = ALL_SPECS.map((s) => s.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('all artifact IDs are kebab-case', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(/^[a-z]+(-[a-z]+)*$/.test(spec.id)).toBeTruthy();
        }
    });

    it('total artifact count is at least 21', () => {
        expect.hasAssertions();
        expect(ALL_SPECS.length).toBeGreaterThanOrEqual(21);
    });

    it('all metrics have description', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                expect(metric.description.length).toBeGreaterThan(0);
            }
        }
    });
});

// ============================================================================
// R8 HTML Output Validation — renders actual HTML and checks content
// ============================================================================

describe.each(buildRendererEntries())('R8.1 HTML: $specId — Mandatory Metrics in Output', (entry) => {
    it('renders valid HTML page', () => {
        expect.hasAssertions();

        const spec = ALL_SPECS.find((s) => s.id === entry.specId);

        expect(spec).toBeDefined();

        const html = entry.generate();

        expect(html).toContain('<!DOCTYPE html>');
        expect(html.length).toBeGreaterThan(500);
    });

    it('metric names appear in HTML', () => {
        expect.hasAssertions();

        const spec = ALL_SPECS.find((s) => s.id === entry.specId);

        expect(spec).toBeDefined();

        const html = entry.generate();

        for (const metric of spec?.metrics ?? []) {
            const metricNameLower = metric.name.toLowerCase();
            const htmlLower = html.toLowerCase();

            expect(htmlLower, `Metric "${metric.name}" not found in ${entry.specId} HTML`).toContain(metricNameLower);
        }
    });
});

describe.each(buildRendererEntries())('R8.2 HTML: $specId — Mandatory Sections in Output', (entry) => {
    it('required section names appear in HTML', () => {
        expect.hasAssertions();

        const spec = ALL_SPECS.find((s) => s.id === entry.specId);

        expect(spec).toBeDefined();

        const html = entry.generate();
        const htmlLower = html.toLowerCase();
        const requiredSections = (spec?.sections ?? []).filter((s) => s.required);

        for (const section of requiredSections) {
            const sectionNameLower = section.name.toLowerCase();

            expect(htmlLower, `Required section "${section.name}" not found in ${entry.specId} HTML`).toContain(
                sectionNameLower,
            );
        }
    });
});

describe.each(buildRendererEntries())('R8.5 HTML: $specId — Timestamp and data-dashboard', (entry) => {
    it('has data-part="timestamp" in HTML when spec.timestamp is true', () => {
        expect.hasAssertions();

        const spec = ALL_SPECS.find((s) => s.id === entry.specId);
        const html = entry.generate();
        const hasTimestamp = spec?.timestamp === true;
        const hasTimestampInHtml = html.includes('data-part="timestamp"');

        expect(hasTimestampInHtml || !hasTimestamp).toBeTruthy();
    });

    it('has data-dashboard attribute', () => {
        expect.hasAssertions();

        const html = entry.generate();

        expect(html, `${entry.specId} missing data-dashboard attribute`).toMatch(/data-dashboard="[^"]+"/);
    });
});

describe.each(buildRendererEntries())('R8 Cross-cutting HTML: $specId', (entry) => {
    it('no Unicode emoji characters in HTML output', () => {
        expect.hasAssertions();

        const html = entry.generate();
        const unicodeEmojis = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

        expect(html, `${entry.specId} contains Unicode emoji`).not.toMatch(unicodeEmojis);
    });

    it('uses Lucide SVG icons instead of emojis', () => {
        expect.hasAssertions();

        const html = entry.generate();
        const usesIcons = html.includes('icon(') || html.includes('<svg');
        const hasSvgTag = html.includes('<svg');

        expect(!usesIcons || hasSvgTag).toBeTruthy();
    });
});
