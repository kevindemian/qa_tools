/** Jira test coverage analysis: check which test cases have test steps and which are missing them. */
import { formatErr } from '../shared/errors.js';
import type { JsonObject } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';
import Config from '../shared/config-accessor.js';
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

/** Cloud (Xray for Jira) stores steps in Xray, not the Jira `steps` field.
 *  Query the raven 2.0 steps endpoint. Errors are reported explicitly (never silent). */
async function issueHasStepsCloud(jiraResource: JiraResource, key: string): Promise<boolean> {
    try {
        const data = await jiraResource.getFromOriginPath<Array<unknown>>('rest/raven/2.0/api/test/' + key + '/steps');
        return Array.isArray(data) && data.length > 0;
    } catch (err) {
        rootLogger.warn('Cloud coverage: não foi possível obter steps de ' + key + ': ' + formatErr(err));
        return false;
    }
}

function trackUnmappedIssue(issue: { key: string; fields: JsonObject }, gapsByEpicMap: Map<string, string[]>): void {
    const epic = getEpicFromIssue(issue.fields);
    if (epic) {
        const existing = gapsByEpicMap.get(epic);
        if (existing) {
            existing.push(issue.key);
        } else {
            gapsByEpicMap.set(epic, [issue.key]);
        }
    }
}

export async function analyzeCoverage(jiraResource: JiraResource, project: string): Promise<CoverageResult> {
    let response: { issues: Array<{ key: string; fields: JsonObject }> };
    try {
        response = await jiraResource.searchJiraIssues(`project = ${project} AND issuetype = Test`);
    } catch (err: unknown) {
        rootLogger.error('analyzeCoverage — JQL search failed: ' + formatErr(err));
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
    const gapsByEpicMap = new Map<string, string[]>();
    let mappedCount = 0;
    let totalStepCount = 0;
    let isCloud: boolean;
    try {
        isCloud = Config.getDefault().get('jiraMode') === 'cloud';
    } catch {
        isCloud = false;
    }

    for (const issue of issues) {
        const hasSteps = isCloud ? await issueHasStepsCloud(jiraResource, issue.key) : issueHasSteps(issue.fields);
        if (hasSteps) {
            mappedCount++;
            const steps = issue.fields['steps'];
            if (Array.isArray(steps)) totalStepCount += steps.length;
        } else {
            unmappedSteps.push(issue.key);
            trackUnmappedIssue(issue, gapsByEpicMap);
        }
    }

    const coveragePct = issues.length > 0 ? Math.round((mappedCount / issues.length) * 100) : 0;

    return {
        totalIssues: issues.length,
        totalSteps: totalStepCount,
        mappedIssues: mappedCount,
        unmappedSteps,
        gapsByEpic: Object.fromEntries(gapsByEpicMap),
        coveragePct,
    };
}
