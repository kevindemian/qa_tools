import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../shared/config', () => ({
    default: {
        getDefault: () => ({
            get: (key: string) => (key === 'jiraMode' ? process.env['JIRA_MODE_TEST'] : undefined),
        }),
        get: (key: string) => (key === 'jiraMode' ? process.env['JIRA_MODE_TEST'] : undefined),
    },
}));

import { createPreconditionHandler, CloudPreconditionHandler } from './precondition-handler-factory.js';
import { PreconditionHandler } from './precondition-handler.js';
import type { JiraResourceLike } from '../shared/types.js';
import type JiraLinkManager from './jira_link_manager.js';

type MockResource = {
    getJiraResource: Mock;
    postJiraResource: Mock;
    putJiraResource: Mock;
    searchJiraIssues: Mock;
    getTransitionsForIssue: Mock;
    transitionIssue: Mock;
};

type MockLinkManager = { createIssueLink: Mock };

function makeResource(): { raw: MockResource; resource: JiraResourceLike } {
    const raw: MockResource = {
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn(),
        putJiraResource: vi.fn(),
        searchJiraIssues: vi.fn().mockResolvedValue({ issues: [] }),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
    };
    return { raw, resource: raw };
}

function makeLinkManager(): { raw: MockLinkManager; linkManager: JiraLinkManager } {
    const raw: MockLinkManager = { createIssueLink: vi.fn().mockResolvedValue(undefined) };
    return { raw, linkManager: raw as unknown as JiraLinkManager };
}

describe('CreatePreconditionHandler', () => {
    it('returns a CloudPreconditionHandler in cloud mode', () => {
        process.env['JIRA_MODE_TEST'] = 'cloud';
        const res = makeResource();
        const lm = makeLinkManager();
        const handler = createPreconditionHandler(res.resource, lm.linkManager);

        expect(handler).toBeInstanceOf(CloudPreconditionHandler);
    });

    it('returns a base PreconditionHandler in server mode', () => {
        process.env['JIRA_MODE_TEST'] = 'server';
        const res = makeResource();
        const handler = createPreconditionHandler(res.resource);

        expect(handler).toBeInstanceOf(PreconditionHandler);
        expect(handler).not.toBeInstanceOf(CloudPreconditionHandler);
    });
});

describe('CloudPreconditionHandler', () => {
    let rawResource: MockResource;
    let rawLinkManager: MockLinkManager;
    let linkManager: JiraLinkManager;

    beforeEach(() => {
        process.env['JIRA_MODE_TEST'] = 'cloud';
        const res = makeResource();
        const lm = makeLinkManager();
        rawResource = res.raw;
        rawLinkManager = lm.raw;
        linkManager = lm.linkManager;
    });

    it('associates via the "Pre-Condition" issue link (not the Server custom field)', async () => {
        expect.hasAssertions();

        const handler = new CloudPreconditionHandler(rawResource, linkManager);
        await handler.associatePrecondition('TEST-1', 'PREC-1');

        expect(vi.mocked(rawLinkManager.createIssueLink)).toHaveBeenCalledWith('TEST-1', 'PREC-1', 'Pre-Condition');
        expect(vi.mocked(rawResource.getJiraResource)).not.toHaveBeenCalled();
        expect(vi.mocked(rawResource.putJiraResource)).not.toHaveBeenCalled();
    });

    it('throws when no link manager is available (edge case)', async () => {
        expect.hasAssertions();

        const handler = new CloudPreconditionHandler(rawResource);

        await expect(handler.associatePrecondition('TEST-1', 'PREC-1')).rejects.toThrow(/JiraLinkManager/);
    });

    it('_getPreconditionFieldId throws (no Server custom field on Cloud)', async () => {
        expect.hasAssertions();

        const handler = new CloudPreconditionHandler(rawResource, linkManager);

        await expect(handler._getPreconditionFieldId()).rejects.toThrow(/Cloud/);
    });
});
