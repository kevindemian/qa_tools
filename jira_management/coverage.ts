/** Jira test coverage analysis: check which test cases have test steps and which are missing them. */
import type { JsonObject } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import type JiraResource from './jira_resource.js';

interface CoverageResult {
    totalIssues: number;
    totalSteps: number;
    mappedIssues: number;
    unmappedSteps: string[];
    gapsByEpic: Record<string, string[]>;
    coveragePct: number;
}

function getEpicFromIssue(fields: JsonObject): string | null {
    const epic = fields['customfield_10014'] ?? fields['epic'] ?? fields['Epic'] ?? null;
    if (!epic) return null;
    if (typeof epic === 'string') return epic;
    if (typeof epic === 'object' && 'key' in epic) {
        return String(epic.key);
    }
    return null;
}

function issueHasSteps(fields: JsonObject): boolean {
    const steps = fields['steps'];
    return Array.isArray(steps) && steps.length > 0;
}

export async function analyzeCoverage(jiraResource: JiraResource, project: string): Promise<CoverageResult> {
    let response: { issues: Array<{ key: string; fields: JsonObject }> };
    try {
        response = await jiraResource.searchJiraIssues(`project = ${project} AND issuetype = Test`);
    } catch (err: unknown) {
        rootLogger.error('analyzeCoverage — JQL search failed: ' + (err as Error).message);
        return {
            totalIssues: 0,
            totalSteps: 0,
            mappedIssues: 0,
            unmappedSteps: [],
            gapsByEpic: {},
            coveragePct: 0,
        };
    }

    const issues = response.issues;
    const unmappedSteps: string[] = [];
    const gapsByEpic: Record<string, string[]> = {};
    let mappedCount = 0;
    let totalStepCount = 0;

    for (const issue of issues) {
        if (issueHasSteps(issue.fields)) {
            mappedCount++;
            const steps = issue.fields['steps'];
            if (Array.isArray(steps)) totalStepCount += steps.length;
        } else {
            unmappedSteps.push(issue.key);
            const epic = getEpicFromIssue(issue.fields);
            if (epic) {
                if (!gapsByEpic[epic]) gapsByEpic[epic] = [];
                gapsByEpic[epic].push(issue.key);
            }
        }
    }

    const coveragePct = issues.length > 0 ? Math.round((mappedCount / issues.length) * 100) : 0;

    return {
        totalIssues: issues.length,
        totalSteps: totalStepCount,
        mappedIssues: mappedCount,
        unmappedSteps,
        gapsByEpic,
        coveragePct,
    };
}
