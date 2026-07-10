/** Coverage gap analysis: fetch Jira issues, detect which have linked tests,
 *  calculate weighted coverage, build hierarchy rollup, and determine quality gate. */
import { rootLogger } from './logger.js';
import { getDataHub } from './data-hub/global-hub.js';
import type {
    JiraIssueFields,
    JiraIssueLink,
    JiraResourceLike,
    CoverageSnapshot,
    CoverageGapItem,
    CoverageHierarchyNode,
    CoverageGapOptions,
    CoverageGapResult,
} from './types.js';
import {
    buildCoverageItems,
    calculateTotals,
    buildEpicRollup,
    checkQualityGate,
    loadEpicSummaries,
} from './coverage-gap-utils.js';

async function fetchTotalCount(jiraResource: JiraResourceLike, jql: string): Promise<number> {
    try {
        const response = await jiraResource.searchJiraIssues(jql, 1);
        return response.total;
    } catch (err) {
        const msg = String(err);
        rootLogger.error('Failed to count issues: ' + msg);
        return 0;
    }
}

async function collectAllPages(
    jiraResource: JiraResourceLike,
    jql: string,
    pageSize: number,
): Promise<Array<{ key: string; fields: Record<string, unknown> }>> {
    try {
        const allIssues: Array<{ key: string; fields: Record<string, unknown> }> = [];
        let startAt = 0;

        for (;;) {
            const response = await jiraResource.searchJiraIssues(jql, pageSize);
            if (response.issues.length === 0) break;
            for (const issue of response.issues) {
                allIssues.push({ key: issue.key, fields: issue.fields });
            }
            startAt += pageSize;
            if (startAt >= response.total) break;
        }

        return allIssues;
    } catch (err) {
        const msg = String(err);
        rootLogger.error('Failed to fetch issues: ' + msg);
        return [];
    }
}

function resolveLinkedIssueKey(link: JiraIssueLink, testKey: string): string | undefined {
    const linkedKey = link.inwardIssue?.key === testKey ? link.outwardIssue?.key : link.inwardIssue?.key;
    return typeof linkedKey === 'string' ? linkedKey : undefined;
}

function collectTestLinksForIssue(
    testIssue: { key: string; fields: Record<string, unknown> },
    issueKeys: string[],
    linkMap: Map<string, string[]>,
): void {
    const testKey = testIssue.key;
    const testLinks = (testIssue.fields as JiraIssueFields)['issuelinks'];
    if (!Array.isArray(testLinks)) return;
    for (const link of testLinks) {
        const linkedKey = resolveLinkedIssueKey(link, testKey);
        if (linkedKey !== undefined && issueKeys.includes(linkedKey)) {
            if (!linkMap.has(linkedKey)) linkMap.set(linkedKey, []);
            linkMap.get(linkedKey)?.push(testKey);
        }
    }
}

async function fetchLinkedTestsBatch(
    jiraResource: JiraResourceLike,
    issueKeys: string[],
): Promise<Map<string, string[]>> {
    const linkMap = new Map<string, string[]>();
    try {
        const chunk = issueKeys.slice(0, 50);
        if (chunk.length === 0) return linkMap;
        const jql = `issueType = Test AND issue in linkedIssuesOf("${chunk.join('","')}")`;
        const response = await jiraResource.searchJiraIssues(jql, 500);
        for (const test of response.issues) {
            collectTestLinksForIssue(test, issueKeys, linkMap);
        }
    } catch (err) {
        const msg = String(err);
        rootLogger.error('Failed to fetch linked tests: ' + msg);
    }
    return linkMap;
}

function loadCoverageTrends(project: string): CoverageSnapshot[] {
    const hub = getDataHub();
    if (!hub.raw.coverageHistory) return [];
    return hub.raw.coverageHistory.filter((s) => s.project === project).slice(-20);
}

