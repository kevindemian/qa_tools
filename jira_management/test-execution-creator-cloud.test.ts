import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../shared/config', () => ({
    default: {
        getDefault: () => ({
            get: (key: string) => (key === 'jiraMode' ? 'cloud' : undefined),
        }),
        get: (key: string) => (key === 'jiraMode' ? 'cloud' : undefined),
    },
}));

import { TestExecutionCreator } from './test-execution-creator.js';
import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';

type MockResource = {
    getJiraResource: Mock;
    postJiraResource: Mock;
    putJiraResource: Mock;
    searchJiraIssues: Mock;
    getTransitionsForIssue: Mock;
    transitionIssue: Mock;
    postToApiRoot: Mock;
};

type MockLinkManager = { createIssueLink: Mock };

function makeResource(): { raw: MockResource; resource: JiraResourceLike } {
    const raw: MockResource = {
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn().mockResolvedValue({ key: 'EXEC-1' }),
        putJiraResource: vi.fn(),
        searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
        postToApiRoot: vi.fn(),
    };
    return { raw, resource: raw };
}

function makeLinkManager(): { raw: MockLinkManager; linkManager: JiraLinkManager } {
    const raw: MockLinkManager = { createIssueLink: vi.fn().mockResolvedValue(undefined) };
    return { raw, linkManager: raw as unknown as JiraLinkManager };
}

describe('TestExecutionCreator (cloud mode)', () => {
    let resource: JiraResourceLike;
    let linkManager: JiraLinkManager;
    let rawResource: MockResource;
    let rawLinkManager: MockLinkManager;
    let creator: TestExecutionCreator;

    beforeEach(() => {
        const res = makeResource();
        const lm = makeLinkManager();
        resource = res.resource;
        linkManager = lm.linkManager;
        rawResource = res.raw;
        rawLinkManager = lm.raw;
        creator = new TestExecutionCreator(resource, linkManager);
    });

    it('skips the Server Xray custom field and creates TE via issue links only', async () => {
        expect.hasAssertions();

        rawResource.getJiraResource
            .mockResolvedValueOnce([{ id: '5', name: 'Test Execution' }]) // issuetype
            .mockResolvedValueOnce([]); // field lookup (no Xray custom field on Cloud)

        await creator.createWithLinks('PROJ', ['TEST-1', 'TEST-2'], 'csv', { title: 'T' });

        const postCalls = rawResource.postJiraResource.mock.calls;

        expect(postCalls).toHaveLength(1);

        const postCall = postCalls[0];
        if (!postCall) throw new Error('expected create call');
        const payload = postCall[1] as { fields: Record<string, unknown> };

        // No com.xpandit custom field key should be present
        expect(Object.keys(payload.fields).some((k) => k.startsWith('customfield'))).toBeFalsy();
        // Tests are linked via issue links
        expect(vi.mocked(rawLinkManager.createIssueLink)).toHaveBeenCalledWith('TEST-1', 'EXEC-1', 'Tests');
        expect(vi.mocked(rawLinkManager.createIssueLink)).toHaveBeenCalledWith('TEST-2', 'EXEC-1', 'Tests');
    });

    it('addTestsToExistingExecution links without writing the Server custom field', async () => {
        expect.hasAssertions();

        rawResource.getJiraResource
            .mockResolvedValueOnce({
                key: 'EXEC-1',
                fields: { summary: 's', issuetype: { name: 'Test Execution' } },
            }) // issue fetch
            .mockResolvedValueOnce([]); // field lookup

        await creator.addTestsToExistingExecution('EXEC-1', ['TEST-1']);

        expect(vi.mocked(rawResource.putJiraResource)).not.toHaveBeenCalled();
        expect(vi.mocked(rawLinkManager.createIssueLink)).toHaveBeenCalledWith('TEST-1', 'EXEC-1', 'Tests');
    });
});
