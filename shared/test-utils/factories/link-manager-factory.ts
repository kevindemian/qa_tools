import { jest } from '@jest/globals';
import type JiraLinkManager from '../../../jira_management/jira_link_manager';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown
        ? jest.Mock
        : T[P] extends object
          ? MockProxy<T[P]>
          : T[P];
};

export function createMockLinkManager(overrides?: Partial<MockProxy<JiraLinkManager>>): jest.Mocked<JiraLinkManager> {
    // Single cast: jest.Mocked<T> = MockInstance<T> & T, impossible to construct manually
    const base = {
        jiraResource: {} as never,
        linkTypeManager: {} as never,
        linkOperations: {} as never,
        preconditionHandler: {} as never,
        linkTypesCache: null,
        cacheFilePath: null,
        getIssueLinkTypes: jest.fn(),
        resolveLinkTypeId: jest.fn(),
        linkIssues: jest.fn(),
        createIssueLink: jest.fn(),
        _getPreconditionFieldId: jest.fn(),
        associatePrecondition: jest.fn(),
        _resolvePreconditionIssueTypeId: jest.fn(),
        listPreconditions: jest.fn(),
        createPrecondition: jest.fn(),
        listTestExecutions: jest.fn(),
        validateTestExecutionKey: jest.fn(),
        getTestCaseSummaries: jest.fn(),
    } as unknown as jest.Mocked<JiraLinkManager>;
    return {
        ...base,
        ...(overrides as Partial<MockProxy<JiraLinkManager>>),
    } as unknown as jest.Mocked<JiraLinkManager>;
}
