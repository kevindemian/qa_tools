import type { JiraResourceLike } from '../../../shared/types';
import type JiraLinkManager from '../../../jira_management/jira_link_manager';
import type TestExecutionCreator from '../../../jira_management/test-execution-creator';

export type MockTestExecutionCreator = {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;
    _linkTestsToExecution: jest.Mock;
    addTestsToExistingExecution: jest.Mock;
    createWithLinks: jest.Mock;
    create: jest.Mock;
};

export function createMockTestExecutionCreator(overrides?: Partial<MockTestExecutionCreator>): TestExecutionCreator {
    const base = {
        jiraResource: {} as JiraResourceLike,
        linkManager: {} as JiraLinkManager,
        _linkTestsToExecution: jest.fn((_teKey: string, _testKeys: string[]) => ({
            linked: 0,
            failed: 0,
        })),
        addTestsToExistingExecution: jest.fn((_teKey: string, _testKeys: string[]) => ({
            key: 'MOCK-TE',
            summary: 'Mock Test Execution',
        })),
        createWithLinks: jest.fn(
            (
                _projectName: string,
                _testKeys: string[],
                _csvName: string,
                _execOpts?: { title?: string; description?: string },
            ) => ({
                key: 'MOCK-TE',
                summary: 'Mock Test Execution',
            }),
        ),
        create: jest.fn((_projectName: string, _testKeys: string[], _csvName: string, _titleOverride?: string) => ({
            key: 'MOCK-TE',
            summary: 'Mock Test Execution',
        })),
    } as unknown as TestExecutionCreator;
    return Object.assign(base, overrides);
}
