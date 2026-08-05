/**
 * Compute: AI Metrics.
 *
 * Computes acceptance rates, version breakdowns, and trend data from AI
 * generation records. Feeds ai-effectiveness, ai-comparison, and
 * requirement-score dashboards.
 *
 * @reference ISTQB CTFL — requirement acceptance & validation
 * @reference ISO/IEC 25010:2023 — product quality grade bands
 *
 * SSOT: All AI metrics computed here. Renderers consume directly.
 */
import type { AiGenerationRecord } from '../../types/llm.js';
import type { AiMetricsResult, AiVersionMetric, AiTrendPoint } from '../../types/data-hub-extensions.js';

const DATE_PATTERN = /^(\d{4}-\d{2}-\d{2})/;

interface AggBucket {
    count: number;
    kept: number;
    modified: number;
}
interface DateBucket {
    generated: number;
    accepted: number;
}

/**
 * Compute AI effectiveness metrics from generation records.
 *
 * @param records - AiGenerationRecord[] from DataHub.raw.aiRecords.
 * @returns AiMetricsResult with all computed metrics.
 */
export function computeAiMetrics(records: AiGenerationRecord[]): AiMetricsResult {
    if (records.length === 0) {
        return {
            acceptanceRate: 0,
            totalRecords: 0,
            totalGenerated: 0,
            totalKept: 0,
            totalModified: 0,
            totalDeleted: 0,
            topPromptVersion: '',
            byVersion: [],
            trend: [],
            requirementScores: {},
            timestamp: new Date().toISOString(),
        };
    }

    let totalKept = 0;
    let totalModified = 0;
    let totalDeleted = 0;
    let totalGenerated = 0;
    const versionMap = new Map<string, AggBucket>();
    const dateMap = new Map<string, DateBucket>();
    const reqMap = new Map<string, AggBucket>();

    for (const record of records) {
        const testCount = record.generatedTests.length;
        totalGenerated += testCount;

        const feedback = record.feedback ?? [];
        const accepted = feedback.some((f) => f.action === 'kept' || f.action === 'modified');
        const deleted = feedback.some((f) => f.action === 'deleted');

        if (accepted) totalKept += testCount;
        else if (deleted) totalDeleted += testCount;
        else totalModified += testCount;

        accumulateAgg(versionMap, record.promptVersion || 'unknown', testCount, accepted, deleted);

        const date = extractDate(record.generatedAt);
        if (date) accumulateDate(dateMap, date, testCount, accepted);

        accumulateAgg(reqMap, record.userStory || 'unknown', testCount, accepted, deleted);
    }

    const acceptanceRate = totalGenerated > 0 ? Math.round(((totalKept + totalModified) / totalGenerated) * 100) : 0;

    const byVersion = buildByVersion(versionMap);
    const trend = buildTrend(dateMap);
    const requirementScores = buildScores(reqMap);

    return {
        acceptanceRate,
        totalRecords: records.length,
        totalGenerated,
        totalKept,
        totalModified,
        totalDeleted,
        topPromptVersion: byVersion[0]?.version ?? '',
        byVersion,
        trend,
        requirementScores,
        timestamp: new Date().toISOString(),
    };
}

function accumulateAgg(
    map: Map<string, AggBucket>,
    key: string,
    count: number,
    accepted: boolean,
    deleted: boolean,
): void {
    const existing = map.get(key);
    if (existing) {
        existing.count += count;
        if (accepted) existing.kept += count;
        else if (!deleted) existing.modified += count;
    } else {
        map.set(key, {
            count,
            kept: accepted ? count : 0,
            modified: !accepted && !deleted ? count : 0,
        });
    }
}

function accumulateDate(map: Map<string, DateBucket>, date: string, count: number, accepted: boolean): void {
    const existing = map.get(date);
    if (existing) {
        existing.generated += count;
        if (accepted) existing.accepted += count;
    } else {
        map.set(date, { generated: count, accepted: accepted ? count : 0 });
    }
}

function buildByVersion(versionMap: Map<string, AggBucket>): AiVersionMetric[] {
    return [...versionMap.entries()]
        .sort(([, a], [, b]) => b.count - a.count)
        .map(([version, data]) => ({
            version,
            count: data.count,
            acceptanceRate: data.count > 0 ? Math.round((data.kept / data.count) * 100) : 0,
        }));
}

function buildTrend(dateMap: Map<string, DateBucket>): AiTrendPoint[] {
    return [...dateMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => ({
            date,
            acceptanceRate: data.generated > 0 ? Math.round((data.accepted / data.generated) * 100) : 0,
            generated: data.generated,
        }));
}

function buildScores(reqMap: Map<string, AggBucket>): Record<string, number> {
    const scores = new Map<string, number>();
    for (const [reqId, data] of reqMap) {
        const acceptanceScore = data.count > 0 ? Math.round((data.kept / data.count) * 100) : 0;
        const retentionRate = data.count > 0 ? Math.min(100, ((data.kept + data.modified) / data.count) * 100) : 0;
        const volumeScore = Math.min(100, (data.count / 10) * 100);
        scores.set(reqId, Math.round(acceptanceScore * 0.5 + retentionRate * 0.3 + volumeScore * 0.2));
    }
    return Object.fromEntries(scores);
}

function extractDate(timestamp: string | undefined): string | undefined {
    if (!timestamp) return undefined;
    const match = DATE_PATTERN.exec(timestamp);
    return match?.[1];
}
