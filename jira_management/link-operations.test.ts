vi.mock('../shared/prompt', () => ({
    info: vi.fn(),
    warn: vi.fn(),
}));

import { LinkOperations } from './link-operations.js';
import type { Mock } from 'vitest';
import { LinkTypeManager } from './link-types.js';

describe('LinkOperations', () => {
    let mockJiraResource: {
        getJiraResource: Mock;
        postJiraResource: Mock;
        putJiraResource: Mock;
        searchJiraIssues: Mock;
        getTransitionsForIssue: Mock;
        transitionIssue: Mock;
    };
    let linkTypeManager: LinkTypeManager;
    let operations: LinkOperations;

    beforeEach(() => {
        vi.clearAllMocks();
        mockJiraResource = {
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            searchJiraIssues: vi.fn(),
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
        };
        linkTypeManager = new LinkTypeManager(mockJiraResource);
        operations = new LinkOperations(mockJiraResource, linkTypeManager);
    });

    describe('LinkIssues', () => {
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

    describe('CreateIssueLink', () => {
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
