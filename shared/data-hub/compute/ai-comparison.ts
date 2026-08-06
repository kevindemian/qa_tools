/**
 * Compute: AI Test Effectiveness Comparison — compares AI-generated tests vs
 * manually-written tests to answer "Are AI-generated tests better?".
 *
 * Pure compute layer: produces AiComparisonResult from records.
 * Render layer: shared/report/ai-comparison-renderer.ts (deleted in a later
 * phase — this module holds NO presentation logic).
 *
 * @module ai-comparison
 */

export interface AiComparisonRecord {
    testTitle: string;
    generatedBy: 'ai' | 'manual';
    accepted: boolean;
    passed: boolean;
    duration: number;
    flakiness: number;
    promptVersion: string;
    modificationReason?: string;
}

export interface AiComparisonResult {
    aiTotal: number;
    aiPassRate: number;
    aiFlakinessAvg: number;
    aiAcceptanceRate: number;
    manualTotal: number;
    manualPassRate: number;
    manualFlakinessAvg: number;
    manualAcceptanceRate: number;
    aiAdvantage: 'pass_rate' | 'flakiness' | 'none';
    byVersion: Array<{ version: string; count: number; passRate: number }>;
    timestamp: string;
}

interface GroupSummary {
    total: number;
    passRate: number;
    flakinessAvg: number;
    acceptanceRate: number;
}

function summarizeGroup(records: AiComparisonRecord[]): GroupSummary {
    const total = records.length;
    if (total === 0) {
        return { total: 0, passRate: 0, flakinessAvg: 0, acceptanceRate: 0 };
    }
    const passed = records.filter((r) => r.passed).length;
    const accepted = records.filter((r) => r.accepted).length;
    const flakinessSum = records.reduce((s, r) => s + r.flakiness, 0);
    return {
        total,
        passRate: Math.round((passed / total) * 100),
        flakinessAvg: flakinessSum / total,
        acceptanceRate: accepted / total,
    };
}

export function compareAiVsManual(records: AiComparisonRecord[] | null | undefined): AiComparisonResult {
    const timestamp = new Date().toISOString();

    if (!records || records.length === 0) {
        return {
            aiTotal: 0,
            aiPassRate: 0,
            aiFlakinessAvg: 0,
            aiAcceptanceRate: 0,
            manualTotal: 0,
            manualPassRate: 0,
            manualFlakinessAvg: 0,
            manualAcceptanceRate: 0,
            aiAdvantage: 'none',
            byVersion: [],
            timestamp,
        };
    }

    const aiRecords = records.filter((r) => r.generatedBy === 'ai');
    const manualRecords = records.filter((r) => r.generatedBy === 'manual');

    const ai = summarizeGroup(aiRecords);
    const manual = summarizeGroup(manualRecords);

    const aiTotal = ai.total;
    const aiPassRate = ai.passRate;
    const aiFlakinessAvg = ai.flakinessAvg;
    const aiAcceptanceRate = ai.acceptanceRate;

    const manualTotal = manual.total;
    const manualPassRate = manual.passRate;
    const manualFlakinessAvg = manual.flakinessAvg;
    const manualAcceptanceRate = manual.acceptanceRate;

    let aiAdvantage: 'pass_rate' | 'flakiness' | 'none' = 'none';
    if (aiTotal > 0 && manualTotal > 0) {
        if (aiPassRate > manualPassRate) {
            aiAdvantage = 'pass_rate';
        } else if (aiFlakinessAvg < manualFlakinessAvg) {
            aiAdvantage = 'flakiness';
        }
    }

    const versionMap = new Map<string, { count: number; passed: number }>();
    for (const r of aiRecords) {
        const v = r.promptVersion || 'unknown';
        const entry = versionMap.get(v) ?? { count: 0, passed: 0 };
        entry.count++;
        if (r.passed) entry.passed++;
        versionMap.set(v, entry);
    }

    const byVersion: Array<{ version: string; count: number; passRate: number }> = [];
    for (const [version, data] of versionMap) {
        byVersion.push({
            version,
            count: data.count,
            passRate: Math.round((data.passed / data.count) * 100),
        });
    }

    return {
        aiTotal,
        aiPassRate,
        aiFlakinessAvg,
        aiAcceptanceRate,
        manualTotal,
        manualPassRate,
        manualFlakinessAvg,
        manualAcceptanceRate,
        aiAdvantage,
        byVersion,
        timestamp,
    };
}
