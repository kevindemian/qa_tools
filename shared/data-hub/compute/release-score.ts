/**
 * Compute: Release Score.
 *
 * Calculates a composite release readiness score from health dimensions.
 * Single implementation (B3 — SSOT): the 5-dimension model computed by the
 * DataHub. Produces the enriched ReleaseScoreResult (breakdown, recommendation,
 * timestamp) consumed by the release-score renderer.
 *
 * Availability (B2/§25): a dimension whose data source is ABSENT is excluded
 * from the weighted score and marked `noData` in the breakdown — never scored 0
 * and dragged into the composite.
 *
 * @reference DORA — release readiness requires holistic quality assessment
 */
import type {
    HealthDimensions,
    DimensionScore,
    ReleaseScoreResult,
    ReleaseScoreBreakdownEntry,
    ReleaseScoreAvailability,
} from '../../types/data-hub.js';
import type { DimensionWeights } from './types.js';
import { DEFAULT_WEIGHTS } from './types.js';
import { computeGrade } from './scoring.js';

/** Display labels for each health dimension (5-dimension model). */
const DIMENSION_LABELS: ReadonlyArray<{ key: keyof HealthDimensions; label: string }> = [
    { key: 'passRate', label: 'Pass Rate' },
    { key: 'flakyRate', label: 'Flaky Rate' },
    { key: 'coverage', label: 'Coverage' },
    { key: 'suiteSpeed', label: 'Suite Speed' },
    { key: 'executionRate', label: 'Execution Rate' },
];

function allAvailable(): ReleaseScoreAvailability {
    return { passRate: true, flakyRate: true, coverage: true, suiteSpeed: true, executionRate: true };
}

function buildBreakdown(
    dimensions: HealthDimensions,
    availability: ReleaseScoreAvailability,
): ReleaseScoreBreakdownEntry[] {
    return DIMENSION_LABELS.map(({ key, label }) => {
        const dim = dimensions[key];
        if (!availability[key]) {
            return { label, score: 0, status: 'fail', noData: true };
        }
        return { label, score: dim.score, status: dim.status };
    });
}

function buildRecommendation(breakdown: ReleaseScoreBreakdownEntry[]): string {
    const missing = breakdown.filter((d) => d.noData);
    if (missing.length === breakdown.length) {
        return 'Insufficient data — release score could not be assessed.';
    }
    const failing = breakdown.filter((d) => !d.noData && d.status === 'fail');
    const parts: string[] = [];
    if (failing.length > 0) {
        parts.push(`Improve ${failing.map((d) => d.label).join(', ')} before release.`);
    }
    if (missing.length > 0) {
        parts.push(`Insufficient data for ${missing.map((d) => d.label).join(', ')} — assessment is partial.`);
    }
    if (parts.length === 0) {
        return 'All dimensions meet the release threshold. Ready for release.';
    }
    return parts.join(' ');
}

/**
 * Calculate a weighted release score from individual dimension scores.
 *
 * @param dimensions - Pre-calculated dimension scores.
 * @param weights - Dimension weights.
 * @param availability - Per-dimension data availability; unavailable dimensions
 *   are excluded from the weighted score and marked noData in the breakdown.
 * @returns Enriched ReleaseScoreResult (score, dimensions, grade, breakdown, recommendation, timestamp).
 */
export function calcReleaseScore(
    dimensions: HealthDimensions,
    weights: DimensionWeights = DEFAULT_WEIGHTS,
    availability?: ReleaseScoreAvailability,
): ReleaseScoreResult {
    const av = availability ?? allAvailable();

    const availableKeys = DIMENSION_LABELS.filter(({ key }) => av[key]);
    const totalWeight = availableKeys.reduce((sum, { key }) => sum + weights[key], 0);
    const weightedScore = availableKeys.reduce(
        (sum, { key }) => sum + dimensions[key].score * (weights[key] / (totalWeight > 0 ? totalWeight : 1)),
        0,
    );

    const score = totalWeight > 0 && Number.isFinite(weightedScore) ? Math.round(weightedScore * 100) / 100 : 0;
    const grade = totalWeight > 0 ? computeGrade(score) : 'unknown';

    const breakdown = buildBreakdown(dimensions, av);
    const recommendation = buildRecommendation(breakdown);

    return {
        score,
        dimensions,
        grade,
        breakdown,
        recommendation,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Create a DimensionScore from a raw score and threshold.
 */
export function makeDimensionScore(score: number, threshold: number): DimensionScore {
    return {
        score: Math.round(score * 100) / 100,
        status: score >= threshold ? 'pass' : 'fail',
    };
}
