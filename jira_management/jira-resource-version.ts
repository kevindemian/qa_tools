/** Jira version management: create, publish, list, and assign fix versions to issues. */
import { formatDateISO } from '../shared/date-utils.js';
import { success, info, extractErrorMessage, ProgressBar } from '../shared/ui/prompt.js';
import type { Logger } from '../shared/logger.js';
import type { VersionData, JiraIssue, SearchResponse, JiraResourceLike } from './jira-resource-types.js';
import { rootLogger } from "../shared/logger.js";
import {
    noIssuesFoundForVersion,
    noVersionFoundForProject,
    projectNotFound,
    versionNotFoundInProject,
    versionAlreadyExists,
    creatingVersion,
    versionCreated,
    publishingVersion,
    versionPublished,
    versionNotFoundForProject,
    issueNotCompleted,
    issueCompleted,
    latestVersions,
    unreleasedVersions as unreleasedVersionsHeader,
    NO_UNRELEASED_VERSIONS,
} from './constants.js';
import type { JsonObject } from '../shared/types.js';
import { isAtlassianCloudGateway } from '../shared/jira/jira-auth.js';
import { normalizeJqlForCloud } from '../shared/jira/jira-client.js';

function sanitizeJqlValue(value: string): string {
    if (!value || typeof value !== 'string') {
        throw new Error('Valor inválido para consulta JQL.');
    }
    return value.replace(/[^\w\s.:/-]/g, '');
}

interface SearchPage {
    issues: JiraIssue[];
    isLast: boolean;
    total: number | null;
    nextPageToken?: string | null;
}

/**
 * Fetch a single page of search results.
 *
 * Jira Cloud (API v3) uses `nextPageToken` for pagination — `startAt` is accepted
 * but ignored when a token is present. The response carries `isLast` only on the
 * terminal page (some versions always return `isLast=false` and rely on the
 * absence/presence of `nextPageToken` to signal continuation).
 */
async function fetchSearchPage(
    resource: JiraResourceLike,
    jql: string,
    startAt: number,
    maxResults: number,
    nextPageToken?: string | null,
): Promise<SearchPage> {
    const isCloud = resource.jiraMode === 'cloud' || isAtlassianCloudGateway(resource.baseUrl);
    if (isCloud && typeof resource.postToApiRoot === 'function') {
        const query = nextPageToken ? `nextPageToken=${encodeURIComponent(nextPageToken)}` : `startAt=${startAt}`;
        const res = await resource.postToApiRoot(`/rest/api/3/search/jql?${query}`, {
            jql: normalizeJqlForCloud(jql),
            maxResults,
            fields: ['summary'],
        });
        const page = (res ?? {}) as {
            issues?: JiraIssue[];
            isLast?: boolean;
            total?: number;
            nextPageToken?: string;
        };
        return {
            issues: page.issues ?? [],
            isLast: page.isLast === true,
            total: typeof page.total === 'number' ? page.total : null,
            nextPageToken: typeof page.nextPageToken === 'string' ? page.nextPageToken : null,
        };
    }
    const url = `search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&startAt=${startAt}`;
    const data = await resource.getJiraResource<SearchResponse>(url);
    return { issues: data.issues, total: data.total, isLast: false };
}

const MAX_PAGES = 1000;
const MAX_TOTAL = 10000;

export async function searchJiraIssuesCore(
    resource: JiraResourceLike,
    log: Logger,
    jql: string,
    maxResults = 200,
): Promise<SearchResponse> {
    try {
        const allIssues: JiraIssue[] = [];
        let startAt = 0;
        let total: number | null = null;
        let pages = 0;
        let cloudToken: string | null | undefined;

        const isCloud = resource.jiraMode === 'cloud' || isAtlassianCloudGateway(resource.baseUrl);

        while (pages < MAX_PAGES && allIssues.length < MAX_TOTAL) {
            const page = await fetchSearchPage(resource, jql, startAt, maxResults, cloudToken);
            pages++;

            const decision = classifySearchPage(page, startAt, maxResults, allIssues, total, log);
            total = decision.total;
            allIssues.push(...page.issues);
            if (decision.stop) break;

            cloudToken = page.nextPageToken;
            startAt += maxResults;

            // Cloud (API v3) uses nextPageToken for pagination. When the token is null,
            // Cloud has no more pages — but may still set isLast=false. Break to avoid
            // infinite loop (default offset-based pagination never terminates for Cloud).
            if (isCloud && !page.nextPageToken) break;
        }

        return { issues: allIssues, total: allIssues.length };
    } catch (err: unknown) {
        // Fail loud: never return a silent empty result (would hide data loss / search bugs).
        log.error(`Erro searchJiraIssues: ${extractErrorMessage(err)}`);
        throw err;
    }
}

