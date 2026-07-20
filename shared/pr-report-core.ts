/**
 * PR Report core — library module for generating PR test reports.
 *
 * This module is layer-pure: it MUST NOT import from git_triggers/ (upward
 * layer). The Git provider factory is injected by the caller via main().
 *
 * Programmatic API:
 *   import { generatePrReport, computeDiffComparison, main } from './pr-report-core.js'
 *
 * Entry point (injected provider, no upward dependency):
 *   git_triggers/main.ts — dispatch 'pr-report' calls main(createGitProvider)
 *
 * Consumido por:
 *   1. CLI (ator principal) — via git_triggers/main.ts (dispatch 'pr-report')
 *   2. Pipeline (git_triggers/batch-mode.ts) — post-test-collection
 *   3. Tests — invocação direta
 *
 * Data sources (all via DataHub — SSOT):
 *   - Coverage: DataHub.raw.coverage (Istanbul/CTRF/JUnit from external project artifacts)
 *   - Flaky rate: DataHub.computed.flakinessEntries (pre-computed from parsedArtifacts)
 *   - Trends: DataHub.computed.metricsTrends (pre-computed from parsedArtifacts)
 *   - Test data: DataHub.computed.metricsRuns (parsed from external project CI artifacts)
 *
 * CTRF/junit/mochawesome files are NEVER read directly — DataHub fetches and parses
 * artifacts via GitHub/GitLab API. This avoids self-referencing (qa_tools reading its own test output).
 */
import fs from 'node:fs';
import path from 'path';
import { rootLogger } from './logger.js';
import { formatErr } from './errors.js';
import { getDataHub, setDataHub, isDataHubInitialized } from './data-hub/global-hub.js';
import { calcRunPassRate } from './data-hub/compute/run-pass-rate.js';
import { runQualityGate } from './quality/quality-gate.js';
import type { QualityGateStatus } from './quality/quality-gate.js';
import { createCheckRun } from './ci/github-check-run.js';
import { postPrComment } from './ci/github-pr-comment.js';
import { generateHtmlReport } from './report/report-html.js';
import type { ReportOptions } from './report/report-types.js';
import { calculateHealthScore } from './quality/health-score.js';
import type { FlatTest, ParseResult } from './result_parser.js';
import { getPrReportConfig } from './feature-config.js';
import type { DataHub, MetricsRun } from './types/data-hub.js';
import { askTestSource, DATAHUB_ERRORS } from './data-hub/test-source-fallback.js';
import { createDataHubFromParseResult } from './data-hub/factory.js';
import { DataHubImpl } from './data-hub/hub.js';
import { summarizeDataQuality } from './quality/data-quality.js';
import type { DataQualitySummary } from './quality/data-quality.js';

/**
 * Read CI-injected environment variables with typed fallbacks.
 * These are GitHub Actions runtime vars, not user configuration.
 */
function getCiEnv(): { serverUrl: string; repo: string; runId: string; refName: string; isCI: boolean } {
    return {
        serverUrl: process.env['GITHUB_SERVER_URL'] ?? 'https://github.com',
        repo: process.env['GITHUB_REPOSITORY'] ?? 'unknown',
        runId: process.env['GITHUB_RUN_ID'] ?? '0',
        refName: process.env['GITHUB_REF_NAME'] ?? '',
        /** True when running inside GitHub Actions or GitLab CI. */
        isCI: !!(process.env['GITHUB_ACTIONS'] || process.env['CI']),
    };
}

export interface PrReportStats {
    passed: number;
    failed: number;
    skipped: number;
    total: number;
    duration: number;
}

export interface DiffComparison {
    newFailures: FlatTest[];
    newPasses: FlatTest[];
    flaky: FlatTest[];
}

export interface PrReportCoreOptions {
    tests: FlatTest[];
    stats: PrReportStats;
    /** Project name used to persist the current run before health score calculation. */
    project?: string;
    skipAi?: boolean;
    skipQuality?: boolean;
    skipFlaky?: boolean;
    htmlOutputPath?: string;
    diffComparison?: DiffComparison;
    /** CI environment context — used to render CI Context section in PR comment. */
    ciEnv?: { isCI: boolean; repo: string; runId: string; refName: string; serverUrl: string };
    /** Data Hub — SSOT obrigatório. Toda métrica vem do DataHub; nunca opcional. */
    dataHub: DataHub;
}

export interface PrReportResult {
    htmlPath?: string;
    checkRunId?: string;
    commentUrl?: string;
    healthScore: ReturnType<typeof calculateHealthScore>;
    passRate: number;
    /** EIXO C awareness: data-quality summary of the unified model consumed by this report. */
    dataQuality?: DataQualitySummary;
}

