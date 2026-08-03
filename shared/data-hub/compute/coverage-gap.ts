/**
 * Coverage Gap — compute module.
 *
 * Produces CoverageGapResult from hub raw data.
 * This is the SSOT for coverage gap computation — renderers consume
 * dataHub.computed.coverageGap instead of computing locally.
 *
 * @module compute/coverage-gap
 */

import type { CoverageGapResult, CoverageHierarchyNode } from '../../types/coverage.js';
import type { JiraIssueFields } from '../../types/jira.js';
import type { RawJiraIssue } from '../../types/data-hub.js';
import {
    buildCoverageItems,
    calculateTotals,
    buildEpicRollup,
    checkQualityGate,
    loadEpicSummaries,
    getCoverageGateDefaults,
} from '../../primitives/coverage-utils.js';
import { rootLogger } from '../../logger.js';

/**
 * Convert RawJiraIssue[] to the format expected by buildCoverageItems.
 * `issuelinks` é derivado de `linkedTestKeys` (enriquecido no provider) para que
 * `extractLinkedTestKeys` (primitivo) produza o mesmo conjunto do live fetch.
 */
function rawToJiraFormat(issues: RawJiraIssue[]): Array<{ key: string; fields: JiraIssueFields }> {
    return issues.map((issue) => {
        const fields: JiraIssueFields = {
            summary: issue.summary,
            status: { name: issue.status },
            issuetype: { name: issue.type },
            labels: issue.labels,
            fixVersions: issue.fixVersions.map((v) => ({ name: v })),
            issuelinks: (issue.linkedTestKeys ?? []).map((testKey) => ({
                type: { name: 'Test' },
                inwardIssue: { key: testKey },
            })),
        };
        if (issue.priority) {
            fields.priority = { name: issue.priority };
        }
        return { key: issue.key, fields };
    });
}

/** Issue types analisados para cobertura — espelha o `baseJql` do live analyzeCoverageGaps. */
const COVERAGE_ISSUE_TYPES = new Set(['story', 'task', 'bug', 'epic']);

/**
 * Compute coverage gap analysis from Jira issues and test link data.
 *
 * @param issues - Array of RawJiraIssue from the hub
 * @param testLinkMap - Optional Map of issue key → linked test keys (string arrays).
 *                      When empty, the map is derived from `issues[].linkedTestKeys`
 *                      (SSOT N6 — equivalent to the live analyzeCoverageGaps fetch).
 * @param options - Optional configuration (minCoveragePct override)
 * @returns CoverageGapResult with items, totals, epic rollup, gate config, and hierarchy
 */
export function computeCoverageGap(
    issues: RawJiraIssue[],
    testLinkMap: Map<string, string[]> = new Map(),
    options?: { minCoveragePct?: number },
): CoverageGapResult {
    try {
        const eligible = issues.filter((issue) => COVERAGE_ISSUE_TYPES.has(String(issue.type).toLowerCase()));
        const jiraIssues = rawToJiraFormat(eligible);
        const epicsMap = loadEpicSummaries(jiraIssues);
        const items = buildCoverageItems(jiraIssues, testLinkMap, epicsMap);
        const totals = calculateTotals(items);
        const byEpic = buildEpicRollup(items, epicsMap);
        const minCoveragePct = options?.minCoveragePct ?? getCoverageGateDefaults().minCoveragePct;
        const gateConfig = checkQualityGate(byEpic, minCoveragePct);
        const hierarchy = buildHierarchy(items, epicsMap);

        return {
            items,
            totals,
            byEpic,
            gateConfig,
            hierarchy,
            trends: [],
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rootLogger.error(
            'Failed to compute coverage gap. Verify that Jira issue data and test link mappings are valid. Details: ' +
                msg,
        );
        return {
            items: [],
            totals: { totalIssues: 0, covered: 0, gap: 0, weightedCoveragePct: 0, rawCoveragePct: 0 },
            byEpic: {},
            gateConfig: { minCoveragePct: options?.minCoveragePct ?? 50, failingEpics: [] },
            hierarchy: [],
            trends: [],
        };
    }
}

/**
 * Build a hierarchy tree from coverage items grouped by epic.
 */
function buildHierarchy(
    items: Array<{ epicKey?: string; epicSummary?: string; hasTest: boolean; summary: string; type: string }>,
    epicsMap: Map<string, string>,
): CoverageHierarchyNode[] {
    const epicGroups = new Map<string, typeof items>();
    for (const item of items) {
        const epicKey = item.epicKey || '__no_epic__';
        const group = epicGroups.get(epicKey) ?? [];
        group.push(item);
        epicGroups.set(epicKey, group);
    }

    const nodes: CoverageHierarchyNode[] = [];
    for (const [epicKey, epicItems] of epicGroups) {
        const epicSummary = epicKey === '__no_epic__' ? 'No Epic' : epicsMap.get(epicKey) || epicKey;
        const totalIssues = epicItems.length;
        const coveredIssues = epicItems.filter((i) => i.hasTest).length;
        const coveragePct = totalIssues > 0 ? Math.round((coveredIssues / totalIssues) * 100) : 0;

        const children: CoverageHierarchyNode[] = epicItems.map((item) => ({
            key: item.summary.slice(0, 60),
            summary: item.summary,
            type: item.type as CoverageHierarchyNode['type'],
            children: [],
            totalIssues: 1,
            coveredIssues: item.hasTest ? 1 : 0,
            coveragePct: item.hasTest ? 100 : 0,
        }));

        nodes.push({
            key: epicKey,
            summary: epicSummary,
            type: 'Epic',
            children,
            totalIssues,
            coveredIssues,
            coveragePct,
        });
    }

    return nodes;
}
