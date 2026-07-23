import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { nock } from '../../shared/deps.js';

const XRAY_CLOUD = 'http://localhost:1999';
const XRAY_CLOUD_PATH = '/xray';

let lastGraphqlBody: { variables?: { issueId?: string; testIssueIds?: string[] } } | undefined;

describe('TestExecutionCreator (cloud mode)', () => {
    let resource: JiraResourceLike;
    let linkManager: JiraLinkManager;
    let rawResource: MockResource;
    let rawLinkManager: MockLinkManager;
    let creator: TestExecutionCreator;

    beforeEach(() => {
        process.env['JIRA_MODE'] = 'cloud';
        process.env['XRAY_CLIENT_ID'] = 'cid';
        process.env['XRAY_CLIENT_SECRET'] = 'csecret';
        process.env['XRAY_CLOUD_URL'] = XRAY_CLOUD + XRAY_CLOUD_PATH;
        lastGraphqlBody = undefined;
        nock.cleanAll();
        nock.disableNetConnect();
        const res = makeResource();
        const lm = makeLinkManager();
        resource = res.resource;
        linkManager = lm.linkManager;
        rawResource = res.raw;
        rawLinkManager = lm.raw;
        creator = new TestExecutionCreator(resource, linkManager);
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        delete process.env['JIRA_MODE'];
        delete process.env['XRAY_CLIENT_ID'];
        delete process.env['XRAY_CLIENT_SECRET'];
        delete process.env['XRAY_CLOUD_URL'];
    });

    function mockXrayCloudGraphql(): nock.Scope {
        const xray = nock(XRAY_CLOUD + XRAY_CLOUD_PATH).defaultReplyHeaders({ 'Content-Type': 'application/json' });
        xray.post('/api/v2/authenticate').reply(200, 'mock-token');
        return xray.post('/api/v2/graphql').reply(200, (_uri: string, reqBody: unknown) => {
            lastGraphqlBody = reqBody as { variables?: { issueId?: string; testIssueIds?: string[] } };
            return { data: { addTestsToTestExecution: { addedTests: 2, warning: null } } };
        });
    }

    it('associates tests via native Xray Cloud GraphQL (addTestsToTestExecution), NOT issue links', async () => {
        expect.hasAssertions();

        rawResource.getJiraResource.mockImplementation((path: string) => {
            if (path === 'issuetype') return Promise.resolve([{ id: '5', name: 'Test Execution' }]);
            if (path === 'field') return Promise.resolve([]); // cloud skips, but provide fallback
            if (path === 'issue/EXEC-1') return Promise.resolve({ id: '100', fields: { issuelinks: [] } });
            if (path === 'issue/TEST-1') return Promise.resolve({ id: '200' });
            if (path === 'issue/TEST-2') return Promise.resolve({ id: '201' });
            return Promise.resolve({});
        });

        mockXrayCloudGraphql();

        await creator.createWithLinks('PROJ', ['TEST-1', 'TEST-2'], 'csv', { title: 'T' });

        // Native Cloud association must be used (real XrayCloudClient hit the mocked external API).
        expect(lastGraphqlBody).toBeDefined();
        expect(lastGraphqlBody?.variables?.issueId).toBe('100');
        expect(lastGraphqlBody?.variables?.testIssueIds).toStrictEqual(['200', '201']);

        // Plain Jira "Tests" issue link must NOT be used in Cloud mode
        expect(rawLinkManager.createIssueLink).not.toHaveBeenCalledWith('TEST-1', 'EXEC-1', 'Tests');
        expect(rawLinkManager.createIssueLink).not.toHaveBeenCalledWith('TEST-2', 'EXEC-1', 'Tests');
    });

    it('addTestsToExistingExecution associates via native Cloud GraphQL when no Server custom field', async () => {
        expect.hasAssertions();

        rawResource.getJiraResource.mockImplementation((path: string) => {
            if (path === 'field') return Promise.resolve([]); // no Xray Server custom field
            if (path === 'issue/EXEC-1') {
                return Promise.resolve({
                    key: 'EXEC-1',
                    fields: { summary: 's', issuetype: { name: 'Test Execution' }, issuelinks: [] },
                    id: '100',
                });
            }
            if (path === 'issue/TEST-1') return Promise.resolve({ id: '200' });
            return Promise.resolve({});
        });

        mockXrayCloudGraphql();

        await creator.addTestsToExistingExecution('EXEC-1', ['TEST-1']);

        expect(rawResource.putJiraResource).not.toHaveBeenCalled();
        expect(lastGraphqlBody).toBeDefined();
        expect(lastGraphqlBody?.variables?.issueId).toBe('100');
        expect(lastGraphqlBody?.variables?.testIssueIds).toStrictEqual(['200']);
        expect(rawLinkManager.createIssueLink).not.toHaveBeenCalledWith('TEST-1', 'EXEC-1', 'Tests');
    });
});

type MockResource = {
    getJiraResource: Mock;
    postJiraResource: Mock;
    putJiraResource: Mock;
    deleteJiraResource: Mock;
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
        deleteJiraResource: vi.fn(),
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

import { TestExecutionCreator } from '../test-execution-creator.js';
import type { JiraResourceLike } from '../../shared/types.js';
import type JiraLinkManager from '../jira_link_manager.js';
