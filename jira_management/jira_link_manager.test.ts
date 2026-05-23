jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('fs');

import fs from 'fs';
import os from 'os';

import JiraLinkManager from './jira_link_manager';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jest.mock('fs') makes all fs methods jest.Mock; os.homedir is overridden for test
(os as any).homedir = jest.fn(() => '/fake/home');

describe('JiraLinkManager', () => {
    let manager: InstanceType<typeof JiraLinkManager>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock for JiraResource in tests
    let mockJiraResource: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
        };
        manager = new JiraLinkManager(mockJiraResource);
    });

    describe('constructor', () => {
        it('stores jiraResource and sets defaults', () => {
            expect(manager.jiraResource).toBe(mockJiraResource);
            expect(manager.linkTypesCache).toBeNull();
            expect(manager.cacheFilePath).toBe('/fake/home/.qa_tools_link_types_cache.json');
        });
    });

    describe('getIssueLinkTypes', () => {
        it('returns cached value on second call', async () => {
            const fakeTypes = [{ id: '1', name: 'Test' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            const first = await manager.getIssueLinkTypes();
            const second = await manager.getIssueLinkTypes();
            expect(first).toBe(fakeTypes);
            expect(second).toBe(fakeTypes);
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('fetches from API and caches to disk', async () => {
            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            await manager.getIssueLinkTypes();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                '/fake/home/.qa_tools_link_types_cache.json',
                JSON.stringify(fakeTypes),
                'utf8',
            );
        });

        it('falls back to local cache when API fails', async () => {
            const cachedTypes = [{ id: '99', name: 'Cached' }];
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(true);
            jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cachedTypes));
            const result = await manager.getIssueLinkTypes();
            expect(result).toEqual(cachedTypes);
        });

        it('falls back to hardcoded types when API and cache fail', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(false);
            const result = await manager.getIssueLinkTypes();
            expect(result).toHaveLength(3);
            expect(result[0].name).toBe('Relates');
        });
    });

    describe('resolveLinkTypeId', () => {
        beforeEach(() => {
            const fakeTypes = [
                { id: '100', name: 'Relates', inward: 'relates to', outward: 'relates to' },
                { id: '200', name: 'Tests', inward: 'is tested by', outward: 'tests' },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
        });

        it('matches by name', async () => {
            const id = await manager.resolveLinkTypeId('Tests');
            expect(id).toBe('200');
        });

        it('matches by inward', async () => {
            const id = await manager.resolveLinkTypeId('is tested by');
            expect(id).toBe('200');
        });

        it('matches by outward', async () => {
            const id = await manager.resolveLinkTypeId('tests');
            expect(id).toBe('200');
        });

        it('is case insensitive', async () => {
            const id = await manager.resolveLinkTypeId('tests');
            expect(id).toBe('200');
        });

        it('trims whitespace', async () => {
            const id = await manager.resolveLinkTypeId('  Tests  ');
            expect(id).toBe('200');
        });

        it('falls back to 11701 when no match', async () => {
            const id = await manager.resolveLinkTypeId('nonexistent');
            expect(id).toBe('11701');
        });
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
            await manager.linkIssues('TEST-1', linked);
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
    });

    describe('_getPreconditionFieldId', () => {
        it('returns cached value on second call', async () => {
            const fields = [
                { id: 'custom_123', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue(fields);
            const first = await manager._getPreconditionFieldId();
            const second = await manager._getPreconditionFieldId();
            expect(first).toBe('custom_123');
            expect(second).toBe('custom_123');
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('falls back to customfield_13708 when API fails', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API error'));
            const result = await manager._getPreconditionFieldId();
            expect(result).toBe('customfield_13708');
        });

        it('falls back to customfield_13708 when no matching field', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: 'other', schema: { custom: 'other' } }]);
            const result = await manager._getPreconditionFieldId();
            expect(result).toBe('customfield_13708');
        });
    });

    describe('createIssueLink', () => {
        it('creates a single issue link with resolved type', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                issueLinkTypes: [{ id: '10200', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
            });
            mockJiraResource.postJiraResource.mockResolvedValue({ id: 'new-link' });
            const result = await manager.createIssueLink('TEST-1', 'TEST-2', 'Tests');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issueLink', {
                type: { id: '10200' },
                inwardIssue: { key: 'TEST-2' },
                outwardIssue: { key: 'TEST-1' },
            });
            expect(result).toEqual({ id: 'new-link' });
        });
    });

    describe('associatePrecondition', () => {
        it('adds precondition to test issue fields', async () => {
            const fields = [
                { id: 'custom_99', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(fields)
                .mockResolvedValueOnce({ key: 'TEST-1', fields: { custom_99: ['PRE-1'] } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            await manager.associatePrecondition('TEST-1', 'PRE-2');
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
                fields: { custom_99: ['PRE-1', 'PRE-2'] },
            });
        });

        it('does not duplicate existing precondition', async () => {
            const fields = [
                { id: 'custom_99', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(fields)
                .mockResolvedValueOnce({ key: 'TEST-1', fields: { custom_99: ['PRE-1', 'PRE-2'] } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            await manager.associatePrecondition('TEST-1', 'PRE-2');
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
                fields: { custom_99: ['PRE-1', 'PRE-2'] },
            });
        });
    });
});
