/**
 * Property-Based Tests — Precondition Matcher (OPP-3)
 *
 * Verifies invariants of matchPreconditionByDualThreshold for ALL inputs,
 * derived from the specified matching table (§3.6 of the case18 plan):
 *
 *   - empty query / empty candidates        → create
 *   - exact equality (case-insensitive)     → exact (reference)
 *   - containment (A⊂B or B⊂A)              → containment (reference)
 *   - Jaccard ≥ 0.7                          → overlap (reference)
 *   - Jaccard [0.5,0.7) + unique tokens both sides → create
 *   - Jaccard [0.5,0.7) + one is subset (stopwords) → overlap (reference)
 *   - Jaccard < 0.5                          → create
 *
 * Safety properties (never relax):
 *   - create NEVER returns a real candidate key (key must be '__create__')
 *   - reference (exact/containment/overlap) ALWAYS returns a real candidate key
 *   - the result is deterministic (same input → same output)
 */
import { fc } from '../../shared/deps.js';
import { describe, expect, it } from 'vitest';
import { matchPreconditionByDualThreshold } from '../precondition-matcher.js';
import type { PreConditionSummary } from '../../shared/types.js';

const WORDS = ['user', 'admin', 'must', 'be', 'logged', 'in', 'the', 'system', 'application', 'database', 'seeded'];
const REFERENCE_TYPES = ['exact', 'containment', 'overlap'];

function candidateOf(word: string, key: string): PreConditionSummary {
    return { key, summary: word };
}

describe('PBT: matchPreconditionByDualThreshold', () => {
    it('empty query always returns create with key __create__', () => {
        fc.assert(
            fc.property(fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }), (words) => {
                const candidates = words.map((w, i) => candidateOf(w, 'PC-' + i));
                const result = matchPreconditionByDualThreshold('', candidates);
                expect(result.matchType).toBe('create');
                expect(result.key).toBe('__create__');
            }),
            { numRuns: 100 },
        );
    });

    it('empty candidates always returns create with key __create__', () => {
        fc.assert(
            fc.property(fc.string({ minLength: 1, maxLength: 50 }), (query) => {
                const result = matchPreconditionByDualThreshold(query, []);
                expect(result.matchType).toBe('create');
                expect(result.key).toBe('__create__');
            }),
            { numRuns: 100 },
        );
    });

    it('exact match (case-insensitive) always returns exact with the matching key', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...WORDS),
                fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }),
                (target, others) => {
                    const candidates: PreConditionSummary[] = [
                        candidateOf(target, 'PC-EXACT'),
                        ...others.map((w, i) => candidateOf(w, 'PC-' + i)),
                    ];
                    const result = matchPreconditionByDualThreshold(target.toUpperCase(), candidates);
                    expect(result.matchType).toBe('exact');
                    expect(result.key).toBe('PC-EXACT');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('create NEVER returns a real candidate key — must return __create__', () => {
        fc.assert(
            fc.property(
                fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }),
                fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }),
                (q, c) => {
                    const query = q.join(' ');
                    const candidates = c.map((w, i) => candidateOf(w, 'PC-' + i));
                    const result = matchPreconditionByDualThreshold(query, candidates);
                    if (result.matchType === 'create') {
                        expect(result.key).toBe('__create__');
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    it('reference (exact/containment/overlap) ALWAYS returns a real candidate key', () => {
        fc.assert(
            fc.property(
                fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }),
                fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 10 }),
                (q, c) => {
                    const query = q.join(' ');
                    const candidates = c.map((w, i) => candidateOf(w, 'PC-' + i));
                    const result = matchPreconditionByDualThreshold(query, candidates);
                    if (REFERENCE_TYPES.includes(result.matchType)) {
                        expect(result.key).toMatch(/^PC-/);
                    }
                },
            ),
            { numRuns: 200 },
        );
    });

    it('result is deterministic — same input always yields same output', () => {
        fc.assert(
            fc.property(
                fc.array(fc.constantFrom(...WORDS), { minLength: 0, maxLength: 10 }),
                fc.array(fc.constantFrom(...WORDS), { minLength: 0, maxLength: 10 }),
                (q, c) => {
                    const query = q.join(' ');
                    const candidates = c.map((w, i) => candidateOf(w, 'PC-' + i));
                    const a = matchPreconditionByDualThreshold(query, candidates);
                    const b = matchPreconditionByDualThreshold(query, candidates);
                    expect(a).toEqual(b);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('full word overlap with same token set (reordered) never produces create', () => {
        fc.assert(
            fc.property(fc.array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 6 }), (tokens) => {
                const candidates = [candidateOf(tokens.join(' '), 'PC-TARGET')];
                const shuffled = [...tokens].sort(() => Math.random() - 0.5);
                const result = matchPreconditionByDualThreshold(shuffled.join(' '), candidates);
                expect(REFERENCE_TYPES).toContain(result.matchType);
            }),
            { numRuns: 100 },
        );
    });

    it('subsumption: query that is a word subset of a candidate never creates', () => {
        fc.assert(
            fc.property(fc.array(fc.constantFrom(...WORDS), { minLength: 2, maxLength: 6 }), (tokens) => {
                const full = tokens.join(' ');
                const subset = tokens.slice(1).join(' ');
                const candidates = [candidateOf(full, 'PC-SUPER')];
                const result = matchPreconditionByDualThreshold(subset, candidates);
                expect(REFERENCE_TYPES).toContain(result.matchType);
            }),
            { numRuns: 100 },
        );
    });

    it('disjoint vocabulary always returns create (no shared words at all)', () => {
        fc.assert(
            fc.property(
                fc.array(fc.constantFrom('foo', 'bar', 'baz', 'qux'), { minLength: 1, maxLength: 4 }),
                fc.array(fc.constantFrom('alpha', 'beta', 'gamma'), { minLength: 1, maxLength: 3 }),
                (q, c) => {
                    const query = q.join(' ');
                    const candidates = c.map((w, i) => candidateOf(w, 'PC-' + i));
                    const result = matchPreconditionByDualThreshold(query, candidates);
                    expect(result.matchType).toBe('create');
                },
            ),
            { numRuns: 100 },
        );
    });

    it('single-token query matching a single-token candidate exactly is a reference match', () => {
        fc.assert(
            fc.property(fc.constantFrom(...WORDS), (w) => {
                const candidates = [candidateOf(w, 'PC-W')];
                const result = matchPreconditionByDualThreshold(w, candidates);
                expect(REFERENCE_TYPES).toContain(result.matchType);
            }),
            { numRuns: 100 },
        );
    });
});
