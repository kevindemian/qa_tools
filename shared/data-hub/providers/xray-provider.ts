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
    DataSource,
    FetchOptions,
    RawData,
    RawXrayData,
    RawXrayTestExecution,
    RawXrayTestRun,
    XrayRequirementCoverage,
    XrayDefect,
} from '../../types/data-hub.js';

/** GraphQL non-null marker kept as a constant so static analysis does not
 *  mistake template-string `String!` syntax for a TypeScript non-null assertion. */
const NON_NULL = '!';

/** Confidence applied to XR-2 (requirement coverage + defects) payloads.
 *  Lower than core execution data: these fields are nested and optional. */
const XR2_CONFIDENCE = 0.8;

/** Xray Cloud GraphQL query for test executions of a project.
 *  XR-2 extension: each test run also fetches linked `defects`, and each
 *  linked `Test` fetches `requirementStatuses` (requirement → coverage). */
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
          defects {
            key
            summary
            status { name }
          }
          test {
            ... on Test {
              jira(fields: ["key"]) { key }
              requirementStatuses {
                requirement { jira(fields: ["key"]) { key } }
                status { name }
              }
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

/** Extrai uma chave de issue a partir de um nó (aceita `key` direto ou `jira.key`). */
function issueKeyOf(value: unknown): string | undefined {
    if (value == null || typeof value !== 'object') return undefined;
    const v = value as { key?: unknown; jira?: unknown };
    if (typeof v.key === 'string' && v.key.length > 0) return v.key;
    return keyOf(v.jira);
}

/** Extrai um status que pode vir como string (`"COVERED"`) ou objeto `{ name }`. */
function statusValueOf(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) return value;
    return nameOf(value);
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

        const coverage = xray.requirementCoverage ?? [];
        const defects = xray.defects ?? [];
        const hasCore = xray.testExecutions.length > 0 || xray.testRuns.length > 0;
        const hasXr2 = coverage.length > 0 || defects.length > 0;

        const rawData: RawData = {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
        };

        if (hasCore || hasXr2) {
            rawData.xray = xray;
        }

        if (hasXr2) {
            const now = new Date().toISOString();
            const provenance = new Map<string, DataSource>();
            if (coverage.length > 0) {
                provenance.set('xray-requirement-coverage', {
                    confidence: XR2_CONFIDENCE,
                    source: 'xray-api',
                    timestamp: now,
                });
            }
            if (defects.length > 0) {
                provenance.set('xray-defects', { confidence: XR2_CONFIDENCE, source: 'xray-api', timestamp: now });
            }
            rawData.provenance = provenance;
        }

        return rawData;
    }

    /** Mapeia a resposta GraphQL (desconhecida) para RawXrayData com guards.
     *  Também extrai requirement coverage e defects (XR-2) quando presentes. */
    private mapResponse(data: Record<string, unknown> | null): RawXrayData {
        const executions: RawXrayTestExecution[] = [];
        const runs: RawXrayTestRun[] = [];
        const requirementCoverage: XrayRequirementCoverage[] = [];
        const defects: XrayDefect[] = [];
        const seenReq = new Set<string>();

        if (data == null) return { testExecutions: executions, testRuns: runs, requirementCoverage, defects };

        const top = data['getTestExecutions'];
        const results = top != null && typeof top === 'object' ? (top as { results?: unknown }).results : undefined;
        if (!Array.isArray(results))
            return { testExecutions: executions, testRuns: runs, requirementCoverage, defects };

        for (const entry of results) {
            const mapped = XrayDataProvider.mapExecution(entry, seenReq, requirementCoverage, defects);
            if (mapped == null) continue;
            executions.push(mapped.execution);
            runs.push(...mapped.runs);
        }

        return { testExecutions: executions, testRuns: runs, requirementCoverage, defects };
    }

    private static mapExecution(
        entry: unknown,
        seenReq: Set<string>,
        requirementCoverage: XrayRequirementCoverage[],
        defects: XrayDefect[],
    ): { execution: RawXrayTestExecution; runs: RawXrayTestRun[] } | null {
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
                const run = XrayDataProvider.mapTestRun(t, execKey ?? '', seenReq, requirementCoverage, defects);
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

    private static mapTestRun(
        t: unknown,
        execKey: string,
        seenReq: Set<string>,
        requirementCoverage: XrayRequirementCoverage[],
        defects: XrayDefect[],
    ): RawXrayTestRun | null {
        if (t == null || typeof t !== 'object') return null;
        const testObj = t as {
            id?: unknown;
            status?: unknown;
            startedOn?: unknown;
            finishedOn?: unknown;
            comment?: unknown;
            test?: unknown;
            defects?: unknown;
        };
        const runId = typeof testObj.id === 'string' ? testObj.id : '';
        if (runId.length === 0) return null;
        const status = nameOf(testObj.status) ?? 'UNKNOWN';
        const testKey = xrayTestKey(testObj.test);

        XrayDataProvider.mapDefects(testObj.defects, testKey, defects);
        XrayDataProvider.mapRequirementStatuses(testObj.test, testKey, seenReq, requirementCoverage);

        return {
            id: runId,
            testKey,
            status,
            testExecutionKey: execKey,
            startedOn: isoOf(testObj.startedOn),
            finishedOn: isoOf(testObj.finishedOn),
            comment: typeof testObj.comment === 'string' ? testObj.comment : undefined,
        };
    }

    /** Extrai defects (XR-2) do nó `defects` de um test run, com guards. */
    private static mapDefects(defectsNode: unknown, testKey: string | undefined, out: XrayDefect[]): void {
        if (!Array.isArray(defectsNode)) return;
        for (const d of defectsNode) {
            if (d == null || typeof d !== 'object') continue;
            const id = issueKeyOf(d);
            if (id == null || id.length === 0) continue;
            const dObj = d as { summary?: unknown; status?: unknown };
            out.push({
                id,
                testKey,
                title: typeof dObj.summary === 'string' ? dObj.summary : undefined,
                status: statusValueOf(dObj.status),
                confidence: XR2_CONFIDENCE,
            });
        }
    }

    /** Extrai requirement coverage (XR-2) do nó `test.requirementStatuses`, com guards.
     *  Deduplica por requirementKey (primeira ocorrência vence). */
    private static mapRequirementStatuses(
        test: unknown,
        testKey: string | undefined,
        seenReq: Set<string>,
        out: XrayRequirementCoverage[],
    ): void {
        if (test == null || typeof test !== 'object') return;
        const reqStatuses = (test as { requirementStatuses?: unknown }).requirementStatuses;
        if (!Array.isArray(reqStatuses)) return;
        for (const rs of reqStatuses) {
            if (rs == null || typeof rs !== 'object') continue;
            const rsObj = rs as { requirement?: unknown; status?: unknown };
            const requirementKey = issueKeyOf(rsObj.requirement);
            if (requirementKey == null || requirementKey.length === 0) continue;
            if (seenReq.has(requirementKey)) continue;
            seenReq.add(requirementKey);
            out.push({
                requirementKey,
                testKey,
                status: statusValueOf(rsObj.status) ?? 'UNKNOWN',
                confidence: XR2_CONFIDENCE,
            });
        }
    }
}