/**
 * Compare current test run against a previous run, returning new failures, fixes, and flaky tests.
 * Returns undefined when both runs are identical.
 */
export function computeDiffComparison(current: FlatTest[], previous: FlatTest[]): DiffComparison | undefined {
    if (previous.length === 0) return undefined;

    const prevByTitle = new Map<string, FlatTest>();
    for (const t of previous) {
        prevByTitle.set(t.title, t);
    }

    const currByTitle = new Map<string, FlatTest>();
    for (const t of current) {
        currByTitle.set(t.title, t);
    }

    const newFailures: FlatTest[] = [];
    const newPasses: FlatTest[] = [];
    const flaky: FlatTest[] = [];

    for (const [title, test] of currByTitle) {
        const prev = prevByTitle.get(title);
        if (!prev) continue;

        const currFailed = test.state === 'failed';
        const prevFailed = prev.state === 'failed';

        if (currFailed && !prevFailed) {
            newFailures.push(test);
        } else if (!currFailed && prevFailed) {
            newPasses.push(test);
        }

        if (test.state !== prev.state) {
            flaky.push(test);
        }
    }

    if (newFailures.length === 0 && newPasses.length === 0 && flaky.length === 0) {
        return undefined;
    }

    return { newFailures, newPasses, flaky };
}

function buildSummaryTable(stats: PrReportStats): string {
    const passRate = calcRunPassRate({ passed: stats.passed, failed: stats.failed }).toFixed(1);
    const durationSec = (stats.duration / 1000).toFixed(1);

    return [
        '## 📊 Test Results',
        '',
        '| ✅ Passed | ❌ Failed | ⏭ Skipped | 📦 Total | ⏱ Duration | 📈 Pass Rate |',
        '|---|---|---|---|---|---|',
        `| ${stats.passed} | ${stats.failed} | ${stats.skipped} | ${stats.total} | ${durationSec}s | ${passRate}% |`,
        '',
    ].join('\n');
}

function buildFailureTable(tests: FlatTest[]): string {
    const failed = tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) return '';

    const rows = failed.map((t) => {
        const error = t.error ? t.error.replace(/\n/g, ' ').slice(0, MAX_ERROR_LENGTH) : '';
        return `| ${t.title.replace(/\|/g, '\\|')} | ${t.duration}ms | ${error.replace(/\|/g, '\\|')} |`;
    });

    const maxRows = 50;
    const truncated = rows.length > maxRows;
    const displayRows = truncated ? rows.slice(0, maxRows) : rows;

    return [
        '',
        '### ❌ Failed Tests',
        '',
        '| Test | Duration | Error |',
        '|---|---|---|',
        ...displayRows,
        ...(truncated ? [`| _... and ${rows.length - maxRows} more_ | | |`] : []),
        '',
    ].join('\n');
}

/**
 * Build flaky tests section for PR comment.
 * Uses DataHub.computed.flakinessEntries as SSOT — no direct MetricsStore access.
 * Quarantine status comes from quarantine store (separate concern, not CTRF).
 *
 * @param dataHub - DataHub instance with pre-computed flakiness entries
 * @returns Markdown section string, or empty string if no high-flaky tests found
 */
function buildFlakySection(dataHub: DataHub): string {
    try {
        const flakyEntries = dataHub.computed.flakinessEntries ?? [];
        const highFlaky = flakyEntries.filter((e) => e.rate >= 0.3);

        if (highFlaky.length === 0) return '';

        const rows = highFlaky.map((t) => {
            const quarantined = dataHub.getQuarantine().entries.some((e) => e.testTitle === t.title);
            const status = quarantined ? '🔒 Quarantined' : '⚠️ New';
            return [
                `| ${t.title.replace(/\|/g, '\\|')}`,
                `${(t.rate * 100).toFixed(0)}%`,
                `${t.passCount}/${t.totalRuns}`,
                `${status} |`,
            ].join(' | ');
        });

        const newFlaky = highFlaky.filter((t) => !dataHub.getQuarantine().entries.some((e) => e.testTitle === t.title));
        const suggestion =
            newFlaky.length > 0
                ? `\n> 💡 ${newFlaky.length} flaky test(s) not yet quarantined. Consider adding them to quarantine to reduce CI noise.\n`
                : '';

        return [
            '',
            '## ⚠️ Flaky Tests (rate ≥ 30%)',
            '',
            '| Test | Flaky Rate | Passed/Total | Quarantine |',
            '|---|---|---|---|',
            ...rows,
            suggestion,
            '',
        ].join('\n');
    } catch (err) {
        rootLogger.warn(`buildFlakySection error: ${String(err)}`);
        return '';
    }
}

