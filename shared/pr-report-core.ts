/**
 * PR Report core — reusable function for generating PR test reports.
 *
 * Designed to be called from:
 *   1. CLI (scripts/pr-report.ts) — thin wrapper
 *   2. Pipeline (git_triggers/batch-mode.ts) — post-test-collection
 *   3. Tests — direct invocation
 *
 * Layered data sources:
 *   - Coverage: Istanbul standalone > CTRF > Jira coverage history > 0
 *   - Flaky rate: MetricsStore (cross-run history) — no Jira dependency
 *   - Trends: MetricsStore pass rate history — no Jira dependency
 *
 * Accepts parsed test data directly (no filesystem dependency on CTRF).
 */
import fs from 'node:fs';
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
import type { FlatTest, ParseResult } from './result_parser.js';

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
    /** Project name used to persist the current run to MetricsStore before health score calculation. */
    project?: string;
    skipAi?: boolean;
    skipQuality?: boolean;
    skipFlaky?: boolean;
    htmlOutputPath?: string;
    diffComparison?: DiffComparison;
}

export interface PrReportResult {
    htmlPath?: string;
    checkRunId?: string;
    commentUrl?: string;
    healthScore: ReturnType<typeof calculateHealthScore>;
    passRate: number;
}

function buildSummaryTable(stats: PrReportStats): string {
    const passRate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : '0.0';
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
        const error = t.error ? t.error.replace(/\n/g, ' ').slice(0, 200) : '';
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
        const flakyEntries = calculateFlakiness(store, 2);
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
    } catch {
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
 * Generate and post a PR report from parsed test data.
 *
 * @returns Result summary with HTML path, check run ID, and comment URL (when applicable).
 */
export async function generatePrReport(options: PrReportCoreOptions): Promise<PrReportResult> {
    const { tests, stats } = options;

    // Persist current run to MetricsStore so health score includes it
    if (options.project) {
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
        saveParseResult(options.project, parseResult);
    }

    // Load metrics store for health score, trends, flaky
    const store = loadMetrics();

    // Resolve coverage from best available source
    const coverageResult = resolveCoverage();
    const healthConfig = coverageResult ? { coverageOverride: coverageResult.coveragePct } : {};
    const healthScore = calculateHealthScore(store, healthConfig);

    const penv = process.env as Record<string, string | undefined>;
    const ghServer = penv['GITHUB_SERVER_URL'];
    const ghRepo = penv['GITHUB_REPOSITORY'];
    const ghRunId = penv['GITHUB_RUN_ID'];
    const ghBranch = penv['GITHUB_REF_NAME'];
    const workflowUrl = ghServer && ghRepo && ghRunId ? `${ghServer}/${ghRepo}/actions/runs/${ghRunId}` : undefined;
    const artifactUrl = workflowUrl ? `${workflowUrl}?pr=1#artifacts` : undefined;

    const sections: string[] = [];

    // 1. Summary table
    sections.push(buildSummaryTable(stats));

    // 2. Failed tests table
    const failSection = buildFailureTable(tests);
    if (failSection) sections.push(failSection);

    // 3. AI analysis
    if (!options.skipAi) {
        sections.push(buildAiAnalysisSection());
    }

    // 4. Quality gate
    if (!options.skipQuality) {
        try {
            const qgResult = runQualityGate();
            const gradeStr = healthScore.grade.replace(/_/g, ' ').toUpperCase();
            const checkSummary = buildQGCHeckSummary(qgResult, gradeStr, artifactUrl);

            sections.push(buildQualityGateSection(qgResult));

            await createCheckRun({
                name: 'Quality Gate',
                status: 'completed',
                conclusion: qgResult.overall === 'pass' ? 'success' : 'failure',
                output: {
                    title: `Quality Gate: ${qgResult.overall.toUpperCase()} (Score: ${qgResult.score}/100) | Grade: ${gradeStr}`,
                    summary: checkSummary,
                },
            });
        } catch {
            /* quality gate errors are handled internally */
        }
    }

    // 5. Flaky detection
    if (!options.skipFlaky) {
        const flakySection = buildFlakySection();
        if (flakySection) sections.push(flakySection);
    }

    // 6. Generate HTML report
    const passRate = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
    const flakyEntries = calculateFlakiness(store, 2);
    const flakinessMap: Record<string, number> = {};
    for (const entry of flakyEntries) {
        flakinessMap[entry.title] = entry.rate;
    }

    const coverageSource = coverageResult?.source ?? 'none';
    const htmlOptions: ReportOptions = {
        title: `QA Tools — PR Report${ghBranch ? ` (${ghBranch})` : ''}`,
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
    fs.writeFileSync(htmlPath, html, 'utf8');
    rootLogger.info(`HTML report generated: ${htmlPath} (${html.length} bytes)`);

    // 7. Footer
    sections.push(buildFooter(artifactUrl, workflowUrl, healthScore));

    // 8. Post PR comment
    const commentBody = sections.join('\n');
    const postResult = await postPrComment(commentBody);

    return {
        htmlPath,
        healthScore,
        passRate,
        ...(postResult?.html_url ? { commentUrl: postResult.html_url } : {}),
    };
}

// Re-used from scripts/pr-report.ts — markdown builders
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
