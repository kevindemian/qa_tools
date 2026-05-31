jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('fs');

import fs from 'fs';
import path from 'path';

import type { JiraResourceLike } from '../shared/types';
import JiraLinkManager, {
    matchPreconditionByTokenOverlap,
    matchPreconditionByDualThreshold,
} from './jira_link_manager';
import { rootLogger } from '../shared/logger';
import { tempDirPath } from '../shared/temp-dir';

const CACHE_PATH = path.join(tempDirPath(), 'cache', 'link-types-cache.json');

describe('JiraLinkManager', () => {
    let manager: InstanceType<typeof JiraLinkManager>;
    let mockJiraResource: {
        getJiraResource: jest.Mock;
        postJiraResource: jest.Mock;
        putJiraResource: jest.Mock;
        searchJiraIssues: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
            searchJiraIssues: jest.fn(),
        };
        manager = new JiraLinkManager(mockJiraResource as unknown as JiraResourceLike);
    });

    describe('constructor', () => {
        it('stores jiraResource and sets defaults', () => {
            expect(manager.jiraResource).toBe(mockJiraResource);
            expect(manager.linkTypesCache).toBeNull();
            expect(manager.cacheFilePath).toBe(CACHE_PATH);
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
            expect(fs.writeFileSync).toHaveBeenCalledWith(CACHE_PATH, JSON.stringify(fakeTypes), 'utf8');
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
            expect(result[0]!.name).toBe('Relates');
        });

        it('logs warning when cache write throws', async () => {
            const fakeTypes = [{ id: '10200', name: 'Tested by' }];
            mockJiraResource.getJiraResource.mockResolvedValue({ issueLinkTypes: fakeTypes });
            jest.mocked(fs.writeFileSync).mockImplementation(() => {
                throw new Error('Disk full');
            });

            await manager.getIssueLinkTypes();
            expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever cache'));
        });

        it('logs warning when cache read has invalid JSON', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API down'));
            jest.mocked(fs.existsSync).mockReturnValue(true);
            jest.mocked(fs.readFileSync).mockReturnValue('invalid json');

            const result = await manager.getIssueLinkTypes();
            expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Falha ao ler cache'));
            expect(result).toHaveLength(3);
            expect(result[0]!.name).toBe('Relates');
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

    describe('_resolvePreconditionIssueTypeId', () => {
        it('returns the issue type id for Pre-condition', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([
                { id: '11801', name: 'Pre-condition' },
                { id: '11802', name: 'Test Execution' },
            ]);
            const result = await manager._resolvePreconditionIssueTypeId();
            expect(result).toBe('11801');
        });

        it('caches the result on second call', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            await manager._resolvePreconditionIssueTypeId();
            await manager._resolvePreconditionIssueTypeId();
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('throws when no Pre-condition issue type exists', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '100', name: 'Bug' }]);
            await expect(manager._resolvePreconditionIssueTypeId()).rejects.toThrow(
                'Issue type "Pre-condition" não encontrado no Jira',
            );
        });
    });

    describe('listPreconditions', () => {
        it('returns mapped preconditions from JQL search', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'PREC-1', fields: { summary: 'User must be logged in' } },
                    { key: 'PREC-2', fields: { summary: 'Database must be seeded' } },
                ],
                total: 2,
                startAt: 0,
                maxResults: 200,
            });
            const result = await manager.listPreconditions('ECSPOL');
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ key: 'PREC-1', summary: 'User must be logged in' });
            expect(result[1]).toEqual({ key: 'PREC-2', summary: 'Database must be seeded' });
        });

        it('returns empty array when no preconditions found', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 200 });
            const result = await manager.listPreconditions('EMPTY');
            expect(result).toEqual([]);
        });
    });

    describe('createPrecondition', () => {
        it('creates a new precondition and returns its key', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'ECSPOL-NEW-1' });
            const key = await manager.createPrecondition('ECSPOL', 'User must be admin');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: 'ECSPOL' },
                    summary: 'User must be admin',
                    issuetype: { id: '11801' },
                },
            });
            expect(key).toBe('ECSPOL-NEW-1');
        });
    });

    describe('listTestExecutions', () => {
        it('returns mapped test execution summaries', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    {
                        key: 'TE-1',
                        fields: { summary: 'Execution 1', status: { name: 'Done' }, created: '2026-01-01' },
                    },
                    {
                        key: 'TE-2',
                        fields: { summary: 'Execution 2', status: { name: 'In Progress' }, created: '2026-02-01' },
                    },
                ],
                total: 2,
                startAt: 0,
                maxResults: 20,
            });
            const result = await manager.listTestExecutions('PROJ', 20);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                key: 'TE-1',
                summary: 'Execution 1',
                status: 'Done',
                created: '2026-01-01',
            });
            expect(result[1]).toEqual({
                key: 'TE-2',
                summary: 'Execution 2',
                status: 'In Progress',
                created: '2026-02-01',
            });
        });
    });

    describe('validateTestExecutionKey', () => {
        it('passes when issue is a Test Execution', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                fields: { issuetype: { name: 'Test Execution' } },
            });
            await expect(manager.validateTestExecutionKey('TE-1')).resolves.toBe(true);
        });

        it('returns false when issue is not found', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({ fields: {} });
            await expect(manager.validateTestExecutionKey('MISSING')).resolves.toBe(false);
        });

        it('returns false when issue type is not Test Execution', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                fields: { issuetype: { name: 'Bug' } },
            });
            await expect(manager.validateTestExecutionKey('BUG-1')).resolves.toBe(false);
        });
    });

    describe('getTestCaseSummaries', () => {
        it('returns (key not found) for keys that fail to fetch', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ key: 'TEST-1', fields: { summary: 'Works' } })
                .mockRejectedValueOnce(new Error('Not found'));
            const result = await manager.getTestCaseSummaries(['TEST-1', 'TEST-2']);
            expect(result).toEqual([
                { key: 'TEST-1', summary: 'Works' },
                { key: 'TEST-2', summary: '(key not found)' },
            ]);
        });

        it('returns empty array for empty input', async () => {
            const result = await manager.getTestCaseSummaries([]);
            expect(result).toEqual([]);
        });
    });
});

