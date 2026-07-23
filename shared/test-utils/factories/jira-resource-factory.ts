import type JiraResource from '../../../jira_management/jira_resource.js';
import type { Mock, Mocked } from 'vitest';
import type { LogContext } from '../../types/common.js';
import { PROJECT_MANAGEMENT_PATH, TEST_CREDENTIALS } from '../constants.js';

type MockProxy<T> = {
    [P in keyof T]: T[P] extends (...args: unknown[]) => unknown ? Mock : T[P] extends object ? MockProxy<T[P]> : T[P];
};

export function createMockJiraResource(overrides?: Partial<MockProxy<JiraResource>>): Mocked<JiraResource> {
    const base = {
        baseUrl: PROJECT_MANAGEMENT_PATH.API_BASE,
        originUrl: PROJECT_MANAGEMENT_PATH.BASE_URL,
        personalToken: TEST_CREDENTIALS.PROJECT_MANAGEMENT,
        axiosInstance: {} as never,
        log: {
            context: {} as LogContext,
            _logDir: null,
            _filePathCached: null,
            _fileError: false,
            _bytesWritten: 0,
            _maxLogSize: 0,
            _config: null,
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            child: vi.fn(),
            writeFileOnly: vi.fn(),
            filePath: null,
            _ensureDir: vi.fn(),
            _rotateIfNeeded: vi.fn(),
            _writeConsole: vi.fn(),
            _writeFile: vi.fn(),
            _write: vi.fn(),
        },
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn(),
        putJiraResource: vi.fn(),
        deleteJiraResource: vi.fn(),
        getFromOriginPath: vi.fn(),
        searchJiraIssues: vi.fn(),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
        getProjectId: vi.fn(),
        getProjectVersions: vi.fn(),
        getVersionId: vi.fn(),
        createVersion: vi.fn(),
        checkReleaseTasksStatus: vi.fn(),
        getReleaseTasks: vi.fn(),
        getLatestReleases: vi.fn(),
        addTasksToSprint: vi.fn(),
        updateFixVersions: vi.fn(),
        releaseVersion: vi.fn(),
        moveCardsToDone: vi.fn(),
        // Mocked<T> = MockInstance<T> & T — impossible to construct manually
    } as unknown as Mocked<JiraResource>;
    return { ...base, ...(overrides as Partial<MockProxy<JiraResource>>) } as unknown as Mocked<JiraResource>;
}
