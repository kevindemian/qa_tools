import { createHttpClient } from '../shared/http-client';

jest.mock('../shared/http-client', () => ({ createHttpClient: jest.fn() }));

jest.mock('../shared/logger', () => ({
    Logger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => ({
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        })),
    })),
    rootLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(() => ({
            error: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
        })),
    },
}));

jest.mock('../shared/prompt', () => ({
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    extractErrorMessage: jest.fn().mockReturnValue('mocked error message'),
    ProgressBar: jest.fn(() => ({
        update: jest.fn(),
        stop: jest.fn(),
        current: 0,
        total: 0,
        startTime: Date.now(),
        width: 20,
    })),
}));

import JiraResource from './jira_resource';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let mockClient: { get: jest.Mock; post: jest.Mock; put: jest.Mock };
let jiraResource: JiraResource;

function buildResource(): void {
    mockClient = { get: jest.fn(), post: jest.fn(), put: jest.fn() };
    (createHttpClient as jest.Mock).mockReturnValue(mockClient);
    jiraResource = new JiraResource('test-token', 'http://test-jira.com');
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    buildResource();
});

// =====================================================================
// getJiraResource
// =====================================================================

describe('getJiraResource', () => {
    it('returns data on success', async () => {
        const expected = { id: '10000', name: 'TEST' };
        mockClient.get.mockResolvedValue({ data: expected });

        const result = await jiraResource.getJiraResource('project/TEST');
        expect(mockClient.get).toHaveBeenCalledWith('/project/TEST');
        expect(result).toEqual(expected);
    });

    it('throws on network error', async () => {
        mockClient.get.mockRejectedValue(new Error('Network error'));

        await expect(jiraResource.getJiraResource('project/TEST')).rejects.toThrow('Network error');
    });

    it('throws on axios error with status', async () => {
        const axiosErr = new Error('Not found');
        Object.assign(axiosErr, { response: { status: 404, data: { message: 'Not Found' } } });
        mockClient.get.mockRejectedValue(axiosErr);

        await expect(jiraResource.getJiraResource('project/UNKNOWN')).rejects.toThrow('Not found');
    });
});

// =====================================================================
// postJiraResource
// =====================================================================

describe('postJiraResource', () => {
    it('returns data on success', async () => {
        const payload = { name: 'v1.0', project: 'TEST' };
        const expected = { id: '10001', name: 'v1.0' };
        mockClient.post.mockResolvedValue({ data: expected });

        const result = await jiraResource.postJiraResource('version', payload);
        expect(mockClient.post).toHaveBeenCalledWith('/version', payload);
        expect(result).toEqual(expected);
    });

    it('throws on API error', async () => {
        mockClient.post.mockRejectedValue(new Error('API error'));

        await expect(jiraResource.postJiraResource('version', {})).rejects.toThrow('API error');
    });

    it('logs error and re-throws on failure', async () => {
        const apiErr = new Error('Bad request');
        Object.assign(apiErr, { response: { status: 400 } });
        mockClient.post.mockRejectedValue(apiErr);

        await expect(jiraResource.postJiraResource('version', {})).rejects.toThrow('Bad request');
    });
});

// =====================================================================
// putJiraResource
// =====================================================================

describe('putJiraResource', () => {
    it('returns data on success', async () => {
        const payload = { released: true };
        const expected = { id: '10001', released: true };
        mockClient.put.mockResolvedValue({ data: expected, status: 200 });

        const result = await jiraResource.putJiraResource('version/10001', payload);
        expect(mockClient.put).toHaveBeenCalledWith('/version/10001', payload);
        expect(result).toEqual(expected);
    });

    it('returns null when status is 204', async () => {
        mockClient.put.mockResolvedValue({ data: {}, status: 204 });

        const result = await jiraResource.putJiraResource('issue/TEST-1', {});
        expect(result).toBeNull();
    });

    it('throws on API error', async () => {
        mockClient.put.mockRejectedValue(new Error('API error'));

        await expect(jiraResource.putJiraResource('version/10001', {})).rejects.toThrow('API error');
    });

    it('logs error and re-throws on failure', async () => {
        const apiErr = new Error('Forbidden');
        Object.assign(apiErr, { response: { status: 403 } });
        mockClient.put.mockRejectedValue(apiErr);

        await expect(jiraResource.putJiraResource('version/10001', {})).rejects.toThrow('Forbidden');
    });
});