function buildAiAnalysisSection(): string {
    return [
        '',
        '### 🤖 AI Failure Analysis',
        '',
        'AI-powered failure analysis with classification, self-consistency, and attribution ',
        'is available when LLM is configured (`LLM_API_KEY`).',
        '',
    ].join('\n');
}

/**
 * D2 FIX: Build CI context section for the PR comment.
 *
 * When running inside CI (GitHub Actions), the post-processing step may run
 * via `if: always()` — meaning it executes even when previous steps fail.
 * In this case, "0 test failures" is technically accurate but can be misleading
 * because the CI pipeline itself may have failed in a post-test step.
 *
 * This section makes the CI context explicit so reviewers understand that
 * test results and CI status may differ.
 */
function buildCiContextSection(
    ciEnv: { isCI: boolean; repo: string; runId: string; refName: string; serverUrl: string },
    _stats: PrReportStats,
): string {
    if (!ciEnv.isCI) return '';

    const workflowUrl =
        ciEnv.repo !== 'unknown' && ciEnv.runId !== '0'
            ? `${ciEnv.serverUrl}/${ciEnv.repo}/actions/runs/${ciEnv.runId}`
            : undefined;

    const lines: string[] = ['', '### 🔧 CI Context', ''];

    if (workflowUrl) {
        lines.push(`- **Workflow:** [Run #${ciEnv.runId}](${workflowUrl})`);
    }
    if (ciEnv.refName) {
        lines.push(`- **Branch:** \`${ciEnv.refName}\``);
    }
    if (ciEnv.repo !== 'unknown') {
        lines.push(`- **Repository:** ${ciEnv.repo}`);
    }

    lines.push(
        '',
        '> ℹ️ This report reflects **test execution results** only.',
        '> CI pipeline status may differ if post-test steps (upload, quality gate, etc.) failed.',
        '',
    );

    return lines.join('\n');
}

/**
 * PRUX-1a: Write the PR report summary to GitHub Actions Job Summary.
 *
 * When running inside GitHub Actions, writes a Markdown summary to
 * $GITHUB_STEP_SUMMARY so the report is visible inline on the workflow
 * run page — no clicks or downloads required.
 *
 * The summary is generated INDEPENDENTLY from the PR comment sections array,
 * preventing fragile index-based coupling. Uses raw stats data to build a
 * compact single-table view.
 *
 * @param stats - Parsed test stats (passed, failed, skipped, total, duration)
 * @param htmlArtifactUrl - URL to download the HTML report artifact (when available)
 */
function writeToJobSummary(stats: PrReportStats, htmlArtifactUrl?: string): void {
    if (process.env['VITEST']) return;
    const stepSummaryPath = process.env['GITHUB_STEP_SUMMARY'];
    if (!stepSummaryPath) return;

    try {
        const passRate = calcRunPassRate({ passed: stats.passed, failed: stats.failed }).toFixed(1);
        const durationSec = (stats.duration / 1000).toFixed(1);
        const lines: string[] = [
            '## 📊 QA Tools — PR Report',
            '',
            '| ✅ Passed | ❌ Failed | ⏭ Skipped | 📦 Total | ⏱ Duration | 📈 Pass Rate |',
            '|---|---|---|---|---|---|',
            `| ${stats.passed} | ${stats.failed} | ${stats.skipped} | ${stats.total} | ${durationSec}s | ${passRate}% |`,
        ];

        if (htmlArtifactUrl) {
            lines.push('', `📄 [Download full HTML report](${htmlArtifactUrl})`);
        }
        lines.push('', `_${new Date().toISOString()}_`, '');

        fs.writeFileSync(path.resolve(stepSummaryPath), lines.join('\n'), 'utf8');
        rootLogger.info('Job summary written to $GITHUB_STEP_SUMMARY');
    } catch (err) {
        rootLogger.warn(`Failed to write job summary: ${String(err)}`);
    }
}

function persistCurrentRun(tests: FlatTest[], stats: PrReportStats, project?: string): void {
    if (!project) return;
    if (!isDataHubInitialized()) return;
    const parseResult: ParseResult = {
        tests,
        stats: {
            passed: stats.passed,
            failed: stats.failed,
            skipped: stats.skipped,
            total: stats.total,
            duration: stats.duration,
        },
    };
    const hub = getDataHub();
    hub.saveParseResult(project, parseResult);
}

function resolveCiUrls(): { workflowUrl?: string; artifactUrl?: string } {
    const ghServer = process.env['GITHUB_SERVER_URL'];
    const ghRepo = process.env['GITHUB_REPOSITORY'];
    const ghRunId = process.env['GITHUB_RUN_ID'];
    const url = ghServer && ghRepo && ghRunId ? `${ghServer}/${ghRepo}/actions/runs/${ghRunId}` : undefined;
    return url ? { workflowUrl: url, artifactUrl: `${url}?pr=1#artifacts` } : {};
}

