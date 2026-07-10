/**
 * Quality gate orchestrator — composes health, coverage, and flakiness thresholds
 * into a single pass/fail decision.
 *
 * Thresholds are FIXED — no env var overrides permitted.
 * No git fallback bypass: if no metrics data exists, the gate fails.
 *
 * DataHub is the SOLE source of truth for all metrics.
 * MetricsStore is NOT used — all data comes from DataHub.raw.* and DataHub.computed.*.
 */
import { calculateHealthScore } from './health-score.js';
import type { HealthScoreResult } from './types.js';
import type { DataHub } from './types/data-hub.js';
import { rootLogger } from './logger.js';
import { extractErrorMessage } from './prompt-errors.js';
import { humanizeError } from './prompt-errors.js';

/* ── Fixed thresholds — never overridable ─────────────────────────────── */

const THRESHOLDS = {
    minPassRate: 80,
    maxFlakyPct: 30,
    minCoverage: 70,
    maxSuiteSpeed: 8,
    minHealthScore: 70,
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
    /** Coverage override from Istanbul — used to match health score calculation in PR report. */
    coverageOverride?: number | undefined;
    /** Data Hub — REQUIRED. Sole source of truth for all metrics. */
    dataHub: DataHub;
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
        threshold: THRESHOLDS.minHealthScore,
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

/** Check flaky rate against threshold. Reads from DataHub.computed — SSOT. */
function _flakyCheck(dataHub: DataHub): GateCheck {
    const flakyPct = dataHub.computed.flakyPercentage ?? 0;
    const status = flakyPct <= THRESHOLDS.maxFlakyPct ? 'pass' : 'fail';
    return {
        name: 'flaky-rate',
        status,
        score: Math.round(flakyPct),
        threshold: THRESHOLDS.maxFlakyPct,
        details: 'Flaky: ' + Math.round(flakyPct) + '% (threshold: ' + THRESHOLDS.maxFlakyPct + '%)',
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

/** Check suite speed P95 against threshold. Reads from DataHub.computed — SSOT. */
function _suiteSpeedCheck(health: HealthScoreResult, dataHub: DataHub): GateCheck {
    const p95 = dataHub.computed.suiteSpeedP95;
    const thresholdMs = THRESHOLDS.maxSuiteSpeed * 1000;
    const status = p95 <= thresholdMs ? 'pass' : 'fail';
    return {
        name: 'suite-speed',
        status,
        score: health.dimensions.suiteSpeed.score,
        threshold: THRESHOLDS.maxSuiteSpeed,
        details: 'Suite speed p95: ' + p95 + 'ms (threshold: ' + THRESHOLDS.maxSuiteSpeed + 's)',
    };
}

/* ── Orchestration ────────────────────────────────────────────────────── */

/** Build all quality gate checks, delegating to DataHub compute — SSOT. */
function _buildChecks(checks: GateCheck[], health: HealthScoreResult, dataHub: DataHub): void {
    checks.push(_healthCheck(health));
    checks.push(_passRateCheck(health));
    checks.push(_flakyCheck(dataHub));
    checks.push(_coverageCheck(health));
    checks.push(_suiteSpeedCheck(health, dataHub));
}

function _aggregateResult(checks: GateCheck[]): QualityGateResult {
    const overall = checks.every((c) => c.status === 'pass') ? 'pass' : 'fail';
    const score = Math.round(checks.reduce((s, c) => s + c.score, 0) / checks.length);
    return { overall, checks, score };
}

export function runQualityGate(options: QualityGateOptions): QualityGateResult {
    const checks: GateCheck[] = [];
    try {
        const hub = options.dataHub;
        const runs = options.project ? hub.raw.runs.filter((r) => r.head_branch === options.project) : hub.raw.runs;

        if (runs.length < 1) {
            const hasComputedData =
                hub.computed.passRate > 0 ||
                hub.computed.coverage > 0 ||
                (hub.computed.executionRate ?? 0) > 0 ||
                hub.computed.suiteSpeedP95 > 0;
            if (!hasComputedData) {
                checks.push({
                    name: 'metrics-data',
                    status: 'fail',
                    score: 0,
                    threshold: 1,
                    details:
                        'Sem dados históricos — gate não aplicável. Execute uma pipeline de testes para gerar métricas.',
                });
                return { overall: 'fail', checks, score: 0 };
            }
        }

        const healthConfig =
            options.coverageOverride !== undefined
                ? { coverageOverride: options.coverageOverride, dataHub: hub }
                : { dataHub: hub };
        const health = calculateHealthScore(healthConfig);
        _buildChecks(checks, health, hub);
        return _aggregateResult(checks);
    } catch (err: unknown) {
        const raw = extractErrorMessage(err);
        const known = humanizeError(raw);
        const errorMsg = known ? known.msg : raw;
        rootLogger.error('Quality gate error — verifique o backend de métricas: ' + errorMsg);
        checks.push({
            name: 'error',
            status: 'fail',
            score: 0,
            threshold: 0,
            details: 'Erro no quality gate — verifique permissões e dados de métricas: ' + errorMsg,
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
        output +=
            '  ' + icon + ' ' + check.name + ' — ' + check.score + '/' + check.threshold + ' — ' + check.details + '\n';
    }
    output += '\n';
    return output;
}