// =====================================================================
// getProjectId
// =====================================================================

describe('getProjectId', () => {
    it('returns project id from API', async () => {
        mockClient.get.mockResolvedValue({ data: { id: '12345' } });

        const result = await jiraResource.getProjectId('TEST');
        expect(mockClient.get).toHaveBeenCalledWith('/project/TEST');
        expect(result).toBe('12345');
    });

    it('returns empty string when project not found', async () => {
        mockClient.get.mockRejectedValue(new Error('Project not found'));

        const result = await jiraResource.getProjectId('UNKNOWN');
        expect(result).toBe('');
    });

    it('returns empty string on network error', async () => {
        mockClient.get.mockRejectedValue(new Error('ECONNREFUSED'));

        const result = await jiraResource.getProjectId('TEST');
        expect(result).toBe('');
    });
});

// =====================================================================
// getProjectVersions
// =====================================================================

describe('getProjectVersions', () => {
    it('returns versions array', async () => {
        const versions = [
            { id: '1', name: 'v1.0', released: true, releaseDate: '2024-01-01' },
            { id: '2', name: 'v2.0', released: false },
        ];
        mockClient.get.mockResolvedValue({ data: versions });

        const result = await jiraResource.getProjectVersions('12345');
        expect(mockClient.get).toHaveBeenCalledWith('/project/12345/versions');
        expect(result).toEqual(versions);
    });

    it('returns empty array on API error', async () => {
        mockClient.get.mockRejectedValue(new Error('Not found'));

        const result = await jiraResource.getProjectVersions('999');
        expect(result).toEqual([]);
    });

    it('returns whatever data shape comes from API', async () => {
        const data = { versions: [{ id: '1' }] };
        mockClient.get.mockResolvedValue({ data });

        const result = await jiraResource.getProjectVersions('12345');
        expect(result).toEqual(data);
    });
});

// =====================================================================
// getTransitionsForIssue
// =====================================================================

describe('getTransitionsForIssue', () => {
    it('returns transition map by target name', async () => {
        mockClient.get.mockResolvedValue({
            data: {
                transitions: [
                    { id: '31', to: { name: 'Approve' } },
                    { id: '41', to: { name: 'Use Test Case' } },
                ],
            },
        });

        const result = await jiraResource.getTransitionsForIssue('TEST-1');
        expect(result).toEqual({ approve: '31', 'use test case': '41' });
    });

    it('returns empty object when no transitions', async () => {
        mockClient.get.mockResolvedValue({ data: {} });

        const result = await jiraResource.getTransitionsForIssue('TEST-1');
        expect(result).toEqual({});
    });

    it('returns empty when transitions is empty array', async () => {
        mockClient.get.mockResolvedValue({ data: { transitions: [] } });

        const result = await jiraResource.getTransitionsForIssue('TEST-1');
        expect(result).toEqual({});
    });

    it('handles transitions without target name', async () => {
        mockClient.get.mockResolvedValue({
            data: {
                transitions: [
                    { id: '31', to: { name: 'Approve' } },
                    { id: '99', to: {} },
                    { id: '41', to: { name: 'Done' } },
                ],
            },
        });

        const result = await jiraResource.getTransitionsForIssue('TEST-1');
        expect(result).toEqual({ approve: '31', done: '41' });
    });

    it('returns empty object on API error (catch block)', async () => {
        mockClient.get.mockRejectedValue(new Error('API error'));

        const result = await jiraResource.getTransitionsForIssue('TEST-1');
        expect(result).toEqual({});
    });
});

