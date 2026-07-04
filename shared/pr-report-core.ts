/**
 * PR Report core — self-contained module for generating PR test reports.
 *
 * An entry point (`main()`) with self-exec guard enables direct CLI usage:
 *   npx tsx shared/pr-report-core.ts [--ctrf <path>] [--no-ai] [--no-quality] [--no-flaky]
 *
 * Programmatic API:
 *   import { generatePrReport, computeDiffComparison } from './pr-report-core.js'
 *
 * Consumido por:
 *   1. CLI (ator principal) — via self-exec guard
 *   2. Pipeline (git_triggers/batch-mode.ts) — post-test-collection
 *   3. Tests — invocação direta
 *
 * Layered data sources:
 *   - Coverage: Istanbul standalone > CTRF > Jira coverage history > 0
 *   - Flaky rate: MetricsStore (cross-run history) — no Jira dependency
 *   - Trends: MetricsStore pass rate history — no Jira dependency
 *
 * Accepts parsed test data directly (no filesystem dependency on CTRF).
 */
import fs from 'node:fs';
import path from 'path';
import { rootLogger } from './logger.js';
import { loadMetrics, saveParseResult, calculateFlakiness, getTrends } from './metrics.js';
import { runQualityGate } from './quality-gate.js';
import { createCheckRun } from './github-check-run.js';
import { postPrComment } from './github-pr-comment.js';
import { isQuarantined } from './quarantine.js';
import { generateHtmlReport } from './report-html.js';
import type { ReportOptions } from './report-types.js';
import { calculateHealthScore } from './health-score.js';
import { resolveCoverage } from './coverage-source.js';
import { parseTestResultsFile } from './result_parser.js';
import type { FlatTest, ParseResult } from './result_parser.js';
import { getPrReportConfig } from './feature-config.js';

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

import type { CiDataHub } from './ci-data.js';

export interface PrReportCoreOptions {
    tests: FlatTest[];
    stats: PrReportStats;
    /** Project name used to persist the current run to MetricsStore before health score calculation. */
    project?: string;
    skipAi?: boolean;
    skipQuality?: boolean;
    skipFlaky?: boolean;
    htmlOutputPath?: string;
    diffComparison?: DiffComparison;
    /** CI environment context — used to render CI Context section in PR comment. */
    ciEnv?: { isCI: boolean; repo: string; runId: string; refName: string; serverUrl: string };
    /** CI Data Hub — centralizado. Quando disponível, usa dados do CI em vez de MetricsStore local. */
    ciData?: CiDataHub;
}