async function handleQualityGate(
    healthScore: ReturnType<typeof calculateHealthScore>,
    dataHub: DataHub,
    artifactUrl?: string,
    coverageOverride?: number,
): Promise<string | undefined> {
    try {
        const qgResult = runQualityGate({ coverageOverride, dataHub });
        const gradeStr = healthScore.grade.replace(/_/g, ' ').toUpperCase();
        const checkSummary = buildQGCHeckSummary(qgResult, gradeStr, artifactUrl);

        await createCheckRun({
            name: 'Quality Gate',
            status: 'completed',
            conclusion: gateConclusion(qgResult.overall),
            output: {
                title: `Quality Gate: ${qgResult.overall.toUpperCase()} (Score: ${qgResult.score}/100) | Grade: ${gradeStr}`,
                summary: checkSummary,
            },
        });

        return buildQualityGateSection(qgResult);
    } catch (err) {
        rootLogger.warn(`createCheckRun error: ${String(err)}`);
        return undefined;
    }
}

/**
 * Resolve coverage for the PR report from DataHub.
 * DataHub.getCoverage() is populated from Istanbul/CTRF/JUnit artifacts via GitHub API.
 * No filesystem fallback — DataHub is the SSOT.
 *
 * @param dataHub - DataHub instance (SSOT obrigatório)
 * @returns Coverage data with percentage and source, or undefined if unavailable
 */
function resolveCoverageForReport(
    dataHub: DataHub,
): { coveragePct: number; source: string; detail?: string } | undefined {
    const dataHubCoverage = dataHub.getCoverage();
    if (dataHubCoverage !== undefined) {
        return {
            coveragePct: dataHubCoverage.percentage,
            source: 'datahub',
            detail: `datahub ${dataHubCoverage.percentage.toFixed(1)}% (${dataHubCoverage.covered}/${dataHubCoverage.total})`,
        };
    }
    return undefined;
}

/**
 * Generate HTML report file from test data.
 * Uses DataHub.computed for flakiness entries and trends — no MetricsStore dependency.
 *
 * @param tests - FlatTest array from external project
 * @param stats - Test statistics
 * @param options - PR report options
 * @param dataHub - DataHub instance with pre-computed metrics (SSOT obrigatório)
 * @param coverageResult - Coverage data from resolveCoverageForReport
 * @param healthScore - Health score from calculateHealthScore
 * @param workflowUrl - CI workflow URL for linking
 * @returns Path to generated HTML file, or undefined on failure
 */
function generateHtmlReportFile(
    tests: FlatTest[],
    stats: PrReportStats,
    options: PrReportCoreOptions,
    dataHub: DataHub,
    coverageResult: ReturnType<typeof resolveCoverageForReport>,
    healthScore: ReturnType<typeof calculateHealthScore>,
    workflowUrl?: string,
): string | undefined {
    try {
        const passRate = calcRunPassRate({ passed: stats.passed, failed: stats.failed });
        const flakyEntries = dataHub.computed.flakinessEntries ?? [];
        const flakinessMap: Record<string, number> = {};
        for (const entry of flakyEntries) {
            flakinessMap[entry.title] = entry.rate;
        }

        const ghBranch = process.env['GITHUB_REF_NAME'];
        const coverageSource = coverageResult?.source ?? 'none';
        const branchLabel = ghBranch ? ` (${ghBranch})` : '';
        const htmlOptions: ReportOptions = {
            title: `QA Tools — PR Report${branchLabel}`,
            qualityGate: Math.round(passRate),
            healthScore,
            trends: dataHub.computed.metricsTrends ?? [],
            includeChart: true,
            coverageSource,
            ...(workflowUrl ? { ciUrl: workflowUrl } : {}),
            ...(ghBranch ? { branch: ghBranch } : {}),
            ...(Object.keys(flakinessMap).length > 0 ? { flakinessMap } : {}),
            ...(options.diffComparison ? { diffComparison: options.diffComparison } : {}),
        };

        const html = generateHtmlReport(tests, htmlOptions);
        const htmlPath = options.htmlOutputPath ?? 'reports/pr-report.html';
        fs.mkdirSync('reports', { recursive: true });
        fs.writeFileSync(path.resolve(htmlPath), html, 'utf8');
        rootLogger.info(`HTML report generated: ${htmlPath} (${html.length} bytes)`);
        return htmlPath;
    } catch (err) {
        rootLogger.error(`Failed to generate HTML report: ${String(err)}`);
        return undefined;
    }
}

/**
 * Generate and post a PR report from parsed test data.
 *
 * @returns Result summary with HTML path, check run ID, and comment URL (when applicable).
 */