// =====================================================================
// searchJiraIssues
// =====================================================================

describe('searchJiraIssues', () => {
    it('returns issues from a single page', async () => {
        const issues = [{ key: 'TEST-1', fields: { summary: 'First issue' } }];
        mockClient.get.mockResolvedValue({ data: { issues, total: 1 } });

        const result = await jiraResource.searchJiraIssues('project = TEST');
        expect(result.issues).toEqual(issues);
        expect(result.total).toBe(1);
    });

    it('returns empty result when no issues', async () => {
        mockClient.get.mockResolvedValue({
            data: { issues: [], total: 0 },
        });

        const result = await jiraResource.searchJiraIssues('project = TEST');
        expect(result.issues).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('paginates when total exceeds maxResults', async () => {
        const page1 = [{ key: 'TEST-1', fields: { summary: 'First' } }];
        const page2 = [{ key: 'TEST-2', fields: { summary: 'Second' } }];
        mockClient.get
            .mockResolvedValueOnce({ data: { issues: page1, total: 2 } })
            .mockResolvedValueOnce({ data: { issues: page2, total: 2 } });

        const result = await jiraResource.searchJiraIssues('project = TEST', 1);
        expect(result.issues).toHaveLength(2);
        expect(result.issues[0]!.key).toBe('TEST-1');
        expect(result.issues[1]!.key).toBe('TEST-2');
        expect(result.total).toBe(2);
    });

    it('returns empty result on API error', async () => {
        mockClient.get.mockRejectedValue(new Error('Search failed'));

        const result = await jiraResource.searchJiraIssues('project = TEST');
        expect(result).toEqual({ issues: [], total: 0 });
    });

    it('handles null issues in response gracefully', async () => {
        mockClient.get.mockResolvedValue({
            data: { issues: null, total: 1 },
        });

        const result = await jiraResource.searchJiraIssues('project = TEST');
        expect(result.issues).toEqual([]);
        expect(result.total).toBe(0);
    });
});

// =====================================================================
// getVersionId
// =====================================================================

describe('getVersionId', () => {
    it('returns version id when found', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockResolvedValueOnce({
            data: [
                { id: '1', name: 'v1.0' },
                { id: '2', name: 'v2.0' },
            ],
        });

        const result = await jiraResource.getVersionId('TEST', 'v2.0');
        expect(result).toBe('2');
    });

    it('returns null when project not found', async () => {
        mockClient.get.mockRejectedValue(new Error('Project not found'));

        const result = await jiraResource.getVersionId('UNKNOWN', 'v1.0');
        expect(result).toBeNull();
    });

    it('returns null when versions fetch fails', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockRejectedValue(new Error('Versions error'));

        const result = await jiraResource.getVersionId('TEST', 'v1.0');
        expect(result).toBeNull();
    });

    it('returns null when versions is not an array', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { id: '10000' } })
            .mockResolvedValueOnce({ data: { versions: [] } });

        const result = await jiraResource.getVersionId('TEST', 'v1.0');
        expect(result).toBeNull();
    });

    it('returns null when version name not found', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { id: '10000' } })
            .mockResolvedValueOnce({ data: [{ id: '1', name: 'v1.0' }] });

        const result = await jiraResource.getVersionId('TEST', 'v3.0');
        expect(result).toBeNull();
    });

    it('is case-insensitive when matching version name', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockResolvedValueOnce({
            data: [{ id: '1', name: 'V2.0-rc1' }],
        });

        const result = await jiraResource.getVersionId('TEST', 'v2.0-rc1');
        expect(result).toBe('1');
    });
});

// =====================================================================
// createVersion
// =====================================================================

