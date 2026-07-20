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
import type { HealthScoreResult } from '../types.js';
import type { DataHub } from '../types/data-hub.js';
import type { QualityCategory } from '../data-hub/quality.js';
import { rootLogger } from '../logger.js';
import { extractErrorMessage } from '../ui/prompt-errors.js';
import { humanizeError } from '../ui/prompt-errors.js';

/* ── Fixed thresholds — never overridable ─────────────────────────────── */

const THRESHOLDS = {
    minPassRate: 80,
    maxFlakyPct: 30,
    minCoverage: 70,
    maxSuiteSpeed: 8,
    minHealthScore: 70,
} as const;

export type QualityGateStatus = 'pass' | 'fail' | 'unknown';

export interface QualityGateResult {
    overall: QualityGateStatus;
    checks: Array<{
        name: string;
        status: QualityGateStatus;
        score: number;
        threshold: number;
        details: string;
    }>;
    score: number;
    /** EIXO C awareness: data categories expected but absent from the unified model. */
    incompleteItems?: string[];
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
    status: QualityGateStatus;
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

function _availableStatus(dim: { available: boolean; score: number }, threshold: number): QualityGateStatus {
    if (!dim.available) return 'unknown';
    return dim.score >= threshold ? 'pass' : 'fail';
}

function _passRateCheck(health: HealthScoreResult): GateCheck {
    const dim = health.dimensions.passRate;
    const status = _availableStatus(dim, THRESHOLDS.minPassRate);
    return {
        name: 'pass-rate',
        status,
        score: dim.score,
        threshold: THRESHOLDS.minPassRate,
        details: !dim.available
            ? 'Pass rate: dados indisponíveis (N/A)'
            : 'Pass rate: ' + dim.score + '% (threshold: ' + THRESHOLDS.minPassRate + '%)',
    };
}

/** Check flaky rate against threshold. Reads from DataHub.computed — SSOT. */
function _flakyCheck(dataHub: DataHub): GateCheck {
    const flakyPct = dataHub.computed.flakyPercentage ?? 0;
    const status: GateCheck['status'] = flakyPct <= THRESHOLDS.maxFlakyPct ? 'pass' : 'fail';
    return {
        name: 'flaky-rate',
        status,
        score: Math.round(flakyPct),
        threshold: THRESHOLDS.maxFlakyPct,
        details: 'Flaky: ' + Math.round(flakyPct) + '% (threshold: ' + THRESHOLDS.maxFlakyPct + '%)',
    };
}

function _coverageCheck(health: HealthScoreResult): GateCheck {
    const dim = health.dimensions.coverage;
    const status = _availableStatus(dim, THRESHOLDS.minCoverage);
    return {
        name: 'coverage',
        status,
        score: dim.score,
        threshold: THRESHOLDS.minCoverage,
        details: !dim.available
            ? 'Coverage: dados indisponíveis (N/A)'
            : 'Coverage: ' + dim.score + '% (threshold: ' + THRESHOLDS.minCoverage + '%)',
    };
}

/** Check suite speed P95 against threshold. Reads from DataHub.computed — SSOT. */
function _suiteSpeedCheck(health: HealthScoreResult, dataHub: DataHub): GateCheck {
    const p95 = Number.isFinite(dataHub.computed.suiteSpeedP95) ? dataHub.computed.suiteSpeedP95 : 0;
    const thresholdMs = THRESHOLDS.maxSuiteSpeed * 1000;
    const status: GateCheck['status'] = p95 <= thresholdMs ? 'pass' : 'fail';
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
    const anyFail = checks.some((c) => c.status === 'fail');
    const anyUnknown = checks.some((c) => c.status === 'unknown');
    // A present-but-failing check is a hard fail; a missing (unknown) check is NOT
    // silently forced to fail (user decision + AGENTS.md §24/§25).
    let overall: QualityGateStatus = 'pass';
    if (anyFail) overall = 'fail';
    else if (anyUnknown) overall = 'unknown';
    const scored = checks.filter((c) => c.status !== 'unknown');
    const score = scored.length > 0 ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : 0;
    return { overall, checks, score, incompleteItems: [] };
}

/**
 * EIXO C awareness: extend the gate to the ST-1 data categories consumed via the
 * typed accessor surface. Each present category is gated by its `getQuality()`
 * validity and its provenance confidence; absent categories are reported in
 * `incompleteItems` (their absence does not by itself fail the gate).
 */
const EXTENDED_QUALITY_CATEGORIES: QualityCategory[] = [
    'securityFindings',
    'failureRecords',
    'deployments',
    'releases',
    'doraMetrics',
    'pmIssues',
    'coverageFiles',
    'performanceMetrics',
];

function _categoryItemCount(hub: DataHub, category: QualityCategory): number {
    switch (category) {
        case 'securityFindings':
            return hub.getSecurityFindings()?.length ?? 0;
        case 'failureRecords':
            return hub.getFailureRecords()?.length ?? 0;
        case 'deployments':
            return hub.getDeployments()?.length ?? 0;
        case 'releases':
            return hub.getReleases()?.length ?? 0;
        case 'doraMetrics':
            return hub.getDoraMetrics() ? 1 : 0;
        case 'pmIssues':
            return hub.getPmIssues()?.length ?? 0;
        case 'coverageFiles':
            return hub.getCoverageFiles()?.length ?? 0;
        case 'performanceMetrics':
            return hub.getPerformanceMetrics() ? 1 : 0;
        default:
            return 0;
    }
}

function _buildCategoryChecks(checks: GateCheck[], incompleteItems: string[], hub: DataHub): void {
    for (const category of EXTENDED_QUALITY_CATEGORIES) {
        const count = _categoryItemCount(hub, category);
        if (count === 0) {
            incompleteItems.push(category);
            continue;
        }
        const report = hub.getQuality(category);
        const valid = report ? report.valid : true;
        const provenance = hub.getProvenance()?.get(category);
        const confidence = provenance && Number.isFinite(provenance.confidence) ? provenance.confidence : 1;
        const score = valid ? Math.round(confidence * 100) : 0;
        checks.push({
            name: `data-quality:${category}`,
            status: valid ? 'pass' : 'fail',
            score,
            threshold: 100,
            details: valid
                ? `${category}: ${count} item(s), confidence ${Math.round(confidence * 100)}%`
                : `${category}: quality issues — ${(report?.issues ?? []).join('; ') || 'invalid'}`,
        });
    }
}

export function runQualityGate(options: QualityGateOptions): QualityGateResult {
    const checks: GateCheck[] = [];
    const incompleteItems: string[] = [];
    try {
        const hub = options.dataHub;
        const runs = options.project ? hub.getRuns().filter((r) => r.head_branch === options.project) : hub.getRuns();

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
                return { overall: 'fail', checks, score: 0, incompleteItems: [] };
            }
        }