describe('matchPreconditionByTokenOverlap', () => {
    const candidates = [
        { key: 'PREC-1', summary: 'User must be logged in' },
        { key: 'PREC-2', summary: 'Database must be seeded' },
        { key: 'PREC-3', summary: 'Admin role required' },
    ];

    it('returns exact match when summary is identical', () => {
        const result = matchPreconditionByTokenOverlap('User must be logged in', candidates);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('exact');
    });

    it('is case insensitive for exact match', () => {
        const result = matchPreconditionByTokenOverlap('USER MUST BE LOGGED IN', candidates);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('exact');
    });

    it('returns overlap match when query tokens are subset of summary', () => {
        const result = matchPreconditionByTokenOverlap('Database seeded', candidates);
        expect(result.key).toBe('PREC-2');
        expect(result.matchType).toBe('overlap');
    });

    it('returns containment match when query is contiguous substring of summary', () => {
        const result = matchPreconditionByTokenOverlap('must be seeded', candidates);
        expect(result.key).toBe('PREC-2');
        expect(result.matchType).toBe('containment');
    });

    it('returns containment match when summary is substring of query', () => {
        const result = matchPreconditionByTokenOverlap('Must ensure Database must be seeded correctly', candidates);
        expect(result.key).toBe('PREC-2');
        expect(result.matchType).toBe('containment');
    });

    it('returns overlap match via Jaccard token similarity', () => {
        const result = matchPreconditionByTokenOverlap('User must be logged out', candidates);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('overlap');
    });

    it('respects custom threshold for overlap match', () => {
        const result = matchPreconditionByTokenOverlap('must log the user in', candidates, 0.25);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('overlap');
    });

    it('fails overlap match with strict threshold', () => {
        const result = matchPreconditionByTokenOverlap('must log the user in', candidates, 0.8);
        expect(result.matchType).toBe('create');
    });

    it('returns create when no candidate scores above threshold', () => {
        const result = matchPreconditionByTokenOverlap('Network connectivity must be available', candidates);
        expect(result.key).toBe('__create__');
        expect(result.matchType).toBe('create');
    });

    it('returns create for empty query', () => {
        const result = matchPreconditionByTokenOverlap('', candidates);
        expect(result.matchType).toBe('create');
    });

    it('returns create for empty candidates list', () => {
        const result = matchPreconditionByTokenOverlap('Anything', []);
        expect(result.matchType).toBe('create');
    });

    it('returns create for single-word no-match query', () => {
        const result = matchPreconditionByTokenOverlap('Network', candidates);
        expect(result.key).toBe('__create__');
        expect(result.matchType).toBe('create');
    });
});