describe('createVersion', () => {
    it('creates version when it does not exist', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);
        const created = { id: '10001', name: 'v1.0', project: 'TEST' };
        mockClient.post.mockResolvedValue({ data: created });

        const result = await jiraResource.createVersion('TEST', 'v1.0', 'First release');
        expect(mockClient.post).toHaveBeenCalledWith('/version', {
            description: 'First release',
            name: 'v1.0',
            project: 'TEST',
            released: false,
        });
        expect(result).toEqual(created);
    });

    it('returns null when version already exists', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('existing-id');

        const result = await jiraResource.createVersion('TEST', 'v1.0');
        expect(result).toBeNull();
        expect(mockClient.post).not.toHaveBeenCalled();
    });

    it('creates version without description', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);
        mockClient.post.mockResolvedValue({ data: { id: '1', name: 'v1.0' } });

        const result = await jiraResource.createVersion('TEST', 'v1.0');
        expect(mockClient.post).toHaveBeenCalledWith('/version', expect.objectContaining({ description: undefined }));
        expect(result).toEqual({ id: '1', name: 'v1.0' });
    });

    it('handles post failure gracefully', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);
        mockClient.post.mockRejectedValue(new Error('API error'));

        await expect(jiraResource.createVersion('TEST', 'v1.0')).rejects.toThrow('API error');
    });

    it('handles null response from postJiraResource', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);
        mockClient.post.mockResolvedValue({ data: null });

        const result = await jiraResource.createVersion('TEST', 'v1.0');
        expect(result).toBeNull();
    });
});

// =====================================================================
// checkReleaseTasksStatus
// =====================================================================

describe('checkReleaseTasksStatus', () => {
    it('returns true when all tasks are done', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({
            issues: [
                { key: 'TASK-1', fields: { status: { name: 'done' } } },
                { key: 'TASK-2', fields: { status: { name: 'in use' } } },
            ],
            total: 2,
        });

        const result = await jiraResource.checkReleaseTasksStatus('TEST', 'v1.0');
        expect(result).toBe(true);
    });

    it('returns false when some tasks are not done', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({
            issues: [
                { key: 'TASK-1', fields: { status: { name: 'done' } } },
                { key: 'TASK-2', fields: { status: { name: 'in progress' } } },
            ],
            total: 2,
        });

        const result = await jiraResource.checkReleaseTasksStatus('TEST', 'v1.0');
        expect(result).toBe(false);
    });

    it('returns false when no issues found', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({
            issues: [],
            total: 0,
        });

        const result = await jiraResource.checkReleaseTasksStatus('TEST', 'v1.0');
        expect(result).toBe(false);
    });

    it('returns false on error from getProjectId', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockRejectedValueOnce(new Error('Project error'));

        const result = await jiraResource.checkReleaseTasksStatus('TEST', 'v1.0');
        expect(result).toBe(false);
    });

    it('returns false when versionName is empty (sanitizeJqlValue throws)', async () => {
        const result = await jiraResource.checkReleaseTasksStatus('TEST', '');
        expect(result).toBe(false);
    });
});

// =====================================================================
// getReleaseTasks
// =====================================================================

