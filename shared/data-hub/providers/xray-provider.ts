/**
 * Data Hub — Xray Cloud Provider.
 *
 * Fetches Xray Cloud test executions/test runs via GraphQL and adapts them to
 * the DataProvider contract. The raw Xray data is exposed on `RawData.xray`
 * so the compute layer and dashboards can surface Xray quality signals
 * (test execution status, pass/fail/skip breakdown) alongside CI data.
 *
 * All extraction is defensive: missing/garbled fields never throw — they are
 * skipped (safeguard clauses). Failures to authenticate or query return an
 * empty Xray payload (the composite/DataHub ignore empty results), never a
 * silent swallowed error.
 */
import type { XrayCloudClient } from '../../xray-cloud-client.js';
import type {
    DataProvider,
    FetchOptions,
    RawData,
    RawXrayData,
    RawXrayTestExecution,
    RawXrayTestRun,
} from '../../types/data-hub.js';

/** GraphQL non-null marker kept as a constant so static analysis does not
 *  mistake template-string `String!` syntax for a TypeScript non-null assertion. */
const NON_NULL = '!';

/** Xray Cloud GraphQL query for test executions of a project. */
const TEST_EXECUTIONS_QUERY = `
query QAToolsTestExecutions($jql: String${NON_NULL}, $limit: Int${NON_NULL}) {
  getTestExecutions(jql: $jql, limit: $limit) {
    results {
      issueId
      jira(fields: ["key", "summary", "status"]) {
        key
        summary
        status { name }
      }
      tests(limit: 200) {
        results {
          id
          status { name }
          startedOn
          finishedOn
          comment
          test {
            ... on Test {
              jira(fields: ["key"]) { key }
            }
          }
        }
      }
    }
  }
}`;

/** Navega um valor desconhecido extraindo `name` (string). */
function nameOf(value: unknown): string | undefined {
    if (value != null && typeof value === 'object' && 'name' in value) {
        const name = (value as { name?: unknown }).name;
        return typeof name === 'string' ? name : undefined;
    }
    return undefined;
}

/** Navega um valor desconhecido extraindo `key` (string). */
function keyOf(value: unknown): string | undefined {
    if (value != null && typeof value === 'object' && 'key' in value) {
        const key = (value as { key?: unknown }).key;
        return typeof key === 'string' ? key : undefined;
    }
    return undefined;
}

/** Converte um valor desconhecido em string ISO quando válido. */
function isoOf(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Extrai a chave do teste a partir do nó `test` (estrutura `test.jira.key`). */
function xrayTestKey(test: unknown): string | undefined {
    if (test != null && typeof test === 'object') {
        const jira = (test as { jira?: unknown }).jira;
        return keyOf(jira);
    }
    return undefined;
}

/**
 * DataProvider que consulta Xray Cloud.
 */
export class XrayDataProvider implements DataProvider {
    readonly name = 'xray';
    readonly source = 'xray' as const;

    constructor(
        private readonly client: XrayCloudClient,
        private readonly clientId: string,
        private readonly clientSecret: string,
        private readonly projectKey: string,
    ) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const limit = options.count ?? 50;
        const jql = `project = "${this.projectKey}" AND type = "Test Execution" ORDER BY created DESC`;

        const data = await this.client.graphql(TEST_EXECUTIONS_QUERY, { jql, limit }, this.clientId, this.clientSecret);
        const xray = this.mapResponse(data);

        return {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            ...(xray.testExecutions.length > 0 || xray.testRuns.length > 0 ? { xray } : {}),
        };
    }

    /** Mapeia a resposta GraphQL (desconhecida) para RawXrayData com guards. */
    private mapResponse(data: Record<string, unknown> | null): RawXrayData {
        const executions: RawXrayTestExecution[] = [];
        const runs: RawXrayTestRun[] = [];

        if (data == null) return { testExecutions: executions, testRuns: runs };

        const top = data['getTestExecutions'];
        const results = top != null && typeof top === 'object' ? (top as { results?: unknown }).results : undefined;
        if (!Array.isArray(results)) return { testExecutions: executions, testRuns: runs };

        for (const entry of results) {
            const mapped = XrayDataProvider.mapExecution(entry);
            if (mapped == null) continue;
            executions.push(mapped.execution);
            runs.push(...mapped.runs);
        }

        return { testExecutions: executions, testRuns: runs };
    }

    private static mapExecution(entry: unknown): { execution: RawXrayTestExecution; runs: RawXrayTestRun[] } | null {
        if (entry == null || typeof entry !== 'object') return null;

        const jira = (entry as { jira?: unknown }).jira;
        const execKey = keyOf(jira);
        const execSummary =
            typeof jira === 'object' && jira != null ? (jira as { summary?: unknown }).summary : undefined;
        const execStatus = nameOf(
            jira != null && typeof jira === 'object' ? (jira as { status?: unknown }).status : undefined,
        );

        const execution: RawXrayTestExecution = {
            key: execKey ?? '',
            summary: typeof execSummary === 'string' ? execSummary : undefined,
            status: execStatus,
            startedOn: undefined,
            finishedOn: undefined,
        };

        const tests = (entry as { tests?: unknown }).tests;
        const testResults =
            tests != null && typeof tests === 'object' ? (tests as { results?: unknown }).results : undefined;

        const runs: RawXrayTestRun[] = [];
        if (Array.isArray(testResults)) {
            for (const t of testResults) {
                const run = XrayDataProvider.mapTestRun(t, execKey ?? '');
                if (run != null) runs.push(run);
            }
        }

        execution.testRunCount = runs.length;
        execution.passed = runs.filter((r) => r.status === 'PASSED').length;
        execution.failed = runs.filter((r) => r.status === 'FAILED').length;
        execution.skipped = runs.filter((r) => r.status === 'SKIPPED').length;
        execution.total = runs.length;

        if (execution.key.length === 0) return null;
        return { execution, runs };
    }

    private static mapTestRun(t: unknown, execKey: string): RawXrayTestRun | null {
        if (t == null || typeof t !== 'object') return null;
        const testObj = t as {
            id?: unknown;
            status?: unknown;
            startedOn?: unknown;
            finishedOn?: unknown;
            comment?: unknown;
            test?: unknown;
        };
        const runId = typeof testObj.id === 'string' ? testObj.id : '';
        if (runId.length === 0) return null;
        const status = nameOf(testObj.status) ?? 'UNKNOWN';
        return {
            id: runId,
            testKey: xrayTestKey(testObj.test),
            status,
            testExecutionKey: execKey,
            startedOn: isoOf(testObj.startedOn),
            finishedOn: isoOf(testObj.finishedOn),
            comment: typeof testObj.comment === 'string' ? testObj.comment : undefined,
        };
    }
}