function validatePrReportStats(tests: FlatTest[], stats: PrReportStats): void {
    const computed = tests.reduce(
        (acc, t) => {
            if (t.state === 'passed') acc.passed++;
            else if (t.state === 'failed') acc.failed++;
            else acc.skipped++;
            return acc;
        },
        { passed: 0, failed: 0, skipped: 0 },
    );

    if (computed.passed !== stats.passed) {
        rootLogger.warn(`stats validation: passed ${stats.passed} != computed ${computed.passed}`);
    }
    if (computed.failed !== stats.failed) {
        rootLogger.warn(`stats validation: failed ${stats.failed} != computed ${computed.failed}`);
    }
    if (computed.skipped !== stats.skipped) {
        rootLogger.warn(`stats validation: skipped ${stats.skipped} != computed ${computed.skipped}`);
    }
    if (tests.length !== stats.total) {
        rootLogger.warn(`stats validation: total ${stats.total} != tests.length ${tests.length}`);
    }
}

/** Maximum length for error messages in markdown tables. */
const MAX_ERROR_LENGTH = 200;

/**
 * Generate and post a PR report from parsed test data.
 * All data comes from DataHub (SSOT) — no direct MetricsStore or CTRF access.
 *
 * @returns Result summary with HTML path, check run ID, and comment URL (when applicable).
 */
export async function generatePrReport(options: PrReportCoreOptions): Promise<PrReportResult> {
    const { tests, stats } = options;
    validatePrReportStats(tests, stats);

    persistCurrentRun(tests, stats, options.project);

    // DataHub é SSOT obrigatório (Invariant 8 / E1): sem fallback silencioso.
    const dataHub = options.dataHub;
    const dataQuality = summarizeDataQuality(dataHub);
    const coverageResult = resolveCoverageForReport(dataHub);
    const healthScore = calculateHealthScore({
        ...(coverageResult ? { coverageOverride: coverageResult.coveragePct } : {}),
        dataHub,
    });

    const { workflowUrl, artifactUrl } = resolveCiUrls();

    const sections: string[] = [];
    sections.push(buildCiContextSection(options.ciEnv ?? getCiEnv(), stats));
    sections.push(buildSummaryTable(stats));

    const failSection = buildFailureTable(tests);
    if (failSection) sections.push(failSection);

    if (!options.skipAi) {
        sections.push(buildAiAnalysisSection());
    }

    if (!options.skipQuality) {
        const qgSection = await handleQualityGate(healthScore, dataHub, artifactUrl, coverageResult?.coveragePct);
        if (qgSection) sections.push(qgSection);
    }

    if (!options.skipFlaky) {
        const flakySection = buildFlakySection(dataHub);
        if (flakySection) sections.push(flakySection);
    }

    const htmlPath = generateHtmlReportFile(tests, stats, options, dataHub, coverageResult, healthScore, workflowUrl);

    const dqSection = buildDataQualitySection(dataQuality);
    if (dqSection) sections.push(dqSection);

    sections.push(buildFooter(artifactUrl, workflowUrl, healthScore));

    const htmlArtifactUrl = workflowUrl ? `${workflowUrl}?pr=1#artifacts` : undefined;
    writeToJobSummary(stats, htmlArtifactUrl);

    const passRate = calcRunPassRate({ passed: stats.passed, failed: stats.failed });
    const commentBody = sections.join('\n');
    const postResult = await postPrComment(commentBody);

    return {
        ...(htmlPath ? { htmlPath } : {}),
        healthScore,
        passRate,
        dataQuality,
        ...(postResult?.html_url ? { commentUrl: postResult.html_url } : {}),
    };
}

// Markdown builders for PR comment sections
type QualityGateSummary = {
    overall: QualityGateStatus;
    score: number;
    checks: Array<{ name: string; status: QualityGateStatus; score: number; threshold: number }>;
};

function gateStatusIcon(status: QualityGateStatus): string {
    if (status === 'pass') return '✅';
    if (status === 'unknown') return '❓';
    return '❌';
}

function gateOverallLabel(overall: QualityGateStatus): { icon: string; word: string } {
    if (overall === 'pass') return { icon: '✅', word: 'PASSED' };
    if (overall === 'unknown') return { icon: '❓', word: 'UNKNOWN' };
    return { icon: '❌', word: 'FAILED' };
}

function gateConclusion(overall: QualityGateStatus): 'success' | 'neutral' | 'failure' {
    if (overall === 'pass') return 'success';
    if (overall === 'unknown') return 'neutral';
    return 'failure';
}