describe('getReleaseTasks', () => {
    it('returns formatted task list', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({
            issues: [
                { key: 'TASK-1', fields: { summary: 'Implement feature' } },
                { key: 'TASK-2', fields: { summary: 'Fix bug' } },
            ],
            total: 2,
        });

        const result = await jiraResource.getReleaseTasks('TEST', 'v1.0');
        expect(result).toEqual(['[TASK-1] - Implement feature', '[TASK-2] - Fix bug']);
    });

    it('returns empty array when no issues found', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({
            issues: [],
            total: 0,
        });

        const result = await jiraResource.getReleaseTasks('TEST', 'v1.0');
        expect(result).toEqual([]);
    });

    it('filters by type when testOnly=true', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        const searchSpy = jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({ issues: [], total: 0 });

        await jiraResource.getReleaseTasks('TEST', 'v1.0', true);
        const jql = searchSpy.mock.calls[0]![0];
        expect(jql).toContain('AND type = "Test"');
    });

    it('does not add type filter when testOnly=false', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockResolvedValueOnce('10000');
        const searchSpy = jest.spyOn(jiraResource, 'searchJiraIssues').mockResolvedValueOnce({ issues: [], total: 0 });

        await jiraResource.getReleaseTasks('TEST', 'v1.0', false);
        const jql = searchSpy.mock.calls[0]![0];
        expect(jql).not.toContain('AND type = "Test"');
    });

    it('returns empty array on error from getProjectId', async () => {
        jest.spyOn(jiraResource, 'getProjectId').mockRejectedValueOnce(new Error('Project error'));

        const result = await jiraResource.getReleaseTasks('TEST', 'v1.0');
        expect(result).toEqual([]);
    });

    it('returns empty array when versionName is empty (sanitizeJqlValue throws)', async () => {
        const result = await jiraResource.getReleaseTasks('TEST', '');
        expect(result).toEqual([]);
    });
});

// =====================================================================
// getLatestReleases
// =====================================================================

describe('getLatestReleases', () => {
    it('returns latest released and unreleased versions', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockResolvedValueOnce({
            data: [
                { id: '1', name: 'v1.0', released: true, releaseDate: '2024-01-01' },
                { id: '2', name: 'v1.1', released: true, releaseDate: '2024-06-01' },
                { id: '3', name: 'v2.0', released: false },
            ],
        });

        const result = await jiraResource.getLatestReleases('TEST', 1);
        expect(result.latestReleasedVersions).toHaveLength(1);
        expect(result.latestReleasedVersions[0]!.name).toBe('v1.1');
        expect(result.unreleasedVersions).toHaveLength(1);
        expect(result.unreleasedVersions[0]!.name).toBe('v2.0');
    });

    it('returns empty arrays when project not found', async () => {
        mockClient.get.mockRejectedValueOnce(new Error('Project error'));

        const result = await jiraResource.getLatestReleases('UNKNOWN', 5);
        expect(result.latestReleasedVersions).toEqual([]);
        expect(result.unreleasedVersions).toEqual([]);
    });

    it('returns empty arrays when versions fetch fails', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { id: '10000' } })
            .mockRejectedValueOnce(new Error('Versions error'));

        const result = await jiraResource.getLatestReleases('TEST', 5);
        expect(result.latestReleasedVersions).toEqual([]);
        expect(result.unreleasedVersions).toEqual([]);
    });

    it('returns empty arrays when versions is not an array', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { id: '10000' } })
            .mockResolvedValueOnce({ data: { version: [] } });

        const result = await jiraResource.getLatestReleases('TEST', 5);
        expect(result.latestReleasedVersions).toEqual([]);
        expect(result.unreleasedVersions).toEqual([]);
    });

    it('returns multiple released versions sorted by date descending', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockResolvedValueOnce({
            data: [
                { id: '1', name: 'v1.0', released: true, releaseDate: '2024-01-01' },
                { id: '2', name: 'v2.0', released: true, releaseDate: '2024-06-01' },
                { id: '3', name: 'v3.0', released: true, releaseDate: '2024-03-01' },
            ],
        });

        const result = await jiraResource.getLatestReleases('TEST', 2);
        expect(result.latestReleasedVersions).toHaveLength(2);
        expect(result.latestReleasedVersions[0]!.name).toBe('v2.0');
        expect(result.latestReleasedVersions[1]!.name).toBe('v3.0');
    });

    it('filters out versions without releaseDate', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { id: '10000' } }).mockResolvedValueOnce({
            data: [
                { id: '1', name: 'v1.0', released: true, releaseDate: '2024-01-01' },
                { id: '2', name: 'v2.0', released: true },
            ],
        });

        const result = await jiraResource.getLatestReleases('TEST', 5);
        expect(result.latestReleasedVersions).toHaveLength(1);
        expect(result.latestReleasedVersions[0]!.name).toBe('v1.0');
        expect(result.unreleasedVersions).toHaveLength(0);
    });
});

