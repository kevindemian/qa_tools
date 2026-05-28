/** Xray per-test history provider. Supports Server (REST) and Cloud (GraphQL).
 * Fetches historical test runs for a given test issue key.
 * Falls back gracefully on API errors — never throws. */

import axios from 'axios';
import type JiraResource from './jira_resource';
import Config from '../shared/config';
import { rootLogger } from '../shared/logger';

const XRAY_AUTH_URL = 'https://xray.cloud.getxray.app/api/v2/authenticate';
const XRAY_GRAPHQL_URL = 'https://xray.cloud.getxray.app/api/v2/graphql';
const MAX_RUNS = 20;

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
            const data = await this.jiraResource.getJiraResource<unknown[]>(
                'rest/raven/1.0/api/test/' + encodeURIComponent(testKey) + '/testruns',
            );
            if (!Array.isArray(data)) {
                this.log.warn('Unexpected Server history response for ' + testKey);
                return [];
            }
            return data.slice(0, MAX_RUNS).map((r: unknown) => {
                const row = r as Record<string, unknown>;
                return {
                    status: safeStr(row.status, 'UNKNOWN'),
                    testExecKey: safeStr(row.testExecKey),
                    startedOn: safeStr(row.startedOn) || undefined,
                    finishedOn: safeStr(row.finishedOn) || undefined,
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
    private token: string | null = null;
    private tokenExpiresAt = 0;
    private readonly issueIdCache = new Map<string, string>();
    private readonly execKeyCache = new Map<string, string>();

    private readonly log = rootLogger.child({ module: 'CloudHistoryProvider' });

    constructor(private readonly jiraResource: JiraResource) {}

    private async getToken(): Promise<string | null> {
        if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
        const cfg = Config.getDefault();
        const clientId = cfg.xrayClientId;
        const clientSecret = cfg.xrayClientSecret;
        if (!clientId || !clientSecret) {
            this.log.warn('XRAY_CLIENT_ID and XRAY_CLIENT_SECRET not set');
            return null;
        }
        try {
            const res = await axios.post<string>(XRAY_AUTH_URL, {
                client_id: clientId,
                client_secret: clientSecret,
            });
            const raw = res.data;
            const token = typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : raw;
            if (!token) {
                this.log.warn('Xray Cloud returned empty token');
                return null;
            }
            this.token = token;
            this.tokenExpiresAt = Date.now() + 55 * 60 * 1000;
            return token;
        } catch (err) {
            this.log.warn('Xray Cloud auth failed: ' + (err as Error).message);
            return null;
        }
    }

    private async resolveIssueId(testKey: string): Promise<string | null> {
        const cached = this.issueIdCache.get(testKey);
        if (cached) return cached;
        try {
            const data = await this.jiraResource.getJiraResource<{ id: string }>(
                'issue/' + encodeURIComponent(testKey) + '?fields=id',
            );
            if (data?.id) {
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
            for (const issue of data.issues ?? []) {
                const issueRecord = issue as unknown as Record<string, unknown>;
                const id = issueRecord.id as string | undefined;
                const key = issue.key ?? '';
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

        const token = await this.getToken();
        if (!token) return [];

        try {
            const res = await axios.post(
                XRAY_GRAPHQL_URL,
                {
                    query: `
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
          `,
                    variables: { testIssueIds: [issueId], limit: MAX_RUNS },
                },
                { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } },
            );

            const body = res.data as Record<string, unknown>;
            const getTestRuns = (body?.data as Record<string, unknown>)?.getTestRuns as
                | Record<string, unknown>
                | undefined;
            const rawResults = getTestRuns?.results as Array<Record<string, unknown>> | undefined;
            if (!Array.isArray(rawResults) || rawResults.length === 0) return [];

            const execIssueIds = rawResults
                .map((r) => {
                    const te = r.testExecution as Record<string, unknown> | undefined;
                    return te?.issueId as string | undefined;
                })
                .filter((id): id is string => !!id);

            const execKeyMap =
                execIssueIds.length > 0 ? await this.resolveExecKeys([...new Set(execIssueIds)]) : new Map();

            return rawResults.map((r) => {
                const te = r.testExecution as Record<string, unknown> | undefined;
                const teIssueId = te?.issueId as string | undefined;
                const rawStatus = (r.status as Record<string, unknown> | undefined)?.name;
                return {
                    status: safeStr(rawStatus, 'UNKNOWN'),
                    testExecKey: teIssueId ? (execKeyMap.get(teIssueId) ?? teIssueId) : '',
                    startedOn: safeStr(r.startedOn) || undefined,
                    finishedOn: safeStr(r.finishedOn) || undefined,
                };
            });
        } catch (err) {
            this.log.warn('Cloud history query failed for ' + testKey + ': ' + (err as Error).message);
            return [];
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createHistoryProvider(jiraResource: JiraResource, mode?: 'server' | 'cloud'): TestHistoryProvider {
    const resolvedMode = mode ?? Config.getDefault().xrayMode ?? 'server';
    return resolvedMode === 'cloud' ? new CloudHistoryProvider(jiraResource) : new ServerHistoryProvider(jiraResource);
}