interface SearchPageDecision {
    total: number | null;
    stop: boolean;
}

function classifySearchPage(
    page: SearchPage,
    startAt: number,
    maxResults: number,
    collected: JiraIssue[],
    priorTotal: number | null,
    log: Logger,
): SearchPageDecision {
    let total = priorTotal;
    if (page.total !== null) {
        total = page.total;
    } else if (page.isLast) {
        total = collected.length + page.issues.length;
    }

    if (total !== null && total > MAX_TOTAL) {
        log.warn(`Total (${total}) excede limite de ${MAX_TOTAL}, truncando.`);
    }

    const stop = page.isLast || page.issues.length < maxResults || (total !== null && startAt + maxResults >= total);

    return { total, stop };
}

export async function getProjectId(resource: JiraResourceLike, projectName: string): Promise<string> {
    try {
        const projectData = await resource.getJiraResource<{ id: string }>(`project/${projectName}`);
        return projectData.id;
    } catch (err: unknown) {
        resource.log.error(`Projeto '${projectName}' não encontrado: ${extractErrorMessage(err)}`);
        return '';
    }
}

export async function getProjectVersions(resource: JiraResourceLike, projectId: string): Promise<VersionData[]> {
    try {
        return await resource.getJiraResource<VersionData[]>(`project/${projectId}/versions`);
    } catch (err: unknown) {
        rootLogger.warn(`jira-resource-version: Erro ao buscar versoes: ${extractErrorMessage(err)}`);
        resource.log.error(`Erro ao buscar versões do projeto '${projectId}': ${extractErrorMessage(err)}`);
        return [];
    }
}

export async function getVersionId(
    resource: JiraResourceLike,
    projectName: string,
    versionName: string,
): Promise<string | null> {
    const projectId = await resource.getProjectId(projectName);
    if (!projectId) {
        info(projectNotFound(projectName));
        return null;
    }
    const versions = await resource.getProjectVersions(projectId);
    if (!Array.isArray(versions) || versions.length === 0) {
        info(noVersionFoundForProject(projectName));
        return null;
    }

    const version = versions.find((v) => v.name.toLowerCase() === versionName.toLowerCase());
    if (version) {
        return version.id;
    }
    info(versionNotFoundInProject(versionName, projectName));
    return null;
}

export async function createVersion(
    resource: JiraResourceLike,
    projectName: string,
    versionName: string,
    description?: string,
): Promise<JsonObject | null> {
    const versionId = await resource.getVersionId(projectName, versionName);
    if (versionId) {
        info(versionAlreadyExists(versionName));
        return null;
    }

    const payload = { description, name: versionName, project: projectName, released: false };

    info(creatingVersion(versionName));
    const response = (await resource.postJiraResource('version', payload)) as JsonObject | null;
    if (!response) return null;

    success(versionCreated(response['name'] as string));
    return response;
}

export async function checkReleaseTasksStatus(
    resource: JiraResourceLike,
    projectName: string,
    versionName: string,
): Promise<boolean> {
    try {
        const safeVersion = sanitizeJqlValue(versionName);
        const projectId = await resource.getProjectId(projectName);
        const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"`;

        const issuesData = await resource.searchJiraIssues(jql);
        if (issuesData.issues.length === 0) {
            info(noIssuesFoundForVersion(versionName, projectName));
            return false;
        }

        let allTasksCompleted = true;
        for (const issue of issuesData.issues) {
            const status = issue.fields.status?.name || '';
            if (!['done', 'in use'].includes(status.toLowerCase())) {
                info(issueNotCompleted(issue.key, status));
                allTasksCompleted = false;
            } else {
                info(issueCompleted(issue.key, status));
            }
        }

        return allTasksCompleted;
    } catch (err: unknown) {
        resource.log.error(`Erro checkReleaseTasksStatus: ${extractErrorMessage(err)}`);
        return false;
    }
}

