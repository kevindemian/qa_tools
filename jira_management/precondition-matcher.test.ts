import { matchPreconditionByTokenOverlap, matchPreconditionByDualThreshold } from './precondition-matcher';

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
