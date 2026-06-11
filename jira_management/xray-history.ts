/** Xray per-test history provider. Supports Server (REST) and Cloud (GraphQL).
 * Fetches historical test runs for a given test issue key.
 * Falls back gracefully on API errors — never throws. */

import type JiraResource from './jira_resource.js';
import Config from '../shared/config.js';
import { rootLogger } from '../shared/logger.js';
import type { JsonObject, JiraIssue } from '../shared/types.js';
import { XrayCloudClient } from '../shared/xray-cloud-client.js';
import { z } from '../shared/validation.js';

const MAX_RUNS = 20;

const XrayTestRunSchema = z.object({
    id: z.string().optional(),
    status: z.union([z.string(), z.object({ name: z.string() })]),
    testExecution: z.object({ issueId: z.string().nullable() }).optional(),
    startedOn: z.string().nullable().optional(),
    finishedOn: z.string().nullable().optional(),
    testExecKey: z.string().optional(),
});

const XrayGraphqlResponseSchema = z.object({
    getTestRuns: z
        .object({
            results: z.array(XrayTestRunSchema).optional(),
        })
        .optional(),
});

function safeStr(val: unknown, fallback = ''): string {
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return fallback;
}

/** A single historical test run for a test issue. */
export interface TestRun {
    status: string;
    testExecKey: string;
    startedOn?: string;
    finishedOn?: string;
}

/** Abstraction over Xray history APIs (Server REST / Cloud GraphQL). */
export interface TestHistoryProvider {
    getHistory(testKey: string): Promise<TestRun[]>;
}

// ─── In-memory cache ─────────────────────────────────────────────────────────

interface CacheEntry {
    runs: TestRun[];
    ts: number;
}

export class TestHistoryCache {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly ttl: number;

    constructor(ttlMs = 5 * 60 * 1000) {
        this.ttl = ttlMs;
    }

    get(key: string): TestRun[] | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        if (Date.now() - entry.ts > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.runs;
    }

    set(key: string, runs: TestRun[]): void {
        this.cache.set(key, { runs, ts: Date.now() });
    }

    clear(): void {
        this.cache.clear();
    }
}

// ─── Server (Raven REST) ─────────────────────────────────────────────────────

class ServerHistoryProvider implements TestHistoryProvider {
    private readonly log = rootLogger.child({ module: 'ServerHistoryProvider' });

    constructor(private readonly jiraResource: JiraResource) {}

    async getHistory(testKey: string): Promise<TestRun[]> {
        try {
            /** Usa {@link JiraResource.getFromOriginPath} para evitar duplo `/rest/`.
             * O `getJiraResource` convencional concatenaria o path com `baseURL = /rest/api/2`,
             * gerando URL inválida: `/rest/api/2/rest/raven/1.0/...`.
             * @production bug P3 corrigido: a Xray Raven API vive em `/rest/raven/1.0/`,
             *   não em `/rest/api/2/`. URL correta mantida em `docs/PRODUCTION-CONFIG.md`. */
            const data = await this.jiraResource.getFromOriginPath<unknown[]>(
                'rest/raven/1.0/api/test/' + encodeURIComponent(testKey) + '/testruns',
            );
            if (!Array.isArray(data)) {
                this.log.warn('Unexpected Server history response for ' + testKey);
                return [];
            }
            return data.slice(0, MAX_RUNS).map((r: unknown) => {
                const row = r as JsonObject;
                const startedOn = safeStr(row['startedOn']);
                const finishedOn = safeStr(row['finishedOn']);
                return {
                    status: safeStr(row['status'], 'UNKNOWN'),
                    testExecKey: safeStr(row['testExecKey']),
                    ...(startedOn ? { startedOn } : {}),
                    ...(finishedOn ? { finishedOn } : {}),
                };
            });
        } catch (err) {
            this.log.warn('Server history failed for ' + testKey + ': ' + (err as Error).message);
            return [];
        }
    }
}

// ─── Cloud (GraphQL) ─────────────────────────────────────────────────────────

class CloudHistoryProvider implements TestHistoryProvider {
    private readonly cloudClient: XrayCloudClient;
    private readonly issueIdCache = new Map<string, string>();
    private readonly execKeyCache = new Map<string, string>();

    private readonly log = rootLogger.child({ module: 'CloudHistoryProvider' });

    constructor(private readonly jiraResource: JiraResource) {
        this.cloudClient = new XrayCloudClient();
    }

