/** Quality gate orchestrator — composes health, coverage, and flakiness thresholds into a single pass/fail decision.
 *  Used by the qa-quality-gate CLI and CI pipeline.
 *  All thresholds are configurable via environment variables. */
import { loadMetrics, calculateFlakiness } from './metrics';
import { calculateHealthScore, type HealthScoreConfig } from './health-score';
import { generateGitMetricsRuns } from './git-metrics-adapter';
import { rootLogger } from './logger';

export interface QualityGateResult {
    overall: 'pass' | 'fail';
    checks: Array<{
        name: string;
        status: 'pass' | 'fail';
        score: number;
        threshold: number;
        details: string;
    }>;
    score: number;
}

export interface QualityGateOptions {
    project?: string;
    minPassRate?: number;
    maxFlakyPct?: number;
    minCoverage?: number;
    maxSuiteSpeed?: number;
}

function loadEnvThresholds(): Partial<HealthScoreConfig> {
    const cfg: Partial<HealthScoreConfig> = {};
    const passRate = process.env.QA_GATE_MIN_PASS_RATE;
    if (passRate) cfg.minPassRateGate = Number(passRate);
    const flaky = process.env.QA_GATE_MAX_FLAKY_PCT;
    if (flaky) cfg.maxFlakyGate = Number(flaky);
    const coverage = process.env.QA_GATE_MIN_COVERAGE;
    if (coverage) cfg.minCoverageGate = Number(coverage);
    const speed = process.env.QA_GATE_MAX_SUITE_SPEED;
    if (speed) cfg.maxSuiteSpeedGate = Number(speed);
    return cfg;
}

export function runQualityGate(options?: QualityGateOptions): QualityGateResult {
    const checks: QualityGateResult['checks'] = [];
    try {
        const envCfg = loadEnvThresholds();
        const minPassRate = options?.minPassRate ?? envCfg.minPassRateGate ?? 80;
        const maxFlakyPct = options?.maxFlakyPct ?? envCfg.maxFlakyGate ?? 30;
        const minCoverage = options?.minCoverage ?? envCfg.minCoverageGate ?? 70;
        const maxSuiteSpeed = options?.maxSuiteSpeed ?? envCfg.maxSuiteSpeedGate ?? 8;

        const store = loadMetrics();
        let projectRuns = options?.project ? store.runs.filter((r) => r.project === options.project) : store.runs;

        if (projectRuns.length < 1) {
            const gitRuns = generateGitMetricsRuns({ projectName: options?.project ?? 'git' });
            if (gitRuns.length > 0) {
                projectRuns = gitRuns;
            } else {
                checks.push({
                    name: 'metrics-data',
                    status: 'pass',
                    score: 100,
                    threshold: 1,
                    details: 'Sem dados históricos — gate não aplicável',
                });
                return { overall: 'pass', checks, score: 100 };
            }
        }

        const isGitFallback = store.runs.length === 0;
        const health = calculateHealthScore(
            { ...store, runs: projectRuns },
            { ...envCfg, ...(isGitFallback ? { minCoverageGate: 0 } : {}) },
        );

        checks.push({
            name: 'health-score',
            status: health.qualityGate,
            score: health.overall,
            threshold: 70,
            details: 'Health score: ' + health.overall + ' (' + health.grade + '), gate: ' + health.qualityGate,
        });

        const passRateCheck = health.dimensions.passRate.score >= minPassRate ? 'pass' : 'fail';
        checks.push({
            name: 'pass-rate',
            status: passRateCheck,
            score: health.dimensions.passRate.score,
            threshold: minPassRate,
            details: 'Pass rate: ' + health.dimensions.passRate.score + '% (threshold: ' + minPassRate + '%)',
        });

        const flakyEntries = calculateFlakiness({ runs: projectRuns }, 2);
        const flakyPct = projectRuns.length > 0 ? (flakyEntries.length / Math.max(projectRuns.length, 1)) * 100 : 0;
        const flakyCheck = flakyPct <= maxFlakyPct ? 'pass' : 'fail';
        checks.push({
            name: 'flaky-rate',
            status: flakyCheck,
            score: Math.round(flakyPct),
            threshold: maxFlakyPct,
            details:
                'Flaky: ' +
                flakyEntries.length +
                ' tests (' +
                Math.round(flakyPct) +
                '%, threshold: ' +
                maxFlakyPct +
                '%)',
        });

        const coverageCheck = isGitFallback
            ? 'pass'
            : health.dimensions.coverage.score >= minCoverage
              ? 'pass'
              : 'fail';
        checks.push({
            name: 'coverage',
            status: coverageCheck,
            score: isGitFallback ? minCoverage : health.dimensions.coverage.score,
            threshold: minCoverage,
            details: isGitFallback
                ? 'Cobertura: N/A (git fallback — sem dados de cobertura)'
                : 'Coverage: ' + health.dimensions.coverage.score + '% (threshold: ' + minCoverage + '%)',
        });

        const speedCheck = health.dimensions.suiteSpeed.score >= 100 - (maxSuiteSpeed / 10) * 100 ? 'pass' : 'fail';
        checks.push({
            name: 'suite-speed',
            status: speedCheck,
            score: health.dimensions.suiteSpeed.score,
            threshold: maxSuiteSpeed,
            details:
                'Suite speed score: ' +
                health.dimensions.suiteSpeed.score +
                ' (threshold: ' +
                maxSuiteSpeed +
                's/test)',
        });

        const overall = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
        const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
        return { overall, checks, score };
    } catch (err) {
        rootLogger.error('Quality gate error: ' + (err instanceof Error ? err.message : String(err)));
        checks.push({
            name: 'error',
            status: 'fail',
            score: 0,
            threshold: 0,
            details: 'Erro: ' + (err instanceof Error ? err.message : String(err)),
        });
        return { overall: 'fail', checks, score: 0 };
    }
}

export function formatQualityGateJson(result: QualityGateResult): string {
    return JSON.stringify(result, null, 2);
}

export function formatQualityGateText(result: QualityGateResult): string {
    let output = '';
    output += '\n=== Quality Gate ===\n';
    output += 'Overall: ' + (result.overall === 'pass' ? '✅ PASS' : '❌ FAIL') + '\n';
    output += 'Score: ' + result.score + '\n\n';
    output += 'Checks:\n';
    for (const check of result.checks) {
        const icon = check.status === 'pass' ? '✅' : '❌';
        output += '  ' + icon + ' ' + check.name + ': ' + check.details + '\n';
    }
    output += '\n';
    return output;
}
