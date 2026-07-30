/**
 * AI Generation Effectiveness Dashboard — aggregates AI feedback data.
 *
 * Compute layer: produces AiMetricsResult from feedback store.
 * Render layer: see ai-effectiveness-renderer.ts.
 *
 * @module ai-effectiveness
 */

export { generateAiEffectivenessHtml } from './ai-effectiveness-renderer.js';

interface AiFeedbackRecord {
    timestamp: string;
    promptVersion: string;
    testTitle: string;
    accepted: boolean;
    modificationReason?: string;
    user?: string;
}

interface AiFeedbackStore {
    records: AiFeedbackRecord[];
}

import type { AiMetricsResult } from '../types/data-hub-extensions.js';

export type { AiMetricsResult };

export function computeAiEffectiveness(store: AiFeedbackStore | null | undefined): AiMetricsResult {
    if (!store || store.records.length === 0) {
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

    const totalRecords = store.records.length;
    const accepted = store.records.filter((r) => r.accepted).length;
    const acceptanceRate = Math.round((accepted / totalRecords) * 100);
    const totalGenerated = totalRecords;
    const totalKept = store.records.filter((r) => r.accepted).length;
    const totalModified = store.records.filter((r) => !r.accepted && r.modificationReason !== 'deleted').length;
    const totalDeleted = store.records.filter((r) => !r.accepted && r.modificationReason === 'deleted').length;

    const versionMap = new Map<string, { count: number; accepted: number }>();
    for (const r of store.records) {
        const entry = versionMap.get(r.promptVersion) ?? { count: 0, accepted: 0 };
        entry.count++;
        if (r.accepted) entry.accepted++;
        versionMap.set(r.promptVersion, entry);
    }

    let topPromptVersion = '';
    let maxCount = 0;
    const byVersion: Array<{ version: string; count: number; acceptanceRate: number }> = [];
    for (const [version, data] of versionMap) {
        const rate = Math.round((data.accepted / data.count) * 100);
        byVersion.push({ version, count: data.count, acceptanceRate: rate });
        if (data.count > maxCount) {
            maxCount = data.count;
            topPromptVersion = version;
        }
    }

    const dateMap = new Map<string, { generated: number; accepted: number }>();
    for (const r of store.records) {
        const date = r.timestamp.slice(0, 10);
        const entry = dateMap.get(date) ?? { generated: 0, accepted: 0 };
        entry.generated++;
        if (r.accepted) entry.accepted++;
        dateMap.set(date, entry);
    }

    const trend: Array<{ date: string; acceptanceRate: number; generated: number }> = [];
    for (const [date, data] of dateMap) {
        const rate = Math.round((data.accepted / data.generated) * 100);
        trend.push({ date, acceptanceRate: rate, generated: data.generated });
    }
    trend.sort((a, b) => a.date.localeCompare(b.date));

    return {
        acceptanceRate,
        totalRecords,
        totalGenerated,
        totalKept,
        totalModified,
        totalDeleted,
        topPromptVersion,
        byVersion,
        trend,
        requirementScores: {},
        timestamp: new Date().toISOString(),
    };
}

import type { AiGenerationRecord } from '../types/llm.js';

/** Converts AiGenerationRecord[] (from DataHub) to AiFeedbackRecord[] for computeAiEffectiveness. */
export function convertGenerationRecordsToFeedback(records: AiGenerationRecord[] | null | undefined): {
    records: Array<{
        timestamp: string;
        promptVersion: string;
        testTitle: string;
        accepted: boolean;
        modificationReason?: string;
    }>;
} {
    if (!records || records.length === 0) {
        return { records: [] };
    }
    const feedbackRecords: Array<{
        timestamp: string;
        promptVersion: string;
        testTitle: string;
        accepted: boolean;
        modificationReason?: string;
    }> = [];
    for (const record of records) {
        if (!record.feedback) continue;
        for (const fb of record.feedback) {
            const accepted = fb.action === 'kept' || fb.action === 'modified';
            const entry: {
                timestamp: string;
                promptVersion: string;
                testTitle: string;
                accepted: boolean;
                modificationReason?: string;
            } = {
                timestamp: fb.recordedAt,
                promptVersion: record.promptVersion,
                testTitle: fb.testKey,
                accepted,
            };
            if (fb.reason) entry.modificationReason = fb.reason;
            feedbackRecords.push(entry);
        }
    }
    return { records: feedbackRecords };
}