    private _getCredentials(): { clientId: string; clientSecret: string } | null {
        const cfg = Config.getDefault();
        const clientId = cfg.get('xrayClientId');
        const clientSecret = cfg.get('xrayClientSecret');
        if (!clientId || !clientSecret) {
            this.log.warn('XRAY_CLIENT_ID and XRAY_CLIENT_SECRET not set');
            return null;
        }
        return { clientId, clientSecret };
    }

    private async resolveIssueId(testKey: string): Promise<string | null> {
        const cached = this.issueIdCache.get(testKey);
        if (cached) return cached;
        try {
            const data = await this.jiraResource.getJiraResource<{ id: string }>(
                'issue/' + encodeURIComponent(testKey) + '?fields=id',
            );
            if (data.id) {
                this.issueIdCache.set(testKey, data.id);
                return data.id;
            }
        } catch (err) {
            this.log.warn('Could not resolve issueId for ' + testKey + ': ' + (err as Error).message);
        }
        return null;
    }

    private async resolveExecKeys(issueIds: string[]): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const uncached = issueIds.filter((id) => !this.execKeyCache.has(id));
        if (uncached.length === 0) {
            for (const id of issueIds) {
                const key = this.execKeyCache.get(id);
                if (key) result.set(id, key);
            }
            return result;
        }
        try {
            const jql = 'id IN (' + uncached.map((id) => '"' + id.replace(/[^0-9]/g, '') + '"').join(',') + ')';
            const data = await this.jiraResource.searchJiraIssues(jql, uncached.length);
            for (const issue of data.issues) {
                const id = (issue as JiraIssue).id;
                const key = issue.key;
                if (id && key) {
                    this.execKeyCache.set(id, key);
                    result.set(id, key);
                }
            }
        } catch (err) {
            this.log.warn('Batch exec key resolution failed: ' + (err as Error).message);
        }
        for (const id of uncached) {
            if (!result.has(id)) {
                result.set(id, id);
            }
        }
        return result;
    }

    async getHistory(testKey: string): Promise<TestRun[]> {
        const issueId = await this.resolveIssueId(testKey);
        if (!issueId) return [];

        const creds = this._getCredentials();
        if (!creds) return [];

        try {
            const query = this._buildGraphqlHistoryQuery();
            const data = await this.cloudClient.graphql(
                query,
                { testIssueIds: [issueId], limit: MAX_RUNS },
                creds.clientId,
                creds.clientSecret,
            );
            if (!data) return [];

            return await this._parseGraphqlHistoryResponse(data);
        } catch (err) {
            this.log.warn('Cloud history failed for ' + testKey + ': ' + (err as Error).message);
            return [];
        }
    }

    private _buildGraphqlHistoryQuery(): string {
        return `
            query($testIssueIds: [String!], $limit: Int!) {
              getTestRuns(testIssueIds: $testIssueIds, limit: $limit) {
                results {
                  id
                  status { name }
                  testExecution { issueId }
                  startedOn
                  finishedOn
                }
              }
            }
        `;
    }

    private async _parseGraphqlHistoryResponse(data: JsonObject): Promise<TestRun[]> {
        const parsed = XrayGraphqlResponseSchema.safeParse(data);
        if (!parsed.success) {
            this.log.warn('GraphQL history response parse failed: ' + parsed.error.message);
            return [];
        }
        const rawResults = parsed.data.getTestRuns?.results;
        if (!rawResults || rawResults.length === 0) return [];

        const execIssueIds = rawResults.map((r) => r.testExecution?.issueId).filter((id): id is string => !!id);

        const execKeyMap =
            execIssueIds.length > 0
                ? await this.resolveExecKeys([...new Set(execIssueIds)])
                : new Map<string, string>();

        return rawResults.map((r) => {
            const rawStatus = typeof r.status === 'string' ? r.status : r.status.name;
            return {
                status: rawStatus || 'UNKNOWN',
                testExecKey: execKeyMap.get(r.testExecution?.issueId ?? '') ?? '',
                ...(r.startedOn ? { startedOn: r.startedOn } : {}),
                ...(r.finishedOn ? { finishedOn: r.finishedOn } : {}),
            };
        });
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHistoryProvider(jiraResource: JiraResource, mode?: 'server' | 'cloud'): TestHistoryProvider {
    const resolvedMode = mode ?? Config.getDefault().get('xrayMode') ?? 'server';
    return resolvedMode === 'cloud' ? new CloudHistoryProvider(jiraResource) : new ServerHistoryProvider(jiraResource);
}
