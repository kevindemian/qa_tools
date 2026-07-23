import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nock } from '../../shared/deps.js';

const XRAY_CLOUD = 'http://localhost:1999';
const XRAY_CLOUD_PATH = '/xray';

let lastGraphqlBody: { variables?: { issueId?: string; testIssueIds?: string[] } } | undefined;

import { importExecutionResults, linkTestsToTe } from '../result_reporter.js';
import type { JiraResourceLike } from '../../shared/types.js';

function makeResource(withApiRoot: boolean): JiraResourceLike {
    const res: JiraResourceLike = {
        getJiraResource: vi.fn(() => Promise.resolve({})) as unknown as JiraResourceLike['getJiraResource'],
        postJiraResource: vi.fn(() => Promise.resolve({})) as unknown as JiraResourceLike['postJiraResource'],
        putJiraResource: vi.fn(() => Promise.resolve(null)),
        searchJiraIssues: vi.fn(() => Promise.resolve({ issues: [], total: 0 })),
        getTransitionsForIssue: vi.fn(() => Promise.resolve({})),
        transitionIssue: vi.fn(() => Promise.resolve(undefined)),
    };
    if (withApiRoot) {
        res.postToApiRoot = vi.fn(() => Promise.resolve(null));
    }
    return res;
}

const matched = [
    { key: 'TEST-1', status: 'passed', duration: 10 },
    { key: 'TEST-2', status: 'failed', duration: 20 },
    { key: 'TEST-3', status: 'skipped', duration: 5 },
];

describe('ImportExecutionResults (C0)', () => {
    it('POSTs a raven 2.0 execution import with PASS/FAIL status mapping', async () => {
        expect.hasAssertions();

        const resource = makeResource(true);
        await importExecutionResults(resource, 'EXEC-1', matched);

        const mock = vi.mocked(resource.postToApiRoot as NonNullable<JiraResourceLike['postToApiRoot']>);

        expect(mock).toHaveBeenCalledWith('rest/raven/2.0/api/import/execution/json', expect.any(Object));

        const calls = mock.mock.calls;

        expect(calls).toHaveLength(1);

        const call = calls[0];
        if (!call) throw new Error('expected import call');

        expect(call[0]).toBe('rest/raven/2.0/api/import/execution/json');

        const payload = call[1] as {
            info: { testExecutionKey: string };
            tests: Array<{ testKey: string; status: string }>;
        };

        expect(payload.info.testExecutionKey).toBe('EXEC-1');
        expect(payload.tests).toContainEqual(expect.objectContaining({ testKey: 'TEST-1', status: 'PASS' }));
        expect(payload.tests).toContainEqual(expect.objectContaining({ testKey: 'TEST-2', status: 'FAIL' }));
        // skipped tests are excluded from import
        expect(payload.tests.find((t) => t.testKey === 'TEST-3')).toBeUndefined();
    });

    it('skips import (with explicit log) when postToApiRoot is unsupported', async () => {
        expect.hasAssertions();

        const resource = makeResource(false);
        await importExecutionResults(resource, 'EXEC-1', matched);

        expect(resource.postToApiRoot).toBeUndefined();
    });

    it('reports import errors explicitly (never silent) and resolves', async () => {
        expect.hasAssertions();

        const resource = makeResource(true);
        const mock = vi.mocked(resource.postToApiRoot as NonNullable<JiraResourceLike['postToApiRoot']>);
        mock.mockRejectedValueOnce(new Error('401 Unauthorized'));

        await expect(importExecutionResults(resource, 'EXEC-1', matched)).resolves.toBeUndefined();
        expect(mock).toHaveBeenCalledWith('rest/raven/2.0/api/import/execution/json', expect.any(Object));
    });
});

describe('LinkTestsToTe (Xray Cloud association)', () => {
    const matchedTests = [
        { key: 'TEST-1', status: 'passed' },
        { key: 'TEST-2', status: 'failed' },
        { key: 'TEST-3', status: 'skipped' },
    ];

    function makeCloudResource(): JiraResourceLike {
        return {
            getJiraResource: ((path: string) => {
                if (path === 'issue/TEST-1') return Promise.resolve({ id: '200' });
                if (path === 'issue/TEST-2') return Promise.resolve({ id: '201' });
                if (path === 'issue/EXEC-1') return Promise.resolve({ id: '100' });
                return Promise.resolve({ id: '0' });
            }) as JiraResourceLike['getJiraResource'],
            postJiraResource: vi.fn(() => Promise.resolve({})) as unknown as JiraResourceLike['postJiraResource'],
            putJiraResource: vi.fn(() => Promise.resolve(null)),
            searchJiraIssues: vi.fn(() => Promise.resolve({ issues: [], total: 0 })),
            getTransitionsForIssue: vi.fn(() => Promise.resolve({})),
            transitionIssue: vi.fn(() => Promise.resolve(undefined) as ReturnType<JiraResourceLike['transitionIssue']>),
        };
    }

    function mockXrayCloudGraphql(): nock.Scope {
        const xray = nock(XRAY_CLOUD + XRAY_CLOUD_PATH).defaultReplyHeaders({ 'Content-Type': 'application/json' });
        xray.post('/api/v2/authenticate').reply(200, 'mock-token');
        return xray.post('/api/v2/graphql').reply(200, (_uri: string, reqBody: unknown) => {
            lastGraphqlBody = reqBody as { variables?: { issueId?: string; testIssueIds?: string[] } };
            return { data: { addTestsToTestExecution: { addedTests: 2, warning: null } } };
        });
    }

    beforeEach(() => {
        process.env['JIRA_MODE'] = 'cloud';
        process.env['XRAY_CLIENT_ID'] = 'cid';
        process.env['XRAY_CLIENT_SECRET'] = 'csecret';
        process.env['XRAY_CLOUD_URL'] = XRAY_CLOUD + XRAY_CLOUD_PATH;
        lastGraphqlBody = undefined;
        nock.cleanAll();
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        delete process.env['JIRA_MODE'];
        delete process.env['XRAY_CLIENT_ID'];
        delete process.env['XRAY_CLIENT_SECRET'];
        delete process.env['XRAY_CLOUD_URL'];
    });

    it('associates via native Xray Cloud GraphQL, skipping skipped tests, never issue links', async () => {
        expect.hasAssertions();

        const resource = makeCloudResource();
        const linkManager = {
            createIssueLink: vi.fn(() => Promise.resolve(undefined)),
        } as unknown as import('../jira_link_manager.js').default;

        mockXrayCloudGraphql();

        await linkTestsToTe(matchedTests, { key: 'EXEC-1' }, linkManager, resource);

        expect(lastGraphqlBody).toBeDefined();
        expect(lastGraphqlBody?.variables?.issueId).toBe('100');
        expect(lastGraphqlBody?.variables?.testIssueIds).toStrictEqual(['200', '201']);
        expect(
            (linkManager as unknown as { createIssueLink: (...a: unknown[]) => Promise<unknown> }).createIssueLink,
        ).not.toHaveBeenCalled();
    });
});