function createEpicNode(item: CoverageGapItem, epicNodes: Map<string, CoverageHierarchyNode>): CoverageHierarchyNode {
    if (!epicNodes.has(item.issueKey)) {
        epicNodes.set(item.issueKey, {
            key: item.issueKey,
            summary: item.summary,
            type: 'Epic',
            children: [],
            totalIssues: 0,
            coveredIssues: 0,
            coveragePct: 0,
        });
    }
    return (
        epicNodes.get(item.issueKey) ?? {
            key: item.issueKey,
            summary: item.summary,
            type: 'Epic',
            children: [],
            totalIssues: 0,
            coveredIssues: 0,
            coveragePct: 0,
        }
    );
}

function createChildNode(item: CoverageGapItem): CoverageHierarchyNode {
    return {
        key: item.issueKey,
        summary: item.summary,
        type: item.type,
        children: [],
        totalIssues: 1,
        coveredIssues: item.hasTest ? 1 : 0,
        coveragePct: item.hasTest ? 100 : 0,
    };
}

function rollupEpicNodes(
    epicNodes: Map<string, CoverageHierarchyNode>,
    epicChildMap: Map<string, CoverageHierarchyNode[]>,
    rootNodes: CoverageHierarchyNode[],
): void {
    for (const [epicKey, children] of epicChildMap) {
        const epicNode = epicNodes.get(epicKey);
        if (!epicNode) continue;
        epicNode.children = children;
        epicNode.totalIssues = children.reduce((s, c) => s + c.totalIssues, 0);
        epicNode.coveredIssues = children.reduce((s, c) => s + c.coveredIssues, 0);
        epicNode.coveragePct =
            epicNode.totalIssues > 0 ? Math.round((epicNode.coveredIssues / epicNode.totalIssues) * 100) : 0;
        rootNodes.push(epicNode);
    }
}

function buildHierarchy(items: CoverageGapItem[]): CoverageHierarchyNode[] {
    const epicNodes = new Map<string, CoverageHierarchyNode>();
    const epicChildMap = new Map<string, CoverageHierarchyNode[]>();
    const rootNodes: CoverageHierarchyNode[] = [];
    for (const item of items) {
        if (item.type === 'Epic') createEpicNode(item, epicNodes);
    }
    for (const item of items) {
        if (item.type === 'Epic') continue;
        const node = createChildNode(item);
        if (item.epicKey && epicNodes.has(item.epicKey)) {
            if (!epicChildMap.has(item.epicKey)) epicChildMap.set(item.epicKey, []);
            epicChildMap.get(item.epicKey)?.push(node);
        } else {
            rootNodes.push(node);
        }
    }
    rollupEpicNodes(epicNodes, epicChildMap, rootNodes);
    return rootNodes;
}

export async function analyzeCoverageGaps(
    jiraResource: JiraResourceLike,
    project: string,
    options?: CoverageGapOptions,
): Promise<CoverageGapResult> {
    const minCoveragePct = options?.minCoveragePct ?? 50;
    const maxIssues = options?.maxIssues ?? 5000;
    const baseJql = `project = ${project} AND issuetype in (Story, Task, Bug, Epic)`;

    const totalCount = await fetchTotalCount(jiraResource, baseJql);

    let issues: Array<{ key: string; fields: Record<string, unknown> }>;
    if (totalCount <= maxIssues) {
        issues = await collectAllPages(jiraResource, baseJql, 200);
    } else {
        const recentJql = `${baseJql} AND (statusCategory != Done OR updated >= -30d)`;
        issues = await collectAllPages(jiraResource, recentJql, 200);
    }

    const epicsMap = loadEpicSummaries(issues);
    const issueKeys = issues.map((i) => i.key);
    const testLinkMap = await fetchLinkedTestsBatch(jiraResource, issueKeys);
    const items = buildCoverageItems(issues, testLinkMap, epicsMap);
    const totals = calculateTotals(items);
    const byEpic = buildEpicRollup(items, epicsMap);
    const hierarchy = buildHierarchy(items);
    const gateConfig = checkQualityGate(byEpic, minCoveragePct);
    const trends = loadCoverageTrends(project);
    return { items, totals, byEpic, gateConfig, hierarchy, trends };
}
