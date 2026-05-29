/** Utility functions for coverage gap analysis: type normalization, priority weighting,
 *  epic extraction, link parsing, and aggregate calculations. */
import type { CoverageGapItem, CoverageGapResult, EpicCoverage } from './types';

export const PRIORITY_WEIGHTS: Record<string, number> = {
    Blocker: 5,
    High: 3,
    Medium: 2,
    Low: 1,
    Trivial: 0.5,
};

export function getCoverageWeight(priority: string): number {
    const w = PRIORITY_WEIGHTS[priority];
    return w !== undefined ? w : 2;
}

export function normalizeType(rawType: string): 'Story' | 'Task' | 'Bug' | 'Epic' {
    const upper = rawType.toLowerCase();
    if (upper === 'story') return 'Story';
    if (upper === 'bug') return 'Bug';
    if (upper === 'epic') return 'Epic';
    return 'Task';
}

export function extractEpicKey(fields: Record<string, unknown>): string | undefined {
    const epicField = fields['customfield_10014'] ?? fields['epic'] ?? fields['Epic'];
    if (!epicField) return undefined;
    if (typeof epicField === 'string') return epicField;
    if (typeof epicField === 'object' && epicField !== null) {
        return (epicField as Record<string, unknown>).key as string;
    }
    return undefined;
}

export function extractLinkedTestKeys(fields: Record<string, unknown>): string[] {
    const links = fields['issuelinks'];
    if (!Array.isArray(links)) return [];
    const keys: string[] = [];
    for (const link of links) {
        const linkType = link?.type as Record<string, unknown> | undefined;
        if (!linkType || linkType.name !== 'Test') continue;
        const inward = link?.inwardIssue as Record<string, unknown> | undefined;
        const outward = link?.outwardIssue as Record<string, unknown> | undefined;
        if (inward?.key) keys.push(inward.key as string);
        if (outward?.key) keys.push(outward.key as string);
    }
    return keys;
}

export function buildCoverageItems(
    issues: Array<{ key: string; fields: Record<string, unknown> }>,
    testLinkMap: Map<string, string[]>,
    epicsMap: Map<string, string>,
): CoverageGapItem[] {
    return issues.map((issue) => {
        const fields = issue.fields;
        const summary = (fields.summary as string) || '';
        const rawType = ((fields.issuetype as Record<string, unknown>)?.name as string) || '';
        const status = ((fields.status as Record<string, unknown>)?.name as string) || '';
        const priority = ((fields.priority as Record<string, unknown>)?.name as string) || 'Medium';
        const epicKey = extractEpicKey(fields);
        const linkedTestKeys = extractLinkedTestKeys(fields);
        const fallbackKeys = testLinkMap.get(issue.key) || [];
        const allKeys = Array.from(new Set([...linkedTestKeys, ...fallbackKeys]));
        return {
            issueKey: issue.key,
            summary,
            type: normalizeType(rawType),
            status,
            epicKey,
            epicSummary: epicKey ? epicsMap.get(epicKey) : undefined,
            hasTest: allKeys.length > 0,
            linkedTestKeys: allKeys,
            priority,
            coverageWeight: getCoverageWeight(priority),
        };
    });
}

export function calculateTotals(items: CoverageGapItem[]): CoverageGapResult['totals'] {
    const totalIssues = items.length;
    const covered = items.filter((i) => i.hasTest).length;
    const gap = totalIssues - covered;
    let weightedSum = 0;
    let weightedCovered = 0;
    for (const item of items) {
        weightedSum += item.coverageWeight;
        if (item.hasTest) weightedCovered += item.coverageWeight;
    }
    const weightedCoveragePct = weightedSum > 0 ? Math.round((weightedCovered / weightedSum) * 100) : 0;
    const rawCoveragePct = totalIssues > 0 ? Math.round((covered / totalIssues) * 100) : 0;
    return { totalIssues, covered, gap, weightedCoveragePct, rawCoveragePct };
}

export function buildEpicRollup(items: CoverageGapItem[], epicsMap: Map<string, string>): Record<string, EpicCoverage> {
    const byEpic: Record<string, EpicCoverage> = {};
    for (const item of items) {
        const epicKey = item.epicKey || '__no_epic__';
        if (!byEpic[epicKey]) {
            byEpic[epicKey] = {
                epicSummary: epicKey === '__no_epic__' ? 'No Epic' : epicsMap.get(epicKey) || item.epicSummary || '',
                total: 0,
                covered: 0,
                weightedPct: 0,
                rawPct: 0,
                gatePass: true,
                issues: [],
            };
        }
        byEpic[epicKey].issues.push(item);
    }
    for (const key of Object.keys(byEpic)) {
        const epic = byEpic[key]!;
        epic.total = epic.issues.length;
        epic.covered = epic.issues.filter((i) => i.hasTest).length;
        epic.rawPct = epic.total > 0 ? Math.round((epic.covered / epic.total) * 100) : 0;
        let wSum = 0;
        let wCov = 0;
        for (const i of epic.issues) {
            wSum += i.coverageWeight;
            if (i.hasTest) wCov += i.coverageWeight;
        }
        epic.weightedPct = wSum > 0 ? Math.round((wCov / wSum) * 100) : 0;
    }
    return byEpic;
}

export function checkQualityGate(
    byEpic: Record<string, EpicCoverage>,
    minCoveragePct: number,
): CoverageGapResult['gateConfig'] {
    const failingEpics: string[] = [];
    for (const [key, epic] of Object.entries(byEpic)) {
        if (key === '__no_epic__') continue;
        if (epic.rawPct < minCoveragePct) {
            failingEpics.push(key);
            epic.gatePass = false;
        }
    }
    return { minCoveragePct, failingEpics };
}

export function loadEpicSummaries(
    issues: Array<{ key: string; fields: Record<string, unknown> }>,
): Map<string, string> {
    const epics = new Map<string, string>();
    for (const issue of issues) {
        const rawType = ((issue.fields.issuetype as Record<string, unknown>)?.name as string) || '';
        if (rawType.toLowerCase() === 'epic') {
            epics.set(issue.key, (issue.fields.summary as string) || '');
        }
    }
    return epics;
}
