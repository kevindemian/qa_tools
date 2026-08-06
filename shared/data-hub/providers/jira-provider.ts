/**
 * Data Hub — Jira Provider.
 *
 * Fetches Jira issues via JiraResourceLike and adapts to DataProvider.
 */
import type { JiraResourceLike, JiraIssue, JiraIssueLink } from '../../types/jira.js';
import type { DataProvider, FetchOptions, RawData, RawJiraIssue } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';

/** Lote de issueKeys para a query `linkedIssuesOf` (limite do JQL). */
const LINKED_TESTS_BATCH_SIZE = 50;

/** Extrai nome de um objeto desconhecido (displayName ou name), se string. */
function extractName(value: unknown): string | undefined {
    if (value != null && typeof value === 'object') {
        const v = value as { displayName?: unknown; name?: unknown };
        if (typeof v.displayName === 'string') return v.displayName;
        if (typeof v.name === 'string') return v.name;
    }
    return undefined;
}

/** Extrai a lista de `name` de um array de objetos desconhecidos. */
function extractNameList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const result: string[] = [];
    for (const item of value) {
        const name = extractName(item);
        if (name) result.push(name);
    }
    return result;
}

/** Extrai story points (número finito) de um campo custom ou nomeado. */
function extractNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return undefined;
}

/** Extrai a chave de um issue pai (campo `parent`). */
function extractKey(value: unknown): string | undefined {
    if (value != null && typeof value === 'object' && 'key' in value) {
        const key = (value as { key?: unknown }).key;
        return typeof key === 'string' ? key : undefined;
    }
    return undefined;
}

/** Extrai o nome do sprint (pode vir como array de {name} ou objeto {name}). */
function extractSprintName(value: unknown): string | undefined {
    if (value == null) return undefined;
    if (Array.isArray(value)) {
        const first = (value as unknown[])[0];
        return extractName(first);
    }
    return extractName(value);
}

/** Extrai a issue (inward/outward) vinculada a um teste. */
function extractLinkedIssueKey(link: unknown, testKey: string): string | undefined {
    const l = link as JiraIssueLink;
    if (l.inwardIssue?.key === testKey) return l.outwardIssue?.key;
    return l.inwardIssue?.key;
}

/** Acumula, no linkMap, as issues da base ligadas aos testes retornados pelo JQL. */
function collectTestLinks(
    linkMap: Map<string, string[]>,
    testIssues: Array<{ key: string; fields: Record<string, unknown> }>,
    issueKeys: string[],
): void {
    for (const test of testIssues) {
        const testKey = test.key;
        const links = test.fields['issuelinks'];
        if (!Array.isArray(links)) continue;
        for (const link of links) {
            const linkedKey = extractLinkedIssueKey(link, testKey);
            if (typeof linkedKey !== 'string' || !issueKeys.includes(linkedKey)) continue;
            const existing = linkMap.get(linkedKey) ?? [];
            existing.push(testKey);
            linkMap.set(linkedKey, existing);
        }
    }
}

export class JiraDataProvider implements DataProvider {
    readonly name = 'jira';
    readonly source = 'jira' as const;

    constructor(
        private readonly jira: JiraResourceLike,
        private readonly projectKey: string,
    ) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const { count } = options;
        const maxResults = count ?? 50;

        const jql = `project = "${this.projectKey}" ORDER BY created DESC`;
        const response = await this.jira.searchJiraIssues(jql, maxResults);

        const jiraIssues: RawJiraIssue[] = response.issues.map((issue) => this.mapIssue(issue as JiraIssue));

        // Enriquecimento SSOT (N6): resolve os testes vinculados a cada issue via
        // `linkedIssuesOf` (mesma técnica do live analyzeCoverageGaps) e grava as
        // chaves no raw — permite o hub computar um coverage-gap equivalente.
        const issueKeys = jiraIssues.map((i) => i.key);
        const testLinkMap = await this.fetchLinkedTestKeys(issueKeys);
        for (const issue of jiraIssues) {
            const keys = testLinkMap.get(issue.key) ?? [];
            issue.linkedTestKeys = keys;
            issue.linkedTestCount = keys.length;
        }

        return {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            jiraIssues,
        };
    }

    /** Busca os testes vinculados aos issues (bate por lotes) e devolve claves: issue -> test keys. */
    private async fetchLinkedTestKeys(issueKeys: string[]): Promise<Map<string, string[]>> {
        const linkMap = new Map<string, string[]>();
        if (issueKeys.length === 0) return linkMap;
        try {
            for (let i = 0; i < issueKeys.length; i += LINKED_TESTS_BATCH_SIZE) {
                const chunk = issueKeys.slice(i, i + LINKED_TESTS_BATCH_SIZE);
                const jql = `issueType = Test AND issue in linkedIssuesOf("${chunk.join('","')}")`;
                const testResponse = await this.jira.searchJiraIssues(jql, 500);
                collectTestLinks(linkMap, testResponse.issues, issueKeys);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            rootLogger.error(
                'Failed to fetch linked tests for Jira issues; coverage-gap test links will be incomplete. Details: ' +
                    msg,
            );
        }
        return linkMap;
    }

    private mapIssue(issue: JiraIssue): RawJiraIssue {
        const { fields } = issue;
        const created = typeof fields['created'] === 'string' ? fields['created'] : '';
        const updated = typeof fields['updated'] === 'string' ? fields['updated'] : '';
        const sprint = extractSprintName(fields['sprint']);
        const storyPoints = extractNumber(fields['customfield_10002']) ?? extractNumber(fields['storyPoints']);
        return {
            key: issue.key,
            summary: fields.summary ?? '',
            status: fields.status?.name ?? '',
            statusCategory: fields.status?.statusCategory?.name,
            type: fields.issuetype?.name ?? '',
            priority: fields.priority?.name,
            assignee: extractName(fields['assignee']),
            reporter: extractName(fields['reporter']),
            components: extractNameList(fields['components']),
            fixVersions: extractNameList(fields['fixVersions']),
            sprint,
            storyPoints,
            parentKey: extractKey(fields['parent']),
            labels: fields.labels ?? [],
            created,
            updated,
            resolution: extractName(fields['resolution']),
            resolutionDate: typeof fields['resolutiondate'] === 'string' ? fields['resolutiondate'] : undefined,
        };
    }
}
