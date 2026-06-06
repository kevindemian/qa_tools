import type { JiraResourceLike } from '../../../shared/types.js';
import type { Mock } from 'vitest';
import type JiraLinkManager from '../../../jira_management/jira_link_manager.js';
import type TestExecutionCreator from '../../../jira_management/test-execution-creator.js';

export type MockTestExecutionCreator = {
    jiraResource: JiraResourceLike;
    linkManager: JiraLinkManager;
    _linkTestsToExecution: Mock;
    addTestsToExistingExecution: Mock;
    createWithLinks: Mock;
    create: Mock;
};

export function createMockTestExecutionCreator(overrides?: Partial<MockTestExecutionCreator>): TestExecutionCreator {
    const base = {
        jiraResource: {} as JiraResourceLike,
        linkManager: {} as JiraLinkManager,
        _linkTestsToExecution: vi.fn((_teKey: string, _testKeys: string[]) => ({
            linked: 0,
            failed: 0,
        })),
        addTestsToExistingExecution: vi.fn((_teKey: string, _testKeys: string[]) => ({
            key: 'MOCK-TE',
            summary: 'Mock Test Execution',
        })),
        createWithLinks: vi.fn(
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
        create: vi.fn((_projectName: string, _testKeys: string[], _csvName: string, _titleOverride?: string) => ({
            key: 'MOCK-TE',
            summary: 'Mock Test Execution',
        })),
    } as unknown as TestExecutionCreator;
    return Object.assign(base, overrides);
}
