/** A single step within a manual or automated test case.
 * Field names match the Xray Server REST API exactly.
 * {@link https://docs.getxray.app/display/XRAY/Test+Execution}
 * @production `Expected Result` — field name com espaço exigido pela Xray Server API.
 *   NÃO alterar para `ExpectedResult` sem revalidar contra API de produção.
 */
export interface TestStep {
    fields: {
        /** User-facing action description. */
        Action?: string;
        /** Input data for the step. */
        Data?: string;
        /** Expected outcome after the action.
         * @production Xray Server API exige o nome com espaço (`Expected Result`).
         * Cloud GraphQL mapeia internamente para `result` no mutation `addTestStep`. */
        'Expected Result'?: string;
    };
}

/** Summary of an existing pre-condition fetched from Jira. */
export interface PreConditionSummary {
    key: string;
    summary: string;
}

/** Summary of a Test Execution issue from a JQL search. */
export interface TestExecutionSummary {
    key: string;
    summary: string;
    status: string;
    created: string;
}

/** Outcome of matching a desired precondition against available ones. */
export interface PreConditionMatchResult {
    /** Resolved reference key, or `'__create__'` when a new one must be created. */
    key: string;
    /** Human summary (matched or original). */
    summary: string;
    /** Whether this is an exact, overlap, or create match. */
    matchType: 'exact' | 'containment' | 'overlap' | 'create';
}

/** A complete test case composed of ordered steps. */
export interface TestCase {
    /** Human-readable test title. */
    title: string;
    /** Optional longer description of the test. */
    description?: string;
    /** Ordered list of execution steps. */
    steps: TestStep[];
    /** Preconditions supplied inline or as external references. */
    precondition?: Array<{
        type: 'inline' | 'reference';
        value: string;
    }>;
    /** Logical grouping label (e.g. smoke, regression). */
    group?: string;
    /** Jira issues linked to this test. */
    linkedIssues?: Array<{
        key: string;
        linkType: string;
    }>;
}

/** A single test run entry from Xray Cloud GraphQL. */
export interface XrayTestRun {
    id?: string;
    status?: { name?: string };
    testExecution?: { key?: string; id?: string; issueId?: string };
    startedOn?: string;
    finishedOn?: string;
}