// =====================================================================
// addTasksToSprint
// =====================================================================

describe('addTasksToSprint', () => {
    it('posts tasks to sprint successfully', async () => {
        mockClient.post.mockResolvedValue({ data: {} });

        await jiraResource.addTasksToSprint(['TASK-1', 'TASK-2'], 'sprint-1');
        expect(mockClient.post).toHaveBeenCalledWith('/sprint/sprint-1/issue', {
            issues: ['TASK-1', 'TASK-2'],
        });
    });

    it('re-throws error after logging', async () => {
        mockClient.post.mockRejectedValue(new Error('Sprint error'));

        await expect(jiraResource.addTasksToSprint(['TASK-1'], 'sprint-1')).rejects.toThrow('Sprint error');
    });

    it('handles empty task list', async () => {
        mockClient.post.mockResolvedValue({ data: {} });

        await jiraResource.addTasksToSprint([], 'sprint-1');
        expect(mockClient.post).toHaveBeenCalledWith('/sprint/sprint-1/issue', {
            issues: [],
        });
    });
});

// =====================================================================
// updateFixVersions
// =====================================================================

describe('updateFixVersions', () => {
    it('updates all task fix versions', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        mockClient.put.mockResolvedValue({ data: {}, status: 200 });

        await jiraResource.updateFixVersions(['TASK-1', 'TASK-2'], 'TEST', 'v1.0');
        expect(mockClient.put).toHaveBeenCalledTimes(2);
        expect(mockClient.put).toHaveBeenNthCalledWith(1, '/issue/TASK-1', {
            update: { fixVersions: [{ set: [{ id: 'v-1' }] }] },
        });
        expect(mockClient.put).toHaveBeenNthCalledWith(2, '/issue/TASK-2', {
            update: { fixVersions: [{ set: [{ id: 'v-1' }] }] },
        });
    });

    it('skips when version not found', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);

        await jiraResource.updateFixVersions(['TASK-1'], 'TEST', 'v1.0');
        expect(mockClient.put).not.toHaveBeenCalled();
    });

    it('handles single task', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        mockClient.put.mockResolvedValue({ data: {}, status: 200 });

        await jiraResource.updateFixVersions(['TASK-1'], 'TEST', 'v1.0');
        expect(mockClient.put).toHaveBeenCalledTimes(1);
    });

    it('propagates put error', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        mockClient.put.mockRejectedValue(new Error('Update error'));

        await expect(jiraResource.updateFixVersions(['TASK-1'], 'TEST', 'v1.0')).rejects.toThrow('Update error');
    });
});

// =====================================================================
// releaseVersion
// =====================================================================

describe('releaseVersion', () => {
    it('releases version successfully', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        jest.spyOn(jiraResource, 'checkReleaseTasksStatus').mockResolvedValueOnce(true);
        mockClient.put.mockResolvedValue({ data: {}, status: 200 });

        await jiraResource.releaseVersion('TEST', 'v1.0');
        expect(mockClient.put).toHaveBeenCalledWith('/version/v-1', expect.objectContaining({ released: true }));
    });

    it('aborts when version not found', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce(null);

        await jiraResource.releaseVersion('TEST', 'v1.0');
        expect(mockClient.put).not.toHaveBeenCalled();
    });

    it('aborts when tasks not completed', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        jest.spyOn(jiraResource, 'checkReleaseTasksStatus').mockResolvedValueOnce(false);

        await jiraResource.releaseVersion('TEST', 'v1.0');
        expect(mockClient.put).not.toHaveBeenCalled();
    });

    it('sets correct releaseDate in payload', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        jest.spyOn(jiraResource, 'checkReleaseTasksStatus').mockResolvedValueOnce(true);
        mockClient.put.mockResolvedValue({ data: {}, status: 200 });
        const today = new Date().toISOString().split('T')[0];

        await jiraResource.releaseVersion('TEST', 'v1.0');
        expect(mockClient.put).toHaveBeenCalledWith('/version/v-1', {
            releaseDate: today,
            released: true,
        });
    });

    it('propagates put error', async () => {
        jest.spyOn(jiraResource, 'getVersionId').mockResolvedValueOnce('v-1');
        jest.spyOn(jiraResource, 'checkReleaseTasksStatus').mockResolvedValueOnce(true);
        mockClient.put.mockRejectedValue(new Error('Release error'));

        await expect(jiraResource.releaseVersion('TEST', 'v1.0')).rejects.toThrow('Release error');
    });
});

