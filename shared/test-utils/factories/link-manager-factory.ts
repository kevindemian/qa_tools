import type JiraLinkManager from '../../../jira_management/jira_link_manager.js';
import type { Mock, Mocked } from 'vitest';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown ? Mock : T[P] extends object ? MockProxy<T[P]> : T[P];
};

export function createMockLinkManager(overrides?: Partial<MockProxy<JiraLinkManager>>): Mocked<JiraLinkManager> {
    // Single cast: Mocked<T> = MockInstance<T> & T, impossible to construct manually
    const base = {
        jiraResource: {} as never,
        linkTypeManager: {} as never,
        linkOperations: {} as never,
        preconditionHandler: {} as never,
        linkTypesCache: null,
        cacheFilePath: null,
        getIssueLinkTypes: vi.fn(),
        resolveLinkTypeId: vi.fn(),
        linkIssues: vi.fn(),
        createIssueLink: vi.fn(),
        _getPreconditionFieldId: vi.fn(),
        associatePrecondition: vi.fn(),
        _resolvePreconditionIssueTypeId: vi.fn(),
        listPreconditions: vi.fn(),
        createPrecondition: vi.fn(),
        listTestExecutions: vi.fn(),
        validateTestExecutionKey: vi.fn(),
        getTestCaseSummaries: vi.fn(),
    } as unknown as Mocked<JiraLinkManager>;
    return {
        ...base,
        ...(overrides as Partial<MockProxy<JiraLinkManager>>),
    } as unknown as Mocked<JiraLinkManager>;
}
