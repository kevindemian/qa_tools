/** Quality gate orchestrator — composes health, coverage, and flakiness thresholds into a single pass/fail decision.
 *  Thresholds are FIXED — no env var overrides permitted.
 *  No git fallback bypass: if no metrics data exists, the gate fails. */
import { loadMetrics, calculateFlakiness } from './metrics.js';
import type { MetricsRun } from './metrics.js';
import { calculateHealthScore } from './health-score.js';
import type { HealthScoreResult } from './types.js';
import { rootLogger } from './logger.js';

/* ── Fixed thresholds — never overridable ─────────────────────────────── */

const THRESHOLDS = {
    minPassRate: 80,
    maxFlakyPct: 30,
    minCoverage: 70,
    maxSuiteSpeed: 8,
} as const;

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
}

/* ── Internal check item ──────────────────────────────────────────────── */

interface GateCheck {
    name: string;
    status: 'pass' | 'fail';
    score: number;
    threshold: number;
    details: string;
}

/* ── Check builders ───────────────────────────────────────────────────── */

function _healthCheck(health: HealthScoreResult): GateCheck {
    return {
        name: 'health-score',
        status: health.qualityGate,
        score: health.overall,
        threshold: 70,
        details: 'Health score: ' + health.overall + ' (' + health.grade + '), gate: ' + health.qualityGate,
    };
}

function _passRateCheck(health: HealthScoreResult): GateCheck {
    const status = health.dimensions.passRate.score >= THRESHOLDS.minPassRate ? 'pass' : 'fail';
    return {
        name: 'pass-rate',
        status,
        score: health.dimensions.passRate.score,
        threshold: THRESHOLDS.minPassRate,
        details: 'Pass rate: ' + health.dimensions.passRate.score + '% (threshold: ' + THRESHOLDS.minPassRate + '%)',
    };
}

function _flakyCheck(runs: MetricsRun[]): GateCheck {
    const flakyEntries = calculateFlakiness({ runs }, 2);

    // Compute total unique tests that appear in at least 2 runs (same minRuns as calculateFlakiness).
    // This is the correct denominator: flaky rate = flaky tests / total stable tests with enough data.
    const testRunCount = new Map<string, number>();
    for (const run of runs) {
        for (const t of run.tests) {
            testRunCount.set(t.title, (testRunCount.get(t.title) ?? 0) + 1);
        }
    }
    let totalConsidered = 0;
    for (const count of testRunCount.values()) {
        if (count >= 2) totalConsidered++;
    }

    const flakyPct = totalConsidered > 0 ? (flakyEntries.length / totalConsidered) * 100 : 0;
    const status = flakyPct <= THRESHOLDS.maxFlakyPct ? 'pass' : 'fail';
    return {
        name: 'flaky-rate',
        status,
        score: Math.round(flakyPct),
        threshold: THRESHOLDS.maxFlakyPct,
        details:
            'Flaky: ' +
            flakyEntries.length +
            ' of ' +
            totalConsidered +
            ' tests (' +
            Math.round(flakyPct) +
            '%, threshold: ' +
            THRESHOLDS.maxFlakyPct +
            '%)',
    };
}

function _coverageCheck(health: HealthScoreResult): GateCheck {
    const status = health.dimensions.coverage.score >= THRESHOLDS.minCoverage ? 'pass' : 'fail';
    return {
        name: 'coverage',
        status,
        score: health.dimensions.coverage.score,
        threshold: THRESHOLDS.minCoverage,
        details: 'Coverage: ' + health.dimensions.coverage.score + '% (threshold: ' + THRESHOLDS.minCoverage + '%)',
    };
}

function _suiteSpeedCheck(health: HealthScoreResult): GateCheck {
    const status = health.dimensions.suiteSpeed.score >= 100 - (THRESHOLDS.maxSuiteSpeed / 10) * 100 ? 'pass' : 'fail';
    return {
        name: 'suite-speed',
        status,
        score: health.dimensions.suiteSpeed.score,
        threshold: THRESHOLDS.maxSuiteSpeed,
        details:
            'Suite speed score: ' +
            health.dimensions.suiteSpeed.score +
            ' (threshold: ' +
            THRESHOLDS.maxSuiteSpeed +
            's/test)',
    };
}

/* ── Orchestration ────────────────────────────────────────────────────── */

function _buildChecks(checks: GateCheck[], health: HealthScoreResult, runs: MetricsRun[]): void {
    checks.push(_healthCheck(health));
    checks.push(_passRateCheck(health));
    checks.push(_flakyCheck(runs));
    checks.push(_coverageCheck(health));
    checks.push(_suiteSpeedCheck(health));
}

function _aggregateResult(checks: GateCheck[]): QualityGateResult {
    const overall = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
    const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
    return { overall, checks, score };
}

export function runQualityGate(options?: QualityGateOptions): QualityGateResult {
    const checks: GateCheck[] = [];
    try {
        const store = loadMetrics();
        const runs = options?.project ? store.runs.filter((r) => r.project === options.project) : store.runs;

        if (runs.length < 1) {
            checks.push({
                name: 'metrics-data',
                status: 'fail',
                score: 0,
                threshold: 1,
                details: 'Sem dados históricos — gate não aplicável',
            });
            return { overall: 'fail', checks, score: 0 };
        }

        const health = calculateHealthScore({ ...store, runs }, {});
        _buildChecks(checks, health, runs);
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
