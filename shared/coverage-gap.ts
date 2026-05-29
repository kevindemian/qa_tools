/** Coverage gap analysis: fetch Jira issues, detect which have linked tests,
 *  calculate weighted coverage, build hierarchy rollup, and determine quality gate. */
import { rootLogger } from './logger';
import { loadMetrics } from './metrics';
import type JiraResource from '../jira_management/jira_resource';
import type { CoverageSnapshot } from './metrics';
import {
    buildCoverageItems,
    calculateTotals,
    buildEpicRollup,
    checkQualityGate,
    loadEpicSummaries,
} from './coverage-gap-utils';

/** A single item in a coverage gap analysis. */
export interface CoverageGapItem {
    issueKey: string;
    summary: string;
    type: 'Story' | 'Task' | 'Bug' | 'Epic';
    status: string;
    epicKey?: string;
    epicSummary?: string;
    hasTest: boolean;
    linkedTestKeys: string[];
    priority: string;
    coverageWeight: number;
    lastRunPassed?: boolean;
    lastRunDate?: string;
}

/** Coverage data for a single epic. */
export interface EpicCoverage {
    epicSummary: string;
    total: number;
    covered: number;
    weightedPct: number;
    rawPct: number;
    gatePass: boolean;
    issues: CoverageGapItem[];
}

/** A node in the coverage hierarchy tree. */
export interface CoverageHierarchyNode {
    key: string;
    summary: string;
    type: 'Epic' | 'Story' | 'Task' | 'Bug';
    children: CoverageHierarchyNode[];
    totalIssues: number;
    coveredIssues: number;
    coveragePct: number;
}

/** Result of a coverage gap analysis. */
export interface CoverageGapResult {
    items: CoverageGapItem[];
    totals: { totalIssues: number; covered: number; gap: number; weightedCoveragePct: number; rawCoveragePct: number };
    byEpic: Record<string, EpicCoverage>;
    gateConfig: { minCoveragePct: number; failingEpics: string[] };
    hierarchy: CoverageHierarchyNode[];
    trends: CoverageSnapshot[];
}

export interface CoverageGapOptions {
    minCoveragePct?: number;
    maxIssues?: number;
}

async function fetchTotalCount(jiraResource: JiraResource, jql: string): Promise<number> {
    try {
        const response = await jiraResource.searchJiraIssues(jql, 1);
        return response.total;
    } catch (err) {
        rootLogger.error('Failed to count issues: ' + (err as Error).message);
        return 0;
    }
}

async function collectAllPages(
    jiraResource: JiraResource,
    jql: string,
    pageSize: number,
): Promise<Array<{ key: string; fields: Record<string, unknown> }>> {
    try {
        const allIssues: Array<{ key: string; fields: Record<string, unknown> }> = [];
        let startAt = 0;

        while (true) {
            const response = await jiraResource.searchJiraIssues(jql, pageSize);
            if (!response.issues || response.issues.length === 0) break;
            for (const issue of response.issues) {
                allIssues.push({ key: issue.key, fields: issue.fields });
            }
            startAt += pageSize;
            if (startAt >= response.total) break;
        }

        return allIssues;
    } catch (err) {
        rootLogger.error('Failed to fetch issues: ' + (err as Error).message);
        return [];
    }
}

async function fetchLinkedTestsBatch(jiraResource: JiraResource, issueKeys: string[]): Promise<Map<string, string[]>> {
    const linkMap = new Map<string, string[]>();
    try {
        const chunk = issueKeys.slice(0, 50);
        if (chunk.length === 0) return linkMap;
        const jql = `issueType = Test AND issue in linkedIssuesOf("${chunk.join('","')}")`;
        const response = await jiraResource.searchJiraIssues(jql, 500);
        if (!response.issues) return linkMap;

        for (const test of response.issues) {
            const testKey = test.key;
            const testLinks = (test.fields as Record<string, unknown>)['issuelinks'];
            if (!Array.isArray(testLinks)) continue;
            for (const link of testLinks) {
                const inward = link?.inwardIssue as Record<string, unknown> | undefined;
                const outward = link?.outwardIssue as Record<string, unknown> | undefined;
                const linkedKey = inward?.key === testKey ? outward?.key : inward?.key;
                if (typeof linkedKey === 'string' && issueKeys.includes(linkedKey)) {
                    if (!linkMap.has(linkedKey)) linkMap.set(linkedKey, []);
                    linkMap.get(linkedKey)!.push(testKey);
                }
            }
        }
    } catch (err) {
        rootLogger.error('Failed to fetch linked tests: ' + (err as Error).message);
    }
    return linkMap;
}

function loadCoverageTrends(project: string): CoverageSnapshot[] {
    const store = loadMetrics();
    if (!store.coverageHistory) return [];
    return store.coverageHistory.filter((s) => s.project === project).slice(-20);
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
    return epicNodes.get(item.issueKey)!;
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
            epicChildMap.get(item.epicKey)!.push(node);
        } else {
            rootNodes.push(node);
        }
    }
    rollupEpicNodes(epicNodes, epicChildMap, rootNodes);
    return rootNodes;
}

export async function analyzeCoverageGaps(
    jiraResource: JiraResource,
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
