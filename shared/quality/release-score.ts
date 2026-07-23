/**
 * Release Readiness Score — weighted composite of tasks, health, coverage, and flakiness.
 *
 * D1 / Sprint 10: Pure-function composition of four dimensions into a single release
 * readiness score with grade, per-dimension breakdown, and recommendation.
 *
 * @module release-score
 */

import { buildHtmlPage } from '../report/html-factory.js';
import { buildCss } from '../report/report-styles.js';
import { buildReleaseSection } from '../report/report-sections.js';
import { formatDateISO } from '../date-utils.js';

/**
 * Dimension 5 Provenance — documents the source and justification for each weight and threshold.
 * @reference ISO/IEC 25023:2016 (coverage), DORA State of DevOps (flakiness)
 */
const RELEASE_SCORE_PROVENANCE = {
    weights: {
        tasks: { value: 0.25, source: 'Product management best practice', standard: 'Internal' },
        health: { value: 0.3, source: 'Quality gate composite', standard: 'Internal' },
        coverage: { value: 0.25, source: 'ISO/IEC 25023:2016', standard: 'ISO/IEC 25023:2016' },
        flakiness: { value: 0.2, source: 'DORA State of DevOps 2025', standard: 'DORA' },
    },
    threshold: { value: 70, source: 'Release readiness industry standard', standard: 'Internal' },
} as const;

// Validate provenance weights sum to 1.0
const _weightSum =
    RELEASE_SCORE_PROVENANCE.weights.tasks.value +
    RELEASE_SCORE_PROVENANCE.weights.health.value +
    RELEASE_SCORE_PROVENANCE.weights.coverage.value +
    RELEASE_SCORE_PROVENANCE.weights.flakiness.value;
if (Math.abs(_weightSum - 1.0) > 0.001) {
    throw new Error(`release-score: provenance weights must sum to 1.0, got ${_weightSum}`);
}

export interface ReleaseScoreBreakdownEntry {
    label: string;
    score: number;
    status: 'pass' | 'fail';
    /** true quando a dimensão não possui fonte de dado real (não fabricada). */
    noData?: boolean;
}

export interface ReleaseScoreResult {
    score: number;
    grade: string;
    breakdown: ReleaseScoreBreakdownEntry[];
    recommendation: string;
    timestamp: string;
}

const TASKS_W = 0.25;
const HEALTH_W = 0.3;
const COVERAGE_W = 0.25;
const FLAKINESS_W = 0.2;

const THRESHOLD = 70;

function computeGrade(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'needs_attention';
    return 'critical';
}

function invertFlakiness(flakyRate: number): number {
    if (!Number.isFinite(flakyRate)) return 0;
    return Math.max(0, Math.min(100, 100 - flakyRate));
}

function buildBreakdown(
    tasksPct: number | undefined,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number | undefined,
    flakyRate: number,
): ReleaseScoreBreakdownEntry[] {
    const flkScore = invertFlakiness(flakyRate);
    const mk = (label: string, value: number | undefined): ReleaseScoreBreakdownEntry => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return { label, score: 0, status: 'fail', noData: true };
        }
        const rounded = Math.round(value);
        return {
            label,
            score: rounded,
            status: rounded >= THRESHOLD ? 'pass' : 'fail',
        };
    };
    return [
        mk('Tasks', tasksPct),
        { label: 'Health', score: Math.round(healthScore), status: healthGate },
        mk('Coverage', coveragePct),
        mk('Flakiness', flkScore),
    ];
}

function buildRecommendation(
    tasksPct: number | undefined,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number | undefined,
    flakyRate: number,
): string {
    const failures: string[] = [];
    if (typeof tasksPct !== 'number' || !Number.isFinite(tasksPct)) failures.push('tasks (no data source)');
    else if (tasksPct < THRESHOLD) failures.push('tasks');
    if (healthGate === 'fail' || healthScore < THRESHOLD) failures.push('health');
    if (typeof coveragePct !== 'number' || !Number.isFinite(coveragePct)) failures.push('coverage (no data source)');
    else if (coveragePct < THRESHOLD) failures.push('coverage');
    if (invertFlakiness(flakyRate) < THRESHOLD) failures.push('flakiness');
    if (failures.length === 0) return 'All dimensions meet the release threshold. Ready for release.';
    return `Improve ${failures.join(', ')} before release.`;
}

export function calculateReleaseScore(
    tasksPct: number | undefined,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number | undefined,
    flakyRate: number,
): ReleaseScoreResult {
    const flkScore = invertFlakiness(flakyRate);
    const dims: Array<{ value: number | undefined; weight: number }> = [
        { value: tasksPct, weight: TASKS_W },
        { value: healthScore, weight: HEALTH_W },
        { value: coveragePct, weight: COVERAGE_W },
        { value: flkScore, weight: FLAKINESS_W },
    ];
    const available = dims.filter((d) => Number.isFinite(d.value));
    const weightSum = available.reduce((s, d) => s + d.weight, 0);
    const raw = available.reduce((s, d) => s + (d.value as number) * d.weight, 0);
    const score = weightSum > 0 && Number.isFinite(raw) ? Math.round(raw / weightSum) : 0;
    const grade = computeGrade(score);
    const breakdown = buildBreakdown(tasksPct, healthScore, healthGate, coveragePct, flakyRate);
    const recommendation = buildRecommendation(tasksPct, healthScore, healthGate, coveragePct, flakyRate);
    return { score, grade, breakdown, recommendation, timestamp: new Date().toISOString() };
}

export function generateReleaseScoreHtml(result: ReleaseScoreResult): string {
    const bodyContent =
        '<h1>Release Readiness Score</h1>' +
        buildReleaseSection(result.score, result.grade, result.breakdown, result.recommendation);
    return buildHtmlPage({
        title: 'Release Readiness Score',
        styles: buildCss(),
        theme: 'system',
        bodyContent,
        footer: `Generated by QA Tools · ${formatDateISO()}`,
    });
}
