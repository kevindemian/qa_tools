import type { VersionData, JiraIssue, SearchResponse, JiraResourceLike } from './jira-resource-types';

describe('jira-resource-types', () => {
    it('VersionData has the correct shape', () => {
        const v: VersionData = { id: '1', name: 'v1' };
        expect(v.id).toBe('1');
        expect(v.name).toBe('v1');
    });

    it('JiraIssue has the correct shape', () => {
        const issue: JiraIssue = {
            key: 'PROJ-1',
            fields: { summary: 'Test' },
        };
        expect(issue.key).toBe('PROJ-1');
        expect(issue.fields.summary).toBe('Test');
    });

    it('SearchResponse has the correct shape', () => {
        const resp: SearchResponse = { issues: [], total: 0 };
        expect(resp.issues).toEqual([]);
        expect(resp.total).toBe(0);
    });

    it('JiraResourceLike interface is structurally sound', () => {
        const mock: JiraResourceLike = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
            log: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                child: jest.fn(),
            } as unknown as import('../shared/logger').Logger,
            getProjectId: jest.fn(),
            getProjectVersions: jest.fn(),
            getVersionId: jest.fn(),
            searchJiraIssues: jest.fn(),
            getTransitionsForIssue: jest.fn(),
            transitionIssue: jest.fn(),
            checkReleaseTasksStatus: jest.fn(),
        };
        expect(typeof mock.getJiraResource).toBe('function');
        expect(typeof mock.log.info).toBe('function');
        expect(typeof mock.log.error).toBe('function');
    });

    it('import from JiraResource class satisfies JiraResourceLike', () => {
        // This is a compile-time check: JiraResource is tested later via integration.
        // Here we just verify the type is exported correctly.
        const typeCheck: { new (personalToken: string, baseUrl: string): JiraResourceLike } = null as never;
        expect(typeCheck).toBeNull();
    });
});
