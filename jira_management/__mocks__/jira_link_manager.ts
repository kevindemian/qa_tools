import type { TestExecutionSummary } from '../../shared/types.js';

export const matchPreconditionByTokenOverlap = vi.fn<(...args: unknown[]) => string[]>();
export const matchPreconditionByDualThreshold = vi.fn<(...args: unknown[]) => string[]>();

export class JiraLinkManager {
    jiraResource: Record<string, unknown>;
    linkTypeManager: Record<string, unknown>;
    issueLinkService: Record<string, unknown>;
    preconditionHandler: Record<string, unknown>;

    constructor(jiraResource: Record<string, unknown>) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = {};
        this.issueLinkService = {};
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
    linkTestsToRequirement = vi.fn<(requirementKey: string, testKeys: string[]) => Promise<unknown>>();
    linkTestToTestExecution = vi.fn<(teKey: string, testKeys: string[]) => Promise<unknown>>();
    linkRelated = vi.fn<(sourceKey: string, targetKeys: string[]) => Promise<unknown>>();
    linkPreCondition = vi.fn<(testKey: string, preconditionKeys: string[]) => Promise<unknown>>();
    linkSourceToTargets =
        vi.fn<(sourceKey: string, targets: Array<{ key: string; linkType: string }>) => Promise<unknown>>();
    createLink = vi.fn<(input: { linkType: string; inwardKey: string; outwardKey: string }) => Promise<unknown>>();
    getIssueLinks = vi.fn<(issueKey: string) => Promise<unknown[]>>();
    getIssueLinksByType = vi.fn<(issueKey: string, linkTypeName: string) => Promise<unknown[]>>();
    removeIssueLink = vi.fn<(linkId: string) => Promise<void>>();
    clearIssueLinksByType = vi.fn<(issueKey: string, linkTypeName: string) => Promise<number>>();
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