describe('matchPreconditionByDualThreshold', () => {
    const candidates = [
        { key: 'PREC-1', summary: 'User must be logged in' },
        { key: 'PREC-2', summary: 'Admin role required' },
        { key: 'PREC-3', summary: 'Database must be seeded with test data' },
    ];

    it('returns exact match (same safety as single threshold)', () => {
        const result = matchPreconditionByDualThreshold('User must be logged in', candidates);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('exact');
    });

    it('returns containment match (substring, safe)', () => {
        const result = matchPreconditionByDualThreshold('must be seeded', candidates);
        expect(result.key).toBe('PREC-3');
        expect(result.matchType).toBe('containment');
    });

    it('rejects false positive: User vs Admin in Jaccard 0.5-0.69 zone', () => {
        const noExactMatch = [
            { key: 'PREC-2', summary: 'Admin must be logged in' },
            { key: 'PREC-3', summary: 'Database must be seeded with test data' },
        ];
        const result = matchPreconditionByDualThreshold('User must be logged in', noExactMatch);
        expect(result.matchType).toBe('create');
    });

    it('accepts subsumption: query is subset of candidate with extra words', () => {
        const subsetCandidates = [{ key: 'PREC-X', summary: 'User must be logged in to the system' }];
        const result = matchPreconditionByDualThreshold('User must be logged in', subsetCandidates);
        expect(result.key).toBe('PREC-X');
        expect(result.matchType === 'containment' || result.matchType === 'overlap').toBe(true);
    });

    it('accepts subsumption: candidate is subset of query with extra words', () => {
        const supersetCandidates = [{ key: 'PREC-Y', summary: 'User must be logged in' }];
        const result = matchPreconditionByDualThreshold('User must be logged in to the system', supersetCandidates);
        expect(result.key).toBe('PREC-Y');
        expect(result.matchType === 'containment' || result.matchType === 'overlap').toBe(true);
    });

    it('rejects when both sides have unique content words (different meaning)', () => {
        const diffCandidates = [{ key: 'PREC-2', summary: 'Admin must be logged in' }];
        const result = matchPreconditionByDualThreshold('User must be logged in', diffCandidates);
        expect(result.matchType).toBe('create');
    });

    it('rejects when unique content words on both sides even with high overlap', () => {
        const diffCandidates = [{ key: 'PREC-3', summary: 'Guest user must be logged out' }];
        const result = matchPreconditionByDualThreshold('Admin user must be logged in', diffCandidates);
        expect(result.matchType).toBe('create');
    });

    it('accepts high-confidence match (Jaccard ≥ 0.7, no containment)', () => {
        const highCandidates = [{ key: 'PREC-1', summary: 'User must be logged in to the application' }];
        const result = matchPreconditionByDualThreshold('User must be logged in to the system', highCandidates);
        expect(result.key).toBe('PREC-1');
        expect(result.matchType).toBe('overlap');
    });

    it('returns create for empty query', () => {
        const result = matchPreconditionByDualThreshold('', candidates);
        expect(result.matchType).toBe('create');
    });

    it('returns create for empty candidates list', () => {
        const result = matchPreconditionByDualThreshold('Anything', []);
        expect(result.matchType).toBe('create');
    });

    it('returns create for completely unrelated query', () => {
        const result = matchPreconditionByDualThreshold('Network connectivity must be available', candidates);
        expect(result.matchType).toBe('create');
    });
});
