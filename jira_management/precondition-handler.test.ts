jest.mock('../shared/prompt', () => ({
    info: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
    PreconditionHandler,
    matchPreconditionByTokenOverlap,
    matchPreconditionByDualThreshold,
} from './precondition-handler';

describe('PreconditionHandler', () => {
    let mockJiraResource: {
        getJiraResource: jest.Mock;
        postJiraResource: jest.Mock;
        putJiraResource: jest.Mock;
        searchJiraIssues: jest.Mock;
        getTransitionsForIssue: jest.Mock;
        transitionIssue: jest.Mock;
    };
    let handler: PreconditionHandler;

    beforeEach(() => {
        jest.clearAllMocks();
        mockJiraResource = {
            getJiraResource: jest.fn(),
            postJiraResource: jest.fn(),
            putJiraResource: jest.fn(),
            searchJiraIssues: jest.fn(),
            getTransitionsForIssue: jest.fn(),
            transitionIssue: jest.fn(),
        };
        handler = new PreconditionHandler(mockJiraResource);
    });

    describe('_getPreconditionFieldId', () => {
        it('returns cached value on second call', async () => {
            const fields = [
                { id: 'custom_123', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue(fields);
            const first = await handler._getPreconditionFieldId();
            const second = await handler._getPreconditionFieldId();
            expect(first).toBe('custom_123');
            expect(second).toBe('custom_123');
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('falls back to customfield_13708 when API fails', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API error'));
            const result = await handler._getPreconditionFieldId();
            expect(result).toBe('customfield_13708');
        });

        it('falls back to customfield_13708 when no matching field', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: 'other', schema: { custom: 'other' } }]);
            const result = await handler._getPreconditionFieldId();
            expect(result).toBe('customfield_13708');
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
            await handler.associatePrecondition('TEST-1', 'PRE-2');
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
            await handler.associatePrecondition('TEST-1', 'PRE-2');
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
            const result = await handler._resolvePreconditionIssueTypeId();
            expect(result).toBe('11801');
        });

        it('caches the result on second call', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            await handler._resolvePreconditionIssueTypeId();
            await handler._resolvePreconditionIssueTypeId();
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('throws when no Pre-condition issue type exists', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '100', name: 'Bug' }]);
            await expect(handler._resolvePreconditionIssueTypeId()).rejects.toThrow(
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
            const result = await handler.listPreconditions('ECSPOL');
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ key: 'PREC-1', summary: 'User must be logged in' });
            expect(result[1]).toEqual({ key: 'PREC-2', summary: 'Database must be seeded' });
        });

        it('returns empty array when no preconditions found', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 200 });
            const result = await handler.listPreconditions('EMPTY');
            expect(result).toEqual([]);
        });
    });

    describe('findExistingPrecondition', () => {
        it('returns key when exact summary match found via JQL', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-1', fields: { summary: 'User must be logged in' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.findExistingPrecondition('ECSPOL', 'User must be logged in');
            expect(key).toBe('PREC-1');
        });

        it('returns null when no JQL match', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            const key = await handler.findExistingPrecondition('ECSPOL', 'Nonexistent');
            expect(key).toBeNull();
        });

        it('returns null when JQL matches but summaries differ case-sensitively', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-1', fields: { summary: 'Different summary' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.findExistingPrecondition('ECSPOL', 'User must be logged in');
            expect(key).toBeNull();
        });

        it('escapes single quotes in summary for JQL safety', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            await handler.findExistingPrecondition('PROJ', "user's precondition");
            expect(mockJiraResource.searchJiraIssues).toHaveBeenCalledWith(
                expect.stringContaining("user\\\\'s"),
                expect.any(Number),
            );
        });
    });

    describe('createPrecondition', () => {
        it('creates a new precondition and returns its key', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'ECSPOL-NEW-1' });
            const key = await handler.createPrecondition('ECSPOL', 'User must be admin');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: 'ECSPOL' },
                    summary: 'User must be admin',
                    issuetype: { id: '11801' },
                },
            });
            expect(key).toBe('ECSPOL-NEW-1');
        });

        it('reuses existing precondition when found', async () => {
            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-EXISTING', fields: { summary: 'User must be admin' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.createPrecondition('ECSPOL', 'User must be admin');
            expect(key).toBe('PREC-EXISTING');
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
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

    it('accepts high-confidence match (Jaccard >= 0.7, no containment)', () => {
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
