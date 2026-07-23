/** Coverage gap analysis: fetch Jira issues, detect which have linked tests,
 *  calculate weighted coverage, build hierarchy rollup, and determine quality gate. */
import { rootLogger } from '../logger.js';
import { getDataHub } from '../data-hub/global-hub.js';
import type {
    JiraIssueFields,
    JiraIssueLink,
    JiraResourceLike,
    CoverageSnapshot,
    CoverageGapItem,
    CoverageHierarchyNode,
    CoverageGapOptions,
    CoverageGapResult,
} from '../types.js';
import {
    buildCoverageItems,
    calculateTotals,
    buildEpicRollup,
    checkQualityGate,
    loadEpicSummaries,
} from './coverage-gap-utils.js';

/** C1: searchJiraIssues já faz paginação interna; chamada única retorna todas as páginas. */
async function fetchAllIssues(
    jiraResource: JiraResourceLike,
    jql: string,
    pageSize: number,
): Promise<Array<{ key: string; fields: Record<string, unknown> }>> {
    const response = await jiraResource.searchJiraIssues(jql, pageSize);
    return response.issues.map((issue) => ({ key: issue.key, fields: issue.fields }));
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

/** C4: processa todos os issueKeys em lotes de 50 (não só os primeiros 50). */
async function fetchLinkedTestsBatch(
    jiraResource: JiraResourceLike,
    issueKeys: string[],
): Promise<Map<string, string[]>> {
    const linkMap = new Map<string, string[]>();
    try {
        for (let i = 0; i < issueKeys.length; i += 50) {
            const chunk = issueKeys.slice(i, i + 50);
            const jql = `issueType = Test AND issue in linkedIssuesOf("${chunk.join('","')}")`;
            const response = await jiraResource.searchJiraIssues(jql, 500);
            for (const test of response.issues) {
                collectTestLinksForIssue(test, issueKeys, linkMap);
            }
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
    const epicKey = item.issueKey ?? item.epicKey ?? item.summary;
    if (!epicNodes.has(epicKey)) {
        epicNodes.set(epicKey, {
            key: epicKey,
            summary: item.summary,
            type: 'Epic',
            children: [],
            totalIssues: 0,
            coveredIssues: 0,
            coveragePct: 0,
        });
    }
    return (
        epicNodes.get(epicKey) ?? {
            key: epicKey,
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
        key: item.issueKey ?? item.epicKey ?? '',
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
    const baseJql = `project = ${project} AND issuetype in (Story, Task, Bug, Epic)`;

    // C2: sem troca recentJql (workaround de paginação removido). searchJiraIssues
    // já coleta todas as páginas automaticamente (jira-resource-version.ts).
    // C3: se a busca falhar a exceção propaga — caller (case21) mostra erro explícito.
    const issues = await fetchAllIssues(jiraResource, baseJql, 200);

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