function buildQGCHeckSummary(result: QualityGateSummary, grade?: string, artifactUrl?: string): string {
    const { icon, word } = gateOverallLabel(result.overall);
    const lines: string[] = [`**Quality Gate: ${icon} ${word}**`, '', `**Score:** ${result.score}/100`];
    if (grade) {
        lines.push(`**Grade:** ${grade}`);
    }
    lines.push('', '| Check | Score | Threshold | Status |', '|---|---|---|---|');
    for (const check of result.checks) {
        lines.push(`| ${check.name} | ${check.score} | ${check.threshold} | ${gateStatusIcon(check.status)} |`);
    }
    if (artifactUrl) {
        lines.push('', `📄 [Download HTML report](${artifactUrl})`);
    }
    return lines.join('\n');
}

function buildQualityGateSection(result: QualityGateSummary): string {
    const { icon, word } = gateOverallLabel(result.overall);
    const checkRows = result.checks.map(
        (c) => `| ${c.name} | ${c.score} | ${c.threshold} | ${gateStatusIcon(c.status)} |`,
    );

    return [
        '',
        `## 🛡️ Quality Gate: ${icon} ${word} (Score: ${result.score}/100)`,
        '',
        '| Check | Actual | Threshold | Status |',
        '|---|---|---|---|',
        ...checkRows,
        '',
    ].join('\n');
}

function _buildProvenanceMd(healthScore: ReturnType<typeof calculateHealthScore>): string {
    if (!healthScore.provenance || healthScore.provenance.length === 0) return '';

    const rows = healthScore.provenance.map(
        (p) =>
            `| ${p.dimension} | ${p.formula} | ${p.source} | ${p.standard} | ${p.overridden ? '✏️ overridden' : 'default'} |`,
    );

    return [
        '📖 **Methodology & References**',
        '',
        '| Dimension | Formula | Source | Standard | Config |',
        '|---|---|---|---|---|',
        ...rows,
        '',
    ].join('\n');
}

/**
 * Render the EIXO C data-quality awareness section for the PR report.
 * Surfaces confidence/provenance/quality of the unified model consumed by this report.
 *
 * @param dataQuality - Summary from `summarizeDataQuality(hub)`.
 * @returns Markdown section, or undefined when there is nothing to report.
 */
function buildDataQualitySection(dataQuality: DataQualitySummary): string | undefined {
    const { status, minConfidence, notes } = dataQuality;
    if (status === 'missing' && notes.length === 0) return undefined;

    let icon: string;
    if (status === 'ok') icon = '✅';
    else if (status === 'degraded') icon = '⚠️';
    else icon = 'ℹ️';

    const confidenceLabel = minConfidence == null ? '_n/a_' : `${(minConfidence * 100).toFixed(0)}%`;
    const parts: string[] = [
        `### ${icon} Data Quality`,
        '',
        `- **Status:** \`${status}\``,
        `- **Min. confidence:** ${confidenceLabel}`,
    ];

    if (notes.length > 0) {
        parts.push('', '**Observações:**');
        for (const note of notes) parts.push(`- ${note}`);
    }

    parts.push('');
    return parts.join('\n');
}