        const healthConfig =
            options.coverageOverride !== undefined
                ? {
                      coverageOverride: options.coverageOverride,
                      dataHub: hub,
                      ...(options.project ? { branch: options.project } : {}),
                  }
                : { dataHub: hub, ...(options.project ? { branch: options.project } : {}) };
        const health = calculateHealthScore(healthConfig);
        _buildChecks(checks, health, hub);
        _buildCategoryChecks(checks, incompleteItems, hub);
        const result = _aggregateResult(checks);
        return { ...result, incompleteItems };
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
        return { overall: 'fail', checks, score: 0, incompleteItems: [] };
    }
}

function gateStatusIcon(status: QualityGateStatus): string {
    if (status === 'pass') return '✅';
    if (status === 'unknown') return '❓';
    return '❌';
}

export function formatQualityGateJson(result: QualityGateResult): string {
    return JSON.stringify(result, null, 2);
}

export function formatQualityGateText(result: QualityGateResult): string {
    let output = '';
    output += '\n=== Quality Gate ===\n';
    const overallLabel = gateStatusIcon(result.overall) + ' ' + result.overall.toUpperCase();
    output += 'Overall: ' + overallLabel + '\n';
    output += 'Score: ' + result.score + '\n\n';
    output += 'Checks:\n';
    for (const check of result.checks) {
        output +=
            '  ' +
            gateStatusIcon(check.status) +
            ' ' +
            check.name +
            ' — ' +
            check.score +
            '/' +
            check.threshold +
            ' — ' +
            check.details +
            '\n';
    }
    output += '\n';
    return output;
}
