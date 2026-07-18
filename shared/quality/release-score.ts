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

export interface ReleaseScoreResult {
    score: number;
    grade: string;
    breakdown: Array<{ label: string; score: number; status: 'pass' | 'fail' }>;
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
    tasksPct: number,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number,
    flakyRate: number,
): Array<{ label: string; score: number; status: 'pass' | 'fail' }> {
    const flkScore = invertFlakiness(flakyRate);
    const tasksRounded = Number.isFinite(tasksPct) ? Math.round(tasksPct) : 0;
    const healthRounded = Number.isFinite(healthScore) ? Math.round(healthScore) : 0;
    const coverageRounded = Number.isFinite(coveragePct) ? Math.round(coveragePct) : 0;
    const flkRounded = Number.isFinite(flkScore) ? Math.round(flkScore) : 0;
    return [
        { label: 'Tasks', score: tasksRounded, status: tasksRounded >= THRESHOLD ? 'pass' : 'fail' },
        { label: 'Health', score: healthRounded, status: healthGate },
        { label: 'Coverage', score: coverageRounded, status: coverageRounded >= THRESHOLD ? 'pass' : 'fail' },
        { label: 'Flakiness', score: flkRounded, status: flkRounded >= THRESHOLD ? 'pass' : 'fail' },
    ];
}

function buildRecommendation(
    tasksPct: number,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number,
    flakyRate: number,
): string {
    const failures: string[] = [];
    if (tasksPct < THRESHOLD) failures.push('tasks');
    if (healthGate === 'fail' || healthScore < THRESHOLD) failures.push('health');
    if (coveragePct < THRESHOLD) failures.push('coverage');
    if (invertFlakiness(flakyRate) < THRESHOLD) failures.push('flakiness');
    if (failures.length === 0) return 'All dimensions meet the release threshold. Ready for release.';
    return `Improve ${failures.join(', ')} before release.`;
}

export function calculateReleaseScore(
    tasksPct: number,
    healthScore: number,
    healthGate: 'pass' | 'fail',
    coveragePct: number,
    flakyRate: number,
): ReleaseScoreResult {
    const flkScore = invertFlakiness(flakyRate);
    const raw = tasksPct * TASKS_W + healthScore * HEALTH_W + coveragePct * COVERAGE_W + flkScore * FLAKINESS_W;
    const score = Number.isFinite(raw) ? Math.round(raw) : 0;
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