export async function getReleaseTasks(
    resource: JiraResourceLike,
    projectName: string,
    versionName: string,
    testOnly = false,
): Promise<string[]> {
    try {
        const safeVersion = sanitizeJqlValue(versionName);
        const projectId = await resource.getProjectId(projectName);

        const typeFilter = testOnly ? ' AND type = "Test"' : '';
        const jql = `project = ${projectId} AND fixVersion = "${safeVersion}"${typeFilter}`;

        const issuesData = await resource.searchJiraIssues(jql);
        if (issuesData.issues.length === 0) {
            info(noIssuesFoundForVersion(versionName, projectName));
            return [];
        }

        return issuesData.issues.map((issue) => `[${issue.key}] - ${issue.fields.summary}`);
    } catch (err: unknown) {
        rootLogger.warn(`jira-resource-version: Erro getReleaseTasks: ${extractErrorMessage(err)}`);
        resource.log.error(`Erro getReleaseTasks: ${extractErrorMessage(err)}`);
        return [];
    }
}

export async function getLatestReleases(
    resource: JiraResourceLike,
    projectName: string,
    numReleases: number,
): Promise<{
    latestReleasedVersions: VersionData[];
    unreleasedVersions: VersionData[];
}> {
    const projectId = await resource.getProjectId(projectName);
    if (!projectId) {
        info(projectNotFound(projectName));
        return { latestReleasedVersions: [], unreleasedVersions: [] };
    }
    const allVersions = await resource.getProjectVersions(projectId);
    if (!Array.isArray(allVersions) || allVersions.length === 0) {
        info(noVersionFoundForProject(projectName));
        return { latestReleasedVersions: [], unreleasedVersions: [] };
    }

    const releasedVersions = allVersions
        .filter((v) => v.released && v.releaseDate)
        .sort((a, b) => new Date(b.releaseDate as string).getTime() - new Date(a.releaseDate as string).getTime());

    const latestReleasedVersions = releasedVersions.slice(0, numReleases);
    const unreleasedVersions = allVersions.filter((v) => !v.released);

    info(latestVersions(latestReleasedVersions.length, projectName));
    latestReleasedVersions.forEach((v) => {
        info(`  ${v.name} (${v.releaseDate})`);
    });

    info(unreleasedVersionsHeader(projectName));
    if (unreleasedVersions.length > 0) {
        unreleasedVersions.forEach((v) => {
            const description = v.description || 'Sem descrição';
            info(`  ${v.name} — ${description}`);
        });
    } else {
        info(NO_UNRELEASED_VERSIONS);
    }

    return { latestReleasedVersions, unreleasedVersions };
}

export async function updateFixVersions(
    resource: JiraResourceLike,
    taskIds: string[],
    projectName: string,
    versionName: string,
): Promise<void> {
    const versionId = await resource.getVersionId(projectName, versionName);
    if (!versionId) {
        resource.log.error(versionNotFoundForProject(versionName, projectName));
        return;
    }

    const payload = {
        update: { fixVersions: [{ set: [{ id: versionId }] }] },
    };

    const bar = new ProgressBar(taskIds.length);
    for (const taskId of taskIds) {
        await resource.putJiraResource(`issue/${taskId}`, payload);
        bar.update(bar.current + 1);
    }
    bar.stop();
}

export async function releaseVersion(
    resource: JiraResourceLike,
    projectName: string,
    versionName: string,
): Promise<void> {
    const versionId = await resource.getVersionId(projectName, versionName);
    if (!versionId) {
        resource.log.error(`Versão '${versionName}' não encontrada.`);
        return;
    }

    const allTasksCompleted = await resource.checkReleaseTasksStatus(projectName, versionName);
    if (!allTasksCompleted) {
        resource.log.error(`Tarefas da versão '${versionName}' não concluídas.`);
        return;
    }

    const releaseDate = formatDateISO();
    const payload = { releaseDate, released: true };

    info(publishingVersion(versionName));
    await resource.putJiraResource(`version/${versionId}`, payload);
    success(versionPublished(versionName));
}
