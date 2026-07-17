import { describe, it, expect, vi } from 'vitest';

vi.mock('../shared/config-accessor.js', () => ({
    default: {
        getDefault: () => ({
            get: (_key: string) => 'cloud',
        }),
        get: (_key: string) => 'cloud',
    },
}));

import { addTasksToSprint } from './jira-resource-sprint.js';
import type { JiraResourceLike } from './jira-resource-types.js';
import type { Logger } from '../shared/logger.js';

function makeResource(withoutApiRoot = false): JiraResourceLike {
    const log = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    } as unknown as Logger;
    const resource: JiraResourceLike = {
        getJiraResource: vi.fn().mockResolvedValue({}),
        postJiraResource: vi.fn().mockResolvedValue({}),
        putJiraResource: vi.fn().mockResolvedValue(null),
        baseUrl: 'http://localhost:1999/jira/rest/api/2',
        log,
        getProjectId: vi.fn().mockResolvedValue(''),
        getProjectVersions: vi.fn().mockResolvedValue([]),
        getVersionId: vi.fn().mockResolvedValue(null),
        searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
        getTransitionsForIssue: vi.fn().mockResolvedValue({}),
        transitionIssue: vi.fn().mockResolvedValue(undefined),
        checkReleaseTasksStatus: vi.fn().mockResolvedValue(false),
    };
    if (!withoutApiRoot) {
        resource.postToApiRoot = vi.fn().mockResolvedValue(null);
    }
    return resource;
}

describe('AddTasksToSprint (cloud mode)', () => {
    it('posts to the Cloud agile API endpoint', async () => {
        expect.hasAssertions();

        const resource = makeResource();
        await addTasksToSprint(resource, ['T-1', 'T-2'], '42');
        const mock = resource.postToApiRoot as ReturnType<typeof vi.fn>;

        expect(mock).toHaveBeenCalledWith('rest/agile/1.0/sprint/42/issue', {
            issues: ['T-1', 'T-2'],
        });
        expect(resource.postJiraResource).not.toHaveBeenCalled();
    });

    it('throws a clear error when postToApiRoot is unsupported (edge case)', async () => {
        expect.hasAssertions();

        const resource = makeResource(true);

        await expect(addTasksToSprint(resource, ['T-1'], '42')).rejects.toThrow(/postToApiRoot/);
    });
});
