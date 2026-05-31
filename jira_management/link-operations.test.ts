jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    warn: jest.fn(),
}));

import type { JiraResourceLike } from '../shared/types';
import { LinkOperations } from './link-operations';
import { LinkTypeManager } from './link-types';

describe('LinkOperations', () => {
    let mockJiraResource: {
        getJiraResource: jest.Mock;
        postJiraResource: jest.Mock;
        putJiraResource: jest.Mock;
        searchJiraIssues: jest.Mock;
    };
    let linkTypeManager: LinkTypeManager;
    let operations: LinkOperations;

    beforeEach(() => {
        jest.clearAllMocks();
        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
            searchJiraIssues: jest.fn(),
        };
        linkTypeManager = new LinkTypeManager(mockJiraResource as unknown as JiraResourceLike);
        operations = new LinkOperations(mockJiraResource as unknown as JiraResourceLike, linkTypeManager);
    });

    describe('linkIssues', () => {
        it('creates links for each linked issue', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                issueLinkTypes: [{ id: '10200', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
            });
            mockJiraResource.postJiraResource.mockResolvedValue({});
            const linked = [
                { key: 'TEST-2', linkType: 'Tests' },
                { key: 'TEST-3', linkType: 'Tests' },
            ];
            await operations.linkIssues('TEST-1', linked);
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledTimes(2);
            expect(mockJiraResource.postJiraResource).toHaveBeenNthCalledWith(1, 'issueLink', {
                type: { id: '10200' },
                inwardIssue: { key: 'TEST-1' },
                outwardIssue: { key: 'TEST-2' },
            });
            expect(mockJiraResource.postJiraResource).toHaveBeenNthCalledWith(2, 'issueLink', {
                type: { id: '10200' },
                inwardIssue: { key: 'TEST-1' },
                outwardIssue: { key: 'TEST-3' },
            });
        });

        it('handles empty linked issues list', async () => {
            await operations.linkIssues('TEST-1', []);
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });
    });

    describe('createIssueLink', () => {
        it('creates a single issue link with resolved type', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                issueLinkTypes: [{ id: '10200', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
            });
            mockJiraResource.postJiraResource.mockResolvedValue({ id: 'new-link' });
            const result = await operations.createIssueLink('TEST-1', 'TEST-2', 'Tests');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issueLink', {
                type: { id: '10200' },
                inwardIssue: { key: 'TEST-2' },
                outwardIssue: { key: 'TEST-1' },
            });
            expect(result).toEqual({ id: 'new-link' });
        });
    });
});
