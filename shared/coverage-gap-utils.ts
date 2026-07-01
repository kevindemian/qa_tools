/** Utility functions for coverage gap analysis: type normalization, priority weighting,
 *  epic extraction, link parsing, and aggregate calculations. */
import type { CoverageGapItem, CoverageGapResult, EpicCoverage } from './types.js';
import type { JiraIssueFields, JiraIssue } from './types.js';

export const PRIORITY_WEIGHTS: Record<string, number> = {
    Blocker: 5,
    High: 3,
    Medium: 2,
    Low: 1,
    Trivial: 0.5,
};

export function getCoverageWeight(priority: string): number {
    const entries = Object.entries(PRIORITY_WEIGHTS);
    const entry = entries.find(([k]) => k === priority);
    return entry !== undefined ? entry[1] : 2;
}

export function normalizeType(rawType: string): 'Story' | 'Task' | 'Bug' | 'Epic' {
    const upper = rawType.toLowerCase();
    if (upper === 'story') return 'Story';
    if (upper === 'bug') return 'Bug';
    if (upper === 'epic') return 'Epic';
    return 'Task';
}

export function extractEpicKey(fields: JiraIssueFields): string | undefined {
    const epicField = fields['customfield_10014'] ?? fields['epic'] ?? fields['Epic'];
    if (!epicField) return undefined;
    if (typeof epicField === 'string') return epicField;
    if (typeof epicField === 'object') {
        return (epicField as JiraIssue).key;
    }
    return undefined;
}

export function extractLinkedTestKeys(fields: JiraIssueFields): string[] {
    const links = fields.issuelinks;
    if (!Array.isArray(links)) return [];
    const keys: string[] = [];
    for (const link of links) {
        const linkType = link.type;
        if (!linkType || linkType.name !== 'Test') continue;
        const inward = link.inwardIssue;
        const outward = link.outwardIssue;
        if (inward?.key) keys.push(inward.key);
        if (outward?.key) keys.push(outward.key);
    }
    return keys;
}

export function buildCoverageItems(
    issues: Array<{ key: string; fields: JiraIssueFields }>,
    testLinkMap: Map<string, string[]>,
    epicsMap: Map<string, string>,
): CoverageGapItem[] {
    return issues.map((issue) => {
        const fields = issue.fields;
        const summary = (fields.summary as string) || '';
        const rawType = (fields.issuetype?.name as string) || '';
        const status = (fields.status?.name as string) || '';
        const priority = (fields.priority?.name as string) || 'Medium';
        const epicKey = extractEpicKey(fields);
        const linkedTestKeys = extractLinkedTestKeys(fields);
        const fallbackKeys = testLinkMap.get(issue.key) || [];
        const allKeys = Array.from(new Set([...linkedTestKeys, ...fallbackKeys]));
        const epicSummary = epicKey ? epicsMap.get(epicKey) : undefined;
        return {
            issueKey: issue.key,
            summary,
            type: normalizeType(rawType),
            status,
            ...(epicKey ? { epicKey } : {}),
            ...(epicSummary ? { epicSummary } : {}),
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

function computeWeightedPct(issues: CoverageGapItem[]): number {
    let wSum = 0;
    let wCov = 0;
    for (const i of issues) {
        wSum += i.coverageWeight;
        if (i.hasTest) wCov += i.coverageWeight;
    }
    return wSum > 0 ? Math.round((wCov / wSum) * 100) : 0;
}

export function buildEpicRollup(items: CoverageGapItem[], epicsMap: Map<string, string>): Record<string, EpicCoverage> {
    const byEpic = new Map<string, EpicCoverage>();
    for (const item of items) {
        const epicKey = item.epicKey || '__no_epic__';
        let entry = byEpic.get(epicKey);
        if (!entry) {
            entry = {
                epicSummary: epicKey === '__no_epic__' ? 'No Epic' : epicsMap.get(epicKey) || item.epicSummary || '',
                total: 0,
                covered: 0,
                weightedPct: 0,
                rawPct: 0,
                gatePass: true,
                issues: [],
            };
            byEpic.set(epicKey, entry);
        }
        entry.issues.push(item);
    }
    for (const [, epic] of byEpic) {
        epic.total = epic.issues.length;
        epic.covered = epic.issues.filter((i) => i.hasTest).length;
        epic.rawPct = epic.total > 0 ? Math.round((epic.covered / epic.total) * 100) : 0;
        epic.weightedPct = computeWeightedPct(epic.issues);
    }
    return Object.fromEntries(byEpic);
}

export function getCoverageGateDefaults(): { minCoveragePct: number } {
    return { minCoveragePct: 50 };
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

export function loadEpicSummaries(issues: Array<{ key: string; fields: JiraIssueFields }>): Map<string, string> {
    const epics = new Map<string, string>();
    for (const issue of issues) {
        const rawType = (issue.fields.issuetype?.name as string) || '';
        if (rawType.toLowerCase() === 'epic') {
            epics.set(issue.key, (issue.fields.summary as string) || '');
        }
    }
    return epics;
}
