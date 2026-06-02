import { jest } from '@jest/globals';
import type { TestExecutionSummary } from '../../shared/types';

export const matchPreconditionByTokenOverlap = jest.fn<(...args: unknown[]) => string[]>();
export const matchPreconditionByDualThreshold = jest.fn<(...args: unknown[]) => string[]>();

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

    getIssueLinkTypes = jest.fn<() => Promise<unknown>>();
    resolveLinkTypeId = jest.fn<(linkTypeName: string) => Promise<string | null>>();
    linkIssues =
        jest.fn<(sourceKey: string, linkedIssues: Array<{ key: string; linkType: string }>) => Promise<void>>();
    createIssueLink = jest.fn<(sourceKey: string, targetKey: string, linkTypeName: string) => Promise<void>>();
    _getPreconditionFieldId = jest.fn<() => Promise<string | null>>();
    associatePrecondition = jest.fn<(testKey: string, preconditionKey: string) => Promise<void>>();
    _resolvePreconditionIssueTypeId = jest.fn<() => Promise<string | null>>();
    listPreconditions = jest.fn<(project: string, maxResults?: number) => Promise<unknown[]>>();
    createPrecondition = jest.fn<(project: string, summary: string) => Promise<unknown>>();
    listTestExecutions = jest.fn<(project: string, maxResults?: number) => Promise<TestExecutionSummary[]>>();
    validateTestExecutionKey = jest.fn<(issueKey: string) => Promise<boolean>>();
    getTestCaseSummaries = jest.fn<(keys: string[]) => Promise<Array<{ key: string; summary: string }>>>();
}

export default JiraLinkManager;
