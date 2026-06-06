/** Quality gate orchestrator — composes health, coverage, and flakiness thresholds into a single pass/fail decision.
 *  Used by the qa-quality-gate CLI and CI pipeline.
 *  All thresholds are configurable via environment variables. */
import { loadMetrics, calculateFlakiness } from './metrics.js';
import type { MetricsRun, MetricsStore } from './metrics.js';
import { calculateHealthScore, type HealthScoreConfig } from './health-score.js';
import type { HealthScoreResult } from './types.js';
import { generateGitMetricsRuns } from './git-metrics-adapter.js';
import Config from './config-accessor.js';
import { rootLogger } from './logger.js';
import { executeFlakyActions } from './flaky-auto-actions.js';
import JiraClient from './jira-client.js';

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

/** Internal check item shape — mirrors the anonymous type in QualityGateResult.checks. */
interface GateCheck {
    name: string;
    status: 'pass' | 'fail';
    score: number;
    threshold: number;
    details: string;
}

/** Parsed and resolved gate options with env var fallbacks applied. */
interface ParsedGateOptions {
    minPassRate: number;
    maxFlakyPct: number;
    minCoverage: number;
    maxSuiteSpeed: number;
    project?: string;
}

/** Extended options passed through to check builders. */
interface ExtendedGateOptions extends ParsedGateOptions {
    isGitFallback: boolean;
}

function loadEnvThresholds(): Partial<HealthScoreConfig> {
    const cfg: Partial<HealthScoreConfig> = {};
    const passRate = Config.get('qaGateMinPassRate');
    if (passRate) cfg.minPassRateGate = Number(passRate);
    const flaky = Config.get('qaGateMaxFlakyPct');
    if (flaky) cfg.maxFlakyGate = Number(flaky);
    const coverage = Config.get('qaGateMinCoverage');
    if (coverage) cfg.minCoverageGate = Number(coverage);
    const speed = Config.get('qaGateMaxSuiteSpeed');
    if (speed) cfg.maxSuiteSpeedGate = Number(speed);
    return cfg;
}

/** Parse options and apply environment variable defaults. */
function _parseGateOptions(options?: QualityGateOptions): ParsedGateOptions {
    const envCfg = loadEnvThresholds();
    const parsed: ParsedGateOptions = {
        minPassRate: options?.minPassRate ?? envCfg.minPassRateGate ?? 80,
        maxFlakyPct: options?.maxFlakyPct ?? envCfg.maxFlakyGate ?? 30,
        minCoverage: options?.minCoverage ?? envCfg.minCoverageGate ?? 70,
        maxSuiteSpeed: options?.maxSuiteSpeed ?? envCfg.maxSuiteSpeedGate ?? 8,
    };
    if (options?.project !== undefined) parsed.project = options.project;
    return parsed;
}

/** Resolve metrics from store with git fallback. Returns runs, full store, and whether git is active. */
function _resolveMetrics(project?: string): { runs: MetricsRun[]; store: MetricsStore; isGitFallback: boolean } {
    const store = loadMetrics();
    const isGitFallback = store.runs.length === 0;
    let runs = project ? store.runs.filter((r) => r.project === project) : store.runs;
    if (runs.length < 1) {
        runs = generateGitMetricsRuns({ projectName: project ?? 'git' });
    }
    return { runs, store, isGitFallback };
}

/** Check builder: health score dimension. */
function _healthCheck(health: HealthScoreResult, _runs: MetricsRun[], _opts: ExtendedGateOptions): GateCheck {
    return {
        name: 'health-score',
        status: health.qualityGate,
        score: health.overall,
        threshold: 70,
        details: 'Health score: ' + health.overall + ' (' + health.grade + '), gate: ' + health.qualityGate,
    };
}

/** Check builder: pass rate. */
function _passRateCheck(health: HealthScoreResult, _runs: MetricsRun[], opts: ExtendedGateOptions): GateCheck {
    const status = health.dimensions.passRate.score >= opts.minPassRate ? 'pass' : 'fail';
    return {
        name: 'pass-rate',
        status,
        score: health.dimensions.passRate.score,
        threshold: opts.minPassRate,
        details: 'Pass rate: ' + health.dimensions.passRate.score + '% (threshold: ' + opts.minPassRate + '%)',
    };
}

/** Check builder: flaky rate. Returns check and the computed status for side-effect triggering. */
function _flakyCheck(runs: MetricsRun[], opts: ExtendedGateOptions): { check: GateCheck; status: 'pass' | 'fail' } {
    const flakyEntries = calculateFlakiness({ runs }, 2);
    const flakyPct = runs.length > 0 ? (flakyEntries.length / Math.max(runs.length, 1)) * 100 : 0;
    const status = flakyPct <= opts.maxFlakyPct ? 'pass' : 'fail';
    return {
        check: {
            name: 'flaky-rate',
            status,
            score: Math.round(flakyPct),
            threshold: opts.maxFlakyPct,
            details:
                'Flaky: ' +
                flakyEntries.length +
                ' tests (' +
                Math.round(flakyPct) +
                '%, threshold: ' +
                opts.maxFlakyPct +
                '%)',
        },
        status,
    };
}