// =====================================================================
// moveCardsToDone
// =====================================================================

describe('moveCardsToDone', () => {
    let transitionSpy: jest.SpyInstance;

    beforeEach(() => {
        transitionSpy = jest.spyOn(jiraResource, 'transitionIssue').mockResolvedValue();
    });

    it('moves single task through full workflow', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { fields: { status: { name: 'New' } } } }).mockResolvedValueOnce({
            data: {
                transitions: [
                    { id: '31', to: { name: 'approve' } },
                    { id: '41', to: { name: 'use test case' } },
                ],
            },
        });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).toHaveBeenCalledTimes(2);
        expect(transitionSpy).toHaveBeenNthCalledWith(1, 'TASK-1', '31');
        expect(transitionSpy).toHaveBeenNthCalledWith(2, 'TASK-1', '41');
    });

    it('moves through coding in progress workflow', async () => {
        mockClient.get
            .mockResolvedValueOnce({
                data: { fields: { status: { name: 'coding in progress' } } },
            })
            .mockResolvedValueOnce({
                data: {
                    transitions: [
                        { id: '51', to: { name: 'coding done' } },
                        { id: '61', to: { name: 'done' } },
                    ],
                },
            });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).toHaveBeenCalledTimes(2);
        expect(transitionSpy).toHaveBeenNthCalledWith(1, 'TASK-1', '51');
        expect(transitionSpy).toHaveBeenNthCalledWith(2, 'TASK-1', '61');
    });

    it('skips task when status fetch throws', async () => {
        mockClient.get.mockRejectedValue(new Error('Not found'));

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('skips task when data is incomplete', async () => {
        mockClient.get.mockResolvedValueOnce({ data: {} });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('skips task when status is not in workflowMap', async () => {
        mockClient.get
            .mockResolvedValueOnce({
                data: { fields: { status: { name: 'Unknown Status' } } },
            })
            .mockResolvedValueOnce({ data: {} });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('warns when status not in workflowMap even when transitions exist', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { fields: { status: { name: 'Unknown Status' } } } })
            .mockResolvedValueOnce({
                data: { transitions: [{ id: '31', to: { name: 'approve' } }] },
            });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('skips specific transition when transition id not found', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { fields: { status: { name: 'New' } } } }).mockResolvedValueOnce({
            data: {
                transitions: [{ id: '31', to: { name: 'approve' } }],
            },
        });

        await jiraResource.moveCardsToDone(['TASK-1']);
        // approve exists, use test case does not — only one transition call
        expect(transitionSpy).toHaveBeenCalledTimes(1);
        expect(transitionSpy).toHaveBeenCalledWith('TASK-1', '31');
    });

    it('skips task when no transitions returned', async () => {
        mockClient.get
            .mockResolvedValueOnce({ data: { fields: { status: { name: 'New' } } } })
            .mockResolvedValueOnce({ data: { transitions: [] } });

        await jiraResource.moveCardsToDone(['TASK-1']);
        expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('processes multiple tasks independently', async () => {
        mockClient.get
            // task-1
            .mockResolvedValueOnce({ data: { fields: { status: { name: 'New' } } } })
            .mockResolvedValueOnce({
                data: {
                    transitions: [{ id: '31', to: { name: 'approve' } }],
                },
            })
            // task-2 — fetch fails
            .mockRejectedValueOnce(new Error('Network error'))
            // task-3
            .mockResolvedValueOnce({
                data: { fields: { status: { name: 'coding done' } } },
            })
            .mockResolvedValueOnce({
                data: { transitions: [{ id: '71', to: { name: 'done' } }] },
            });

        await jiraResource.moveCardsToDone(['TASK-1', 'TASK-2', 'TASK-3']);
        expect(transitionSpy).toHaveBeenCalledTimes(2);
        expect(transitionSpy).toHaveBeenNthCalledWith(1, 'TASK-1', '31');
        expect(transitionSpy).toHaveBeenNthCalledWith(2, 'TASK-3', '71');
    });

    it('handles API error during transition gracefully', async () => {
        mockClient.get.mockResolvedValueOnce({ data: { fields: { status: { name: 'New' } } } }).mockResolvedValueOnce({
            data: { transitions: [{ id: '31', to: { name: 'approve' } }] },
        });
        transitionSpy.mockRejectedValue(new Error('API error'));

        const moveResult = await jiraResource.moveCardsToDone(['TASK-1']);
        expect(moveResult).toBeUndefined();
        expect(transitionSpy).toHaveBeenCalledTimes(1);
    });
});

// =====================================================================
// getFromOriginPath
// =====================================================================

describe('getFromOriginPath', () => {
    it('returns data on success', async () => {
        const expected = { id: '10000', name: 'TEST' };
        mockClient.get.mockResolvedValue({ data: expected });

        const result = await jiraResource.getFromOriginPath('rest/raven/1.0/api/test/TEST-1/testruns');
        expect(mockClient.get).toHaveBeenCalledWith('http://test-jira.com/rest/raven/1.0/api/test/TEST-1/testruns');
        expect(result).toEqual(expected);
    });

    it('strips leading slash from path', async () => {
        mockClient.get.mockResolvedValue({ data: { key: 'TEST-1' } });

        const result = await jiraResource.getFromOriginPath('/rest/raven/1.0/api/test/TEST-1/testruns');
        expect(mockClient.get).toHaveBeenCalledWith('http://test-jira.com/rest/raven/1.0/api/test/TEST-1/testruns');
        expect(result).toEqual({ key: 'TEST-1' });
    });

    it('throws on network error', async () => {
        mockClient.get.mockRejectedValue(new Error('Network error'));

        await expect(jiraResource.getFromOriginPath('rest/api/test')).rejects.toThrow('Network error');
    });

    it('throws on axios error with status', async () => {
        const axiosErr = new Error('Not found');
        Object.assign(axiosErr, { response: { status: 404, data: { message: 'Not Found' } } });
        mockClient.get.mockRejectedValue(axiosErr);

        await expect(jiraResource.getFromOriginPath('rest/api/unknown')).rejects.toThrow('Not found');
    });
});

// =====================================================================
// transitionIssue
// =====================================================================

describe('transitionIssue', () => {
    it('posts transition successfully', async () => {
        mockClient.post.mockResolvedValue({ data: {} });

        await jiraResource.transitionIssue('TASK-1', '31');
        expect(mockClient.post).toHaveBeenCalledWith('/issue/TASK-1/transitions', { transition: { id: '31' } });
    });

    it('re-throws error after logging', async () => {
        mockClient.post.mockRejectedValue(new Error('Transition error'));

        await expect(jiraResource.transitionIssue('TASK-1', '31')).rejects.toThrow('Transition error');
    });

    it('passes correct transition id', async () => {
        mockClient.post.mockResolvedValue({ data: {} });

        await jiraResource.transitionIssue('TASK-1', '999');
        expect(mockClient.post).toHaveBeenCalledWith('/issue/TASK-1/transitions', { transition: { id: '999' } });
    });
});