function buildFooter(
    artifactUrl?: string,
    workflowUrl?: string,
    healthScore?: ReturnType<typeof calculateHealthScore>,
): string {
    const parts: string[] = ['---', ''];
    if (workflowUrl) {
        parts.push(`🔍 [View workflow run](${workflowUrl})`);
        if (artifactUrl) {
            parts.push(`📄 [Download HTML report](${artifactUrl})`);
        }
    }
    const provenanceMd = healthScore ? _buildProvenanceMd(healthScore) : '';
    if (provenanceMd) parts.push(provenanceMd);
    parts.push(`_Generated at ${new Date().toISOString()}_`);
    parts.push('');
    return parts.join('\n');
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

interface CliOptions {
    htmlOutputPath?: string;
    skipAi: boolean;
    skipQuality: boolean;
    skipFlaky: boolean;
    projectName: string;
}

function parseArgs(args: string[]): CliOptions {
    const opts: CliOptions = {
        skipAi: false,
        skipQuality: false,
        skipFlaky: false,
        projectName:
            (typeof Reflect.get(process.env, 'GITHUB_REPOSITORY') === 'string'
                ? Reflect.get(process.env, 'GITHUB_REPOSITORY')
                : undefined) || 'unknown',
    };
    let idx = 0;
    while (idx < args.length) {
        const arg: unknown = Reflect.get(args, idx);
        switch (arg) {
            case '--help':
            case '-h':
                rootLogger.info(
                    [
                        'Uso: npx tsx git_triggers/main.ts pr-report [opções]',
                        '',
                        'Opções:',
                        '  --html-output <path>   Caminho do HTML (default: reports/pr-report.html)',
                        '  --project <name>       Nome do projeto (default: GITHUB_REPOSITORY env)',
                        '  --no-ai                Pular análise de IA',
                        '  --no-quality           Pular quality gate',
                        '  --no-flaky             Pular flakiness dashboard',
                        '  --help, -h             Mostrar esta ajuda',
                    ].join('\n'),
                );
                process.exit(0);
                break;
            case '--html-output':
                {
                    const v = args[++idx];
                    if (v !== undefined) opts.htmlOutputPath = v;
                }
                break;
            case '--project':
                opts.projectName = args[++idx] ?? opts.projectName;
                break;
            case '--no-ai':
                opts.skipAi = true;
                break;
            case '--no-quality':
                opts.skipQuality = true;
                break;
            case '--no-flaky':
                opts.skipFlaky = true;
                break;
            case 'pr-report':
                break;
            default:
                rootLogger.warn(`Flag desconhecida ignorada: ${String(arg)}`);
        }
        idx++;
    }
    return opts;
}

/**
 * Attempt to create DataHub from CI environment (Camada 1–6).
 * DataHub fetches artifacts via GitHub/GitLab API — no local file access.
 *
 * Em caso de erro NÃO-recuperável da Camada 7 (contexto não-interativo, sem
 * dados), relança `Layer7UnavailableError` para que `main()` falhe explicitamente.
 * Outros erros de criação são absorvidos (retorna undefined) para que `main()`
 * acione o fallback manual (Camada 7) explicitamente.
 *
 * @param ciEnv - CI environment variables
 * @param providerFactory - Optional factory to create GitProvider
 * @returns DataHub instance, or undefined if no provider or creation fails (non-Layer7)
 */
async function tryCreateDataHub(
    ciEnv: ReturnType<typeof getCiEnv>,
    providerFactory?: (ciEnv: ReturnType<typeof getCiEnv>) => import('./types/ci-cd.js').GitProvider | undefined,
): Promise<import('./types/data-hub.js').DataHub | undefined> {
    if (!providerFactory) return undefined;

    const provider = providerFactory(ciEnv);
    if (!provider) return undefined;

    try {
        const { createDataHub } = await import('./data-hub/factory.js');
        const result = await createDataHub(provider, ciEnv.repo);
        rootLogger.info(
            `DataHub created: ${result.hub.getRuns().length} runs, passRate: ${result.hub.computed.passRate}%`,
        );
        return result.hub;
    } catch (err) {
        if (DataHubImpl.isLayer7UnavailableError(err)) throw err;
        rootLogger.warn(`DataHub creation failed: ${formatErr(err)}`);
        return undefined;
    }
}

/**
 * Verifica se o DataHub contém dados utilizáveis (Camada 1–6 ou arquivo manual).
 */
function hasUsableData(hub: import('./types/data-hub.js').DataHub): boolean {
    return (
        hub.getRuns().length > 0 ||
        (hub.raw.parsedArtifacts != null && hub.raw.parsedArtifacts.size > 0) ||
        (hub.computed.metricsRuns?.length ?? 0) > 0
    );
}

/**
 * Obtém o DataHub para geração do relatório, aplicando os 3 desfechos da
 * Camada 7:
 *  - Caso 1: hub já em memória com dados utilizáveis, ou dados do versionador
 *    (CI) via `tryCreateDataHub`, ou arquivo manual fornecido pelo usuário.
 *  - Caso 2: usuário declinou o fallback manual (TTY) ou hub sem dados → log e retorno.
 *  - Caso 3: sem dados E sem TTY para solicitar (não-interativo) → erro explícito.
 * Nunca silencia a ausência de dados: o chamador recebe um hub ou uma exceção.
 */
async function acquireReportDataHub(
    ciEnv: ReturnType<typeof getCiEnv>,
    providerFactory?: (ciEnv: ReturnType<typeof getCiEnv>) => import('./types/ci-cd.js').GitProvider | undefined,
): Promise<DataHub> {
    const explicitError = (): never => {
        throw new Error(
            'Falha ao obter dados de teste: sem dados do versionador/Jira e solicitação de relatório manual indisponível em contexto não-interativo.',
        );
    };

    // Reusa um DataHub já carregado em memória com dados utilizáveis (orquestração/testes).
    if (isDataHubInitialized()) {
        const existing = getDataHub();

        if (hasUsableData(existing)) {
            setDataHub(existing);

            return existing;
        }
    }

    // Create DataHub from CI (Camada 1–6) apenas em contexto CI. Em execução
    // local (sem CI), pula para o fallback manual (Camada 7).
    let dataHub: DataHub | undefined;

    if (ciEnv.isCI) {
        try {
            dataHub = await tryCreateDataHub(ciEnv, providerFactory);
        } catch (err) {
            if (DataHubImpl.isLayer7UnavailableError(err)) {
                throw new Error(
                    'Falha ao obter dados de teste: sem dados do versionador/Jira e solicitação de relatório manual indisponível em contexto não-interativo.',
                    { cause: err },
                );
            }

            rootLogger.warn(`Falha ao criar DataHub via CI: ${formatErr(err)}`);
        }
    }

    if (dataHub) {
        // Armazena o hub obtido (Camada 1–6) para disponibilidade global.
        setDataHub(dataHub);
    }

    if (dataHub && !hasUsableData(dataHub)) {
        // Caso 2 (TTY): usuário declinou o fallback manual ou hub sem dados.
        rootLogger.warn('PR Report não gerado: dados de teste insuficientes (usuário declinou o relatório manual).');

        return dataHub;
    }

    if (dataHub) return dataHub;

    // Sem dados do versionador/Jira: acionar fallback manual (Camada 7) explicitamente.
    const fallback = await askTestSource();

    if (fallback.data) {
        // Caso 1 (TTY): usuário forneceu arquivo de resultado.
        const hub = createDataHubFromParseResult(fallback.data, ciEnv.repo);

        setDataHub(hub);

        return hub;
    }

    if (fallback.error === DATAHUB_ERRORS.USER_SKIPPED || fallback.error === DATAHUB_ERRORS.USER_CANCELLED) {
        // Caso 2 (TTY): usuário declinou explicitamente.
        rootLogger.warn('PR Report não gerado: dados de teste insuficientes (usuário declinou o relatório manual).');
        throw new Error('PR Report não gerado: usuário declinou o relatório manual.');
    }

    // Caso 3 (não-interativo): sem dados e sem TTY para solicitar — erro explícito.
    return explicitError();
}

/**
 * CLI entry point for PR report generation.
 * Test data comes from DataHub (parsed from external project CI artifacts).
 * No CTRF file reading — DataHub fetches artifacts via GitHub/GitLab API.
 */
export async function main(
    providerFactory?: (ciEnv: ReturnType<typeof getCiEnv>) => import('./types/ci-cd.js').GitProvider | undefined,
): Promise<void> {
    const opts = parseArgs(process.argv.slice(2));

    const project = opts.projectName;
    const ciEnv = getCiEnv();

    // Read feature config for runtime toggles. CLI flags override config values.
    const featureConfig = getPrReportConfig(project);

    if (!featureConfig.enabled) {
        rootLogger.info('PR Report disabled in config. Skipping.');

        return;
    }

    // Validate publish target: warn if running on GitHub but target is gitlab-ci
    if (ciEnv.repo !== 'unknown' && featureConfig.publishTarget === 'gitlab-ci') {
        rootLogger.warn(
            'PR Report publish target is gitlab-ci but running on GitHub. ' + 'PR comment may not post correctly.',
        );
    }

    // CLI flags override config values (config values are defaults)
    const skipAi = opts.skipAi || (featureConfig.skipAi ?? false);
    const skipQuality = opts.skipQuality || (featureConfig.skipQuality ?? false);
    const skipFlaky = opts.skipFlaky || (featureConfig.skipFlaky ?? false);

    const dataHub = await acquireReportDataHub(ciEnv, providerFactory);

    // Get test data from DataHub — parsed from external project CI artifacts or manual file.
    const metricsRuns = dataHub.computed.metricsRuns ?? [];
    const latestRun: MetricsRun | undefined = metricsRuns[0];

    if (!latestRun) {
        rootLogger.warn('No test data available from DataHub. Skipping PR comment.');

        return;
    }

    // Diff comparison uses the previous run's data (before the current run is persisted).
    const previousRun: MetricsRun | undefined = metricsRuns[1];
    const diffComparison = previousRun ? computeDiffComparison(latestRun.tests, previousRun.tests) : undefined;

    const resultSummary = await generatePrReport({
        tests: latestRun.tests,
        stats: {
            passed: latestRun.passed,
            failed: latestRun.failed,
            skipped: latestRun.skipped,
            total: latestRun.total,
            duration: latestRun.duration,
        },
        project,
        skipAi,
        skipQuality,
        skipFlaky,
        ciEnv,
        dataHub,
        ...(opts.htmlOutputPath ? { htmlOutputPath: opts.htmlOutputPath } : {}),
        ...(diffComparison ? { diffComparison } : {}),
    });

    if (resultSummary.commentUrl) {
        rootLogger.info(`PR report posted: ${resultSummary.commentUrl}`);
    } else {
        rootLogger.info('PR comment not posted (required env vars missing, or running outside PR context)');
    }
}

// No self-exec guard: this is a library module. The Git provider factory is
// injected by the caller (git_triggers/main.ts dispatch 'pr-report'), keeping
// this module free of an upward layer dependency (shared/ -> git_triggers/).