/** Check builder: coverage, with special handling for git fallback. */
function _coverageCheck(health: HealthScoreResult, opts: ExtendedGateOptions): GateCheck {
    const status = opts.isGitFallback ? 'pass' : health.dimensions.coverage.score >= opts.minCoverage ? 'pass' : 'fail';
    return {
        name: 'coverage',
        status,
        score: opts.isGitFallback ? opts.minCoverage : health.dimensions.coverage.score,
        threshold: opts.minCoverage,
        details: opts.isGitFallback
            ? 'Cobertura: N/A (git fallback — sem dados de cobertura)'
            : 'Coverage: ' + health.dimensions.coverage.score + '% (threshold: ' + opts.minCoverage + '%)',
    };
}

/** Check builder: suite speed. */
function _suiteSpeedCheck(health: HealthScoreResult, _runs: MetricsRun[], opts: ExtendedGateOptions): GateCheck {
    const status = health.dimensions.suiteSpeed.score >= 100 - (opts.maxSuiteSpeed / 10) * 100 ? 'pass' : 'fail';
    return {
        name: 'suite-speed',
        status,
        score: health.dimensions.suiteSpeed.score,
        threshold: opts.maxSuiteSpeed,
        details:
            'Suite speed score: ' +
            health.dimensions.suiteSpeed.score +
            ' (threshold: ' +
            opts.maxSuiteSpeed +
            's/test)',
    };
}

/** Build all quality gate checks. Pushes incrementally to preserve partial results on error. Returns flaky status. */
function _buildChecks(
    checks: GateCheck[],
    health: HealthScoreResult,
    runs: MetricsRun[],
    opts: ExtendedGateOptions,
): 'pass' | 'fail' {
    const builders: Array<(h: HealthScoreResult, r: MetricsRun[], o: ExtendedGateOptions) => GateCheck> = [
        _healthCheck,
        _passRateCheck,
    ];
    for (const fn of builders) {
        checks.push(fn(health, runs, opts));
    }

    const { check: flakyCheck, status: flakyStatus } = _flakyCheck(runs, opts);
    checks.push(flakyCheck);

    checks.push(_coverageCheck(health, opts));
    checks.push(_suiteSpeedCheck(health, runs, opts));

    return flakyStatus;
}

/** Trigger flaky auto-actions as fire-and-forget when the flaky gate fails and Jira is configured. */
function _maybeTriggerFlakyActions(flakyCheck: 'pass' | 'fail', project?: string): void {
    if (flakyCheck !== 'fail' || !Config.get('jiraBaseUrl') || !Config.get('jiraPersonalToken')) return;

    const jira = new JiraClient(
        Config.get('jiraPersonalToken'),
        Config.get('jiraBaseUrl') + '/rest/api/2',
        Config.get('jiraMode'),
    );
    const store = loadMetrics();
    const projectRuns = store.runs.filter((r) => r.project === (project ?? 'unknown'));
    if (projectRuns.length >= 5) {
        void executeFlakyActions({ runs: projectRuns }, jira, project ?? 'unknown', {
            autoCreateBug: true,
            minTotalRuns: 10,
            dedupSearch: true,
        }).catch((err) => {
            rootLogger.error(
                'Flaky auto-actions trigger failed: ' + (err instanceof Error ? err.message : String(err)),
            );
        });
    }
}

/** Aggregate checks into a final QualityGateResult. */
function _aggregateResult(checks: GateCheck[]): QualityGateResult {
    const overall = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
    const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
    return { overall, checks, score };
}

export function runQualityGate(options?: QualityGateOptions): QualityGateResult {
    const checks: GateCheck[] = [];
    try {
        const opts = _parseGateOptions(options);
        const { runs, store, isGitFallback } = _resolveMetrics(opts.project);

        if (runs.length < 1) {
            checks.push({
                name: 'metrics-data',
                status: 'pass',
                score: 100,
                threshold: 1,
                details: 'Sem dados históricos — gate não aplicável',
            });
            return { overall: 'pass', checks, score: 100 };
        }

        const health = calculateHealthScore(
            { ...store, runs },
            { ...loadEnvThresholds(), ...(isGitFallback ? { minCoverageGate: 0 } : {}) },
        );

        const flakyStatus = _buildChecks(checks, health, runs, { ...opts, isGitFallback });
        _maybeTriggerFlakyActions(flakyStatus, opts.project);
        return _aggregateResult(checks);
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
