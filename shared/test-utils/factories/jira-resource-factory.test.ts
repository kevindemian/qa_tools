import { createMockJiraResource } from './jira-resource-factory.js';

const JIRA_RESOURCE_METHODS = [
    'getJiraResource',
    'postJiraResource',
    'putJiraResource',
    'searchJiraIssues',
    'getTransitionsForIssue',
    'transitionIssue',
    'getProjectId',
    'getProjectVersions',
    'getVersionId',
    'createVersion',
    'checkReleaseTasksStatus',
    'getReleaseTasks',
    'getLatestReleases',
    'addTasksToSprint',
    'updateFixVersions',
    'releaseVersion',
    'moveCardsToDone',
];

describe('CreateMockJiraResource', () => {
    it('returns a mock with all methods as vi.fn()', () => {
        const mock = createMockJiraResource();

        expect(JIRA_RESOURCE_METHODS.every((m) => typeof mock[m as keyof typeof mock] === 'function')).toBeTruthy();
    });

    it('getJiraResource default call does not throw', () => {
        const mock = createMockJiraResource();

        expect(mock['getJiraResource']).not.toThrow();
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
