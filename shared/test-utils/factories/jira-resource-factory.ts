import { jest } from '@jest/globals';
import type JiraResource from '../../../jira_management/jira_resource';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown
        ? jest.Mock
        : T[P] extends object
          ? MockProxy<T[P]>
          : T[P];
};

export function createMockJiraResource(overrides?: Partial<MockProxy<JiraResource>>): jest.Mocked<JiraResource> {
    const base = {
        baseUrl: 'https://jira.test.com/rest/api/2',
        originUrl: 'https://jira.test.com',
        personalToken: 'fake-token',
        axiosInstance: {} as never,
        log: {
            context: {} as Record<string, unknown>,
            _logDir: null,
            _filePathCached: null,
            _fileError: false,
            _bytesWritten: 0,
            _maxLogSize: 0,
            _config: null,
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            child: jest.fn(),
            writeFileOnly: jest.fn(),
            filePath: null,
            _ensureDir: jest.fn(),
            _rotateIfNeeded: jest.fn(),
            _writeConsole: jest.fn(),
            _writeFile: jest.fn(),
            _write: jest.fn(),
        },
        getJiraResource: jest.fn(),
        postJiraResource: jest.fn(),
        putJiraResource: jest.fn(),
        getFromOriginPath: jest.fn(),
        searchJiraIssues: jest.fn(),
        getTransitionsForIssue: jest.fn(),
        transitionIssue: jest.fn(),
        getProjectId: jest.fn(),
        getProjectVersions: jest.fn(),
        getVersionId: jest.fn(),
        createVersion: jest.fn(),
        checkReleaseTasksStatus: jest.fn(),
        getReleaseTasks: jest.fn(),
        getLatestReleases: jest.fn(),
        addTasksToSprint: jest.fn(),
        updateFixVersions: jest.fn(),
        releaseVersion: jest.fn(),
        moveCardsToDone: jest.fn(),
        // jest.Mocked<T> = MockInstance<T> & T — impossible to construct manually
    } as unknown as jest.Mocked<JiraResource>;
    return { ...base, ...(overrides as Partial<MockProxy<JiraResource>>) } as unknown as jest.Mocked<JiraResource>;
}
