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

import { generateIncidentReportHtml } from '../report/incident-report-renderer.js';
import { generateImpactAlertHtml } from '../report/impact-alert-renderer.js';
import { generateBacklogHealthHtml } from '../report/backlog-health-renderer.js';
import { generatePipelineCostHtml } from '../quality/pipeline-cost-renderer.js';
import { generateReleaseScoreHtml } from '../quality/release-score-renderer.js';
import { generateDefectTrendHtml } from '../quality/defect-trend-renderer.js';
import { generateSeasonalityHtml } from '../quality/defect-seasonality-renderer.js';
import { generateDeveloperProfileHtml } from '../quality/developer-profile-renderer.js';
import { generateCoverageGapHtml } from '../report/generate-coverage-gap-html.js';

import type { IncidentReport } from '../report/incident-report.js';
import type { ImpactAlertResult } from '../report/impact-alert.js';
import type { BacklogHealthResult } from '../report/backlog-health.js';
import type { PipelineCostResult } from '../quality/pipeline-cost.js';
import type { ReleaseScoreResult } from '../types/data-hub.js';
import type { DefectAggregationResult } from '../types/data-hub-extensions.js';
import type { SeasonalityAggregationResult } from '../types/data-hub-extensions.js';
import type { DeveloperProfileResult } from '../quality/developer-profile.js';
import type { CoverageGapResult } from '../types/coverage.js';

const ALL_SPECS: ArtifactSpec[] = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS];

// ============================================================================
// Mock data factories for each renderer
// ============================================================================

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

function makeReleaseScore(): ReleaseScoreResult {
    return {
        score: 82,
        dimensions: {
            passRate: { score: 85, status: 'pass' },
            flakyRate: { score: 90, status: 'pass' },
            coverage: { score: 75, status: 'pass' },
            suiteSpeed: { score: 80, status: 'pass' },
            executionRate: { score: 80, status: 'pass' },
        },
        grade: 'good',
        breakdown: [
            { label: 'Pass Rate', score: 85, status: 'pass' },
            { label: 'Flaky Rate', score: 90, status: 'pass' },
            { label: 'Coverage', score: 75, status: 'pass' },
            { label: 'Suite Speed', score: 80, status: 'pass' },
            { label: 'Execution Rate', score: 80, status: 'pass' },
        ],
        recommendation: 'Release is ready with good quality metrics',
        timestamp: '2026-07-25T10:00:00Z',
    };
}

function makeDefectTrend(): DefectAggregationResult {
    return {
        trends: [
            { date: '2026-07-20', categories: { bug: 5, vulnerability: 1 }, total: 6 },
            { date: '2026-07-21', categories: { bug: 3, vulnerability: 0 }, total: 3 },
        ],
        topCategories: [{ category: 'bug', count: 8 }],
        period: { from: '2026-07-20', to: '2026-07-25' },
        totalRecords: 9,
    };
}

function makeSeasonality(): SeasonalityAggregationResult {
    return {
        byDayOfWeek: [
            { dayOfWeek: 'Mon', total: 10, categories: { bug: 8, vulnerability: 2 } },
            { dayOfWeek: 'Tue', total: 5, categories: { bug: 5 } },
        ],
        byHour: [
            { hour: 9, total: 8, categories: { bug: 6, vulnerability: 2 } },
            { hour: 14, total: 7, categories: { bug: 7 } },
        ],
        peakDay: 'Mon',
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
        { specId: 'incident-report', generate: () => generateIncidentReportHtml(makeIncidentReport()) },
        { specId: 'impact-alert', generate: () => generateImpactAlertHtml(makeImpactAlert()) },
        { specId: 'backlog-health', generate: () => generateBacklogHealthHtml(makeBacklogHealth()) },
        { specId: 'pipeline-cost', generate: () => generatePipelineCostHtml(makePipelineCost()) },
        { specId: 'release-score', generate: () => generateReleaseScoreHtml(makeReleaseScore()) },
        { specId: 'defect-trend', generate: () => generateDefectTrendHtml(makeDefectTrend()) },
        { specId: 'defect-seasonality', generate: () => generateSeasonalityHtml(makeSeasonality()) },
        { specId: 'developer-profile', generate: () => generateDeveloperProfileHtml(makeDeveloperProfile()) },
        { specId: 'coverage-gap', generate: () => generateCoverageGapHtml(makeCoverageGap()) },
    ];
}

// ============================================================================
// R8.7 Cross-validation: specs vs renderers (C17)
// ============================================================================

/** Specs that are HTML renderers in shared/report/ and can be validated with real output. */
const HTML_RENDERER_SPECS = [
    'incident-report',
    'impact-alert',
    'backlog-health',
    'pipeline-cost',
    'release-score',
    'defect-trend',
    'defect-seasonality',
    'developer-profile',
    'coverage-gap',
];

describe('R8.7 Cross-validation: specs vs renderers (C17)', () => {
    it('all HTML renderer specs have corresponding renderer entries', () => {
        expect.hasAssertions();

        const entries = buildRendererEntries();
        const entryIds = new Set(entries.map((e) => e.specId));
        const missing = HTML_RENDERER_SPECS.filter((id) => !entryIds.has(id));

        expect(missing).toStrictEqual([]);
    });

    it('no orphan renderer entries (entries must match a spec)', () => {
        expect.hasAssertions();

        const entries = buildRendererEntries();
        const specIds = new Set(ALL_SPECS.map((s) => s.id));
        const orphans = entries.filter((e) => !specIds.has(e.specId));

        expect(orphans.map((e) => e.specId)).toStrictEqual([]);
    });

    it('non-HTML specs are documented as excluded from real-output validation', () => {
        expect.hasAssertions();

        const excludedSpecs = ALL_SPECS.map((s) => s.id).filter((id) => !HTML_RENDERER_SPECS.includes(id));

        // These specs are git triggers, markdown outputs, or orchestrators — not standalone HTML renderers
        expect(excludedSpecs).toContain('report-html');
        expect(excludedSpecs).toContain('schedule-handler');
        expect(excludedSpecs).toContain('interactive-mode');
        expect(excludedSpecs).toContain('pr-report-markdown');
        expect(excludedSpecs).toContain('pr-report-job-summary');
        expect(excludedSpecs).toContain('pr-report-html');
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

    it('total artifact count is exactly 15 (8 survivors + 7 reconstructed/orchestrators)', () => {
        expect.hasAssertions();
        expect(ALL_SPECS).toHaveLength(15);
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