export interface PrReportResult {
    htmlPath?: string;
    checkRunId?: string;
    commentUrl?: string;
    healthScore: ReturnType<typeof calculateHealthScore>;
    passRate: number;
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
    const executed = stats.passed + stats.failed;
    const passRate = executed > 0 ? ((stats.passed / executed) * 100).toFixed(1) : '0.0';
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

function buildFlakySection(): string {
    try {
        const store = loadMetrics();
        const flakyEntries = calculateFlakiness(store, MIN_FLAKINESS_RUNS);
        const highFlaky = flakyEntries.filter((e) => e.rate >= 0.3);

        if (highFlaky.length === 0) return '';

        const rows = highFlaky.map((t) => {
            const quarantined = isQuarantined(t.title);
            const status = quarantined ? '🔒 Quarantined' : '⚠️ New';
            return [
                `| ${t.title.replace(/\|/g, '\\|')}`,
                `${(t.rate * 100).toFixed(0)}%`,
                `${t.passCount}/${t.totalRuns}`,
                `${status} |`,
            ].join(' | ');
        });

        const newFlaky = highFlaky.filter((t) => !isQuarantined(t.title));
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
        const executed = stats.passed + stats.failed;
        const passRate = executed > 0 ? ((stats.passed / executed) * 100).toFixed(1) : '0.0';
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
    saveParseResult(project, parseResult);
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
    artifactUrl?: string,
    coverageOverride?: number,
    ciData?: CiDataHub,
): Promise<string | undefined> {
    try {
        const qgResult = runQualityGate({ coverageOverride, ciData });
        const gradeStr = healthScore.grade.replace(/_/g, ' ').toUpperCase();
        const checkSummary = buildQGCHeckSummary(qgResult, gradeStr, artifactUrl);

        await createCheckRun({
            name: 'Quality Gate',
            status: 'completed',
            conclusion: qgResult.overall === 'pass' ? 'success' : 'failure',
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

function generateHtmlReportFile(
    tests: FlatTest[],
    stats: PrReportStats,
    options: PrReportCoreOptions,
    store: ReturnType<typeof loadMetrics>,
    coverageResult: ReturnType<typeof resolveCoverage>,
    healthScore: ReturnType<typeof calculateHealthScore>,
    workflowUrl?: string,
): string | undefined {
    try {
        const executed = stats.passed + stats.failed;
        const passRate = executed > 0 ? (stats.passed / executed) * 100 : 0;
        const flakyEntries = calculateFlakiness(store, MIN_FLAKINESS_RUNS);
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
            trends: getTrends(store),
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

/** Minimum number of runs required to compute flakiness metrics. */
const MIN_FLAKINESS_RUNS = 2;
/** Maximum length for error messages in markdown tables. */
const MAX_ERROR_LENGTH = 200;

export async function generatePrReport(options: PrReportCoreOptions): Promise<PrReportResult> {
    const { tests, stats } = options;
    validatePrReportStats(tests, stats);

    persistCurrentRun(tests, stats, options.project);

    const store = loadMetrics();
    const coverageResult = resolveCoverage();
    const healthConfig = coverageResult ? { coverageOverride: coverageResult.coveragePct } : {};
    const healthScore = calculateHealthScore(store, healthConfig);

    // Se CiDataHub disponível, passar para quality gate e后续 consumers
    const ciData = options.ciData;

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
        const qgSection = await handleQualityGate(healthScore, artifactUrl, coverageResult?.coveragePct, ciData);
        if (qgSection) sections.push(qgSection);
    }

    if (!options.skipFlaky) {
        const flakySection = buildFlakySection();
        if (flakySection) sections.push(flakySection);
    }

    const htmlPath = generateHtmlReportFile(tests, stats, options, store, coverageResult, healthScore, workflowUrl);

    sections.push(buildFooter(artifactUrl, workflowUrl, healthScore));

    const htmlArtifactUrl = workflowUrl ? `${workflowUrl}?pr=1#artifacts` : undefined;
    writeToJobSummary(stats, htmlArtifactUrl);

    const executed = stats.passed + stats.failed;
    const passRate = executed > 0 ? (stats.passed / executed) * 100 : 0;
    const commentBody = sections.join('\n');
    const postResult = await postPrComment(commentBody);

    return {
        ...(htmlPath ? { htmlPath } : {}),
        healthScore,
        passRate,
        ...(postResult?.html_url ? { commentUrl: postResult.html_url } : {}),
    };
}

// Markdown builders for PR comment sections
function buildQGCHeckSummary(
    result: {
        overall: 'pass' | 'fail';
        score: number;
        checks: Array<{ name: string; status: 'pass' | 'fail'; score: number; threshold: number }>;
    },
    grade?: string,
    artifactUrl?: string,
): string {
    const lines: string[] = [
        `**Quality Gate: ${result.overall === 'pass' ? '✅ PASSED' : '❌ FAILED'}**`,
        '',
        `**Score:** ${result.score}/100`,
    ];
    if (grade) {
        lines.push(`**Grade:** ${grade}`);
    }
    lines.push('', '| Check | Score | Threshold | Status |', '|---|---|---|---|');
    for (const check of result.checks) {
        const icon = check.status === 'pass' ? '✅' : '❌';
        lines.push(`| ${check.name} | ${check.score} | ${check.threshold} | ${icon} |`);
    }
    if (artifactUrl) {
        lines.push('', `📄 [Download HTML report](${artifactUrl})`);
    }
    return lines.join('\n');
}

function buildQualityGateSection(result: {
    overall: 'pass' | 'fail';
    score: number;
    checks: Array<{ name: string; status: 'pass' | 'fail'; score: number; threshold: number }>;
}): string {
    const statusIcon = result.overall === 'pass' ? '✅' : '❌';
    const checkRows = result.checks.map(
        (c) => `| ${c.name} | ${c.score} | ${c.threshold} | ${c.status === 'pass' ? '✅' : '❌'} |`,
    );

    return [
        '',
        `## 🛡️ Quality Gate: ${statusIcon} ${result.overall.toUpperCase()} (Score: ${result.score}/100)`,
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
    ctrfPath: string;
    htmlOutputPath?: string;
    skipAi: boolean;
    skipQuality: boolean;
    skipFlaky: boolean;
    projectName: string;
}

function parseArgs(args: string[]): CliOptions {
    const opts: CliOptions = {
        ctrfPath: 'reports/ctrf-report.json',
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
                        'Uso: npx tsx shared/pr-report-core.ts [opções]',
                        '',
                        'Opções:',
                        '  --ctrf <path>          Caminho do CTRF (default: reports/ctrf-report.json)',
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
            case '--ctrf':
                opts.ctrfPath = args[++idx] ?? opts.ctrfPath;
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
            default:
                rootLogger.warn(`Flag desconhecida ignorada: ${String(arg)}`);
        }
        idx++;
    }
    return opts;
}

async function tryCreateCiDataHub(
    ciEnv: ReturnType<typeof getCiEnv>,
): Promise<import('./ci-data.js').CiDataHub | undefined> {
    if (!ciEnv.isCI || !process.env['GITHUB_TOKEN']) return undefined;
    try {
        const { getOrFetchCiDataHub } = await import('./ci-data.js');
        const { default: GitHubManager } = await import('../git_triggers/github_manager.js');
        const token = process.env['GITHUB_TOKEN'];
        const [owner, repoName] = ciEnv.repo.split('/');
        if (!owner || !repoName) return undefined;
        const provider = new GitHubManager(token, owner, repoName);
        const ciData = await getOrFetchCiDataHub(provider, ciEnv.repo);
        if (ciData) {
            rootLogger.info(`CiDataHub created: ${ciData.runs.length} runs, passRate: ${ciData.passRate}%`);
        }
        return ciData;
    } catch (err) {
        rootLogger.warn(`CiDataHub creation failed (falling back to MetricsStore): ${String(err)}`);
        return undefined;
    }
}

export async function main(): Promise<void> {
    const opts = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(path.resolve(opts.ctrfPath))) {
        rootLogger.warn(`CTRF report not found: ${opts.ctrfPath}. Skipping PR comment.`);
        return;
    }

    const result = parseTestResultsFile(opts.ctrfPath);
    if (result.error) {
        rootLogger.warn(`Error parsing CTRF report: ${result.error}. Skipping PR comment.`);
        return;
    }

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

    // Load store before saveParseResult so the diff comparison uses the
    // previous run's data (before the current run is persisted).
    const store = loadMetrics();
    const previousRun = store.runs.length > 0 ? store.runs[store.runs.length - 1] : undefined;
    const diffComparison = previousRun ? computeDiffComparison(result.tests, previousRun.tests) : undefined;

    const ciData = await tryCreateCiDataHub(ciEnv);

    const resultSummary = await generatePrReport({
        tests: result.tests,
        stats: {
            passed: result.stats.passed,
            failed: result.stats.failed,
            skipped: result.stats.skipped,
            total: result.stats.total,
            duration: result.stats.duration,
        },
        project,
        skipAi,
        skipQuality,
        skipFlaky,
        ciEnv,
        ...(ciData ? { ciData } : {}),
        ...(opts.htmlOutputPath ? { htmlOutputPath: opts.htmlOutputPath } : {}),
        ...(diffComparison ? { diffComparison } : {}),
    });

    if (resultSummary.commentUrl) {
        rootLogger.info(`PR report posted: ${resultSummary.commentUrl}`);
    } else {
        rootLogger.info('PR comment not posted (required env vars missing, or running outside PR context)');
    }
}

// Self-exec guard: run main() only when invoked directly (not when imported by tests or modules).
// When running via tsx, process.argv[1] is the tsx binary — the script path is argv[2].
const entryArg = (process.argv[1] ?? '').replace(/\\/g, '/');
const scriptArg = (process.argv[2] ?? '').replace(/\\/g, '/');
const isDirectExecution = entryArg.includes('pr-report-core') || scriptArg.includes('pr-report-core');
if (!process.env['VITEST'] && isDirectExecution) {
    main().catch((err) => {
        rootLogger.error(`pr-report failed: ${String(err)}`);
        process.exit(1);
    });
}
