import { createMockJiraResource } from './jira-resource-factory.js';

describe('CreateMockJiraResource', () => {
    it('returns a mock with all methods as vi.fn()', () => {
        const mock = createMockJiraResource();

        expect(typeof mock.getJiraResource).toBe('function');
        expect(mock['getJiraResource']).not.toThrow();
        expect(typeof mock.postJiraResource).toBe('function');
        expect(typeof mock.putJiraResource).toBe('function');
        expect(typeof mock.searchJiraIssues).toBe('function');
        expect(typeof mock.getTransitionsForIssue).toBe('function');
        expect(typeof mock.transitionIssue).toBe('function');
        expect(typeof mock.getProjectId).toBe('function');
        expect(typeof mock.getProjectVersions).toBe('function');
        expect(typeof mock.getVersionId).toBe('function');
        expect(typeof mock.createVersion).toBe('function');
        expect(typeof mock.checkReleaseTasksStatus).toBe('function');
        expect(typeof mock.getReleaseTasks).toBe('function');
        expect(typeof mock.getLatestReleases).toBe('function');
        expect(typeof mock.addTasksToSprint).toBe('function');
        expect(typeof mock.updateFixVersions).toBe('function');
        expect(typeof mock.releaseVersion).toBe('function');
        expect(typeof mock.moveCardsToDone).toBe('function');
    });

    it('provides default property values', () => {
        const mock = createMockJiraResource();

        expect(mock.baseUrl).toBe('https://jira.test.com/rest/api/2');
        expect(mock.personalToken).toBe('fake-token');
    });

    it('has a mock log with info/warn/error/debug', () => {
        const mock = createMockJiraResource();

        expect(typeof mock.log.info).toBe('function');
        expect(typeof mock.log.warn).toBe('function');
        expect(typeof mock.log.error).toBe('function');
        expect(typeof mock.log.debug).toBe('function');
    });

    it('merges overrides correctly', () => {
        const customGet = vi.fn();
        const mock = createMockJiraResource({ getJiraResource: customGet });

        expect(mock['getJiraResource']).toBe(customGet);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockJiraResource();
        const b = createMockJiraResource();

        expect(a['getJiraResource']).not.toBe(b['getJiraResource']);
    });
});
