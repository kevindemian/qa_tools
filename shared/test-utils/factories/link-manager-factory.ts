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
        issueLinkService: {
            getIssueLinks: vi.fn().mockResolvedValue([]),
            getIssueLinksByType: vi.fn().mockResolvedValue([]),
            removeIssueLink: vi.fn().mockResolvedValue(undefined),
            clearIssueLinksByType: vi.fn().mockResolvedValue(0),
            createLink: vi.fn().mockResolvedValue('created'),
            linkTestsToRequirement: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
            linkTestToTestExecution: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
            linkRelated: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
            linkPreCondition: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
            linkSourceToTargets: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        } as never,
        preconditionHandler: {} as never,
        linkTypesCache: null,
        cacheFilePath: null,
        getIssueLinkTypes: vi.fn(),
        resolveLinkTypeId: vi.fn(),
        linkTestsToRequirement: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        linkTestToTestExecution: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        linkRelated: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        linkPreCondition: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        linkSourceToTargets: vi.fn().mockResolvedValue({ created: 0, skipped: 0, failed: [], missing: [] }),
        createLink: vi.fn().mockResolvedValue('created'),
        getIssueLinks: vi.fn().mockResolvedValue([]),
        getIssueLinksByType: vi.fn().mockResolvedValue([]),
        removeIssueLink: vi.fn().mockResolvedValue(undefined),
        clearIssueLinksByType: vi.fn().mockResolvedValue(0),
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
