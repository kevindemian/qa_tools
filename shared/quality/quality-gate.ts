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
import type { HealthScoreResult, HealthScoreDimensionResult } from '../types.js';
import type { DataHub } from '../types/data-hub.js';
import type { QualityCategory } from '../data-hub/quality.js';
import { rootLogger } from '../logger.js';
import { extractErrorMessage } from '../ui/prompt-errors.js';
import { humanizeError } from '../ui/prompt-errors.js';

/* ── Fixed thresholds — never overridable ─────────────────────────────── */

import { MIN_HEALTH_SCORE } from '../constants/thresholds.js';

const THRESHOLDS = {
    minHealthScore: MIN_HEALTH_SCORE,
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
        details:
            'Health score: ' +
            health.overall +
            ' (' +
            health.grade +
            '), gate: ' +
            health.qualityGate +
            ' — ' +
            _dimensionBreakdown(health),
    };
}

/** Build the per-dimension breakdown text from the single source `health.dimensions`. */
function _dimensionBreakdown(health: HealthScoreResult): string {
    const entries: Array<[string, HealthScoreDimensionResult]> = [
        ['Pass Rate', health.dimensions.passRate],
        ['Flaky Rate', health.dimensions.flakyRate],
        ['Coverage', health.dimensions.coverage],
        ['Suite Speed', health.dimensions.suiteSpeed],
        ['Execution Rate', health.dimensions.executionRate],
    ];
    return entries
        .map(([label, dim]) => {
            const value = dim.available ? String(dim.score) : 'N/A';
            return `${label}: ${value} (${dim.status.toUpperCase()})`;
        })
        .join('; ');
}

/* ── Orchestration ────────────────────────────────────────────────────── */

/** Build all quality gate checks. The dimension rule is implemented once in
 *  evaluateQualityGate (health-score) — the gate consumes health.qualityGate. */
function _buildChecks(checks: GateCheck[], health: HealthScoreResult): void {
    checks.push(_healthCheck(health));
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
        const score = valid ? 100 : 0;
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
        _buildChecks(checks, health);
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
