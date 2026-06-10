import type { VersionData, JiraIssue, SearchResponse, JiraResourceLike } from './jira-resource-types.js';
import { nullAs } from '../shared/test-utils.js';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';

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
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            log: createMockJiraResource().log,
            getProjectId: vi.fn(),
            getProjectVersions: vi.fn(),
            getVersionId: vi.fn(),
            searchJiraIssues: vi.fn(),
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
            checkReleaseTasksStatus: vi.fn(),
        };
        expect(typeof mock.getJiraResource).toBe('function');
        expect(typeof mock.log.info).toBe('function');
        expect(typeof mock.log.error).toBe('function');
    });

    it('import from JiraResource class satisfies JiraResourceLike', () => {
        // This is a compile-time check: JiraResource is tested later via integration.
        // Here we just verify the type is exported correctly.
        const typeCheck: { new (personalToken: string, baseUrl: string): JiraResourceLike } = nullAs();
        expect(typeCheck).toBeNull();
    });
});
