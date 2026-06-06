import type { TestExecutionSummary } from '../../shared/types.js';

export const matchPreconditionByTokenOverlap = vi.fn<(...args: unknown[]) => string[]>();
export const matchPreconditionByDualThreshold = vi.fn<(...args: unknown[]) => string[]>();

export class JiraLinkManager {
    jiraResource: Record<string, unknown>;
    linkTypeManager: Record<string, unknown>;
    linkOperations: Record<string, unknown>;
    preconditionHandler: Record<string, unknown>;

    constructor(jiraResource: Record<string, unknown>) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = {};
        this.linkOperations = {};
        this.preconditionHandler = {};
    }

    get linkTypesCache(): Record<string, unknown> {
        return {};
    }
    get cacheFilePath(): string | null {
        return null;
    }

    getIssueLinkTypes = vi.fn<() => Promise<unknown>>();
    resolveLinkTypeId = vi.fn<(linkTypeName: string) => Promise<string | null>>();
    linkIssues = vi.fn<(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>) => Promise<void>>();
    createIssueLink = vi.fn<(sourceKey: string, targetKey: string, linkTypeName: string) => Promise<void>>();
    _getPreconditionFieldId = vi.fn<() => Promise<string | null>>();
    associatePrecondition = vi.fn<(testKey: string, preconditionKey: string) => Promise<void>>();
    _resolvePreconditionIssueTypeId = vi.fn<() => Promise<string | null>>();
    listPreconditions = vi.fn<(project: string, maxResults?: number) => Promise<unknown[]>>();
    createPrecondition = vi.fn<(project: string, summary: string) => Promise<unknown>>();
    listTestExecutions = vi.fn<(project: string, maxResults?: number) => Promise<TestExecutionSummary[]>>();
    validateTestExecutionKey = vi.fn<(issueKey: string) => Promise<boolean>>();
    getTestCaseSummaries = vi.fn<(keys: string[]) => Promise<Array<{ key: string; summary: string }>>>();
}

export default JiraLinkManager;
