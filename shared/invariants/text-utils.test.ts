import { tokenize, jaccardSimilarity, normalizeText, similarity } from './text-utils.js';

describe('Tokenize', () => {
    it('splits text into tokens', () => {
        const tokens = tokenize('Enter age 18 and submit form');

        expect(tokens).toContain('enter');
        expect(tokens).toContain('age');
        expect(tokens).not.toContain('and');
        expect(tokens).not.toContain('the');
    });

    it('removes stop words', () => {
        const tokens = tokenize('the quick brown fox jumps over the lazy dog');

        expect(tokens).not.toContain('the');
        expect(tokens).toContain('quick');
    });

    it('handles Portuguese stop words', () => {
        const tokens = tokenize('preencher formulario com dados do usuario');

        expect(tokens).not.toContain('com');
        expect(tokens).not.toContain('do');
    });

    it('returns empty array for stop-words-only input', () => {
        const tokens = tokenize('the and of');

        expect(tokens).toStrictEqual([]);
    });
});

describe('JaccardSimilarity', () => {
    it('returns 1 for identical sets', () => {
        expect(jaccardSimilarity(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1);
    });

    it('returns 0 for disjoint sets', () => {
        expect(jaccardSimilarity(new Set(['a']), new Set(['b']))).toBe(0);
    });

    it('returns 1 for empty sets', () => {
        expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
    });

    it('calculates partial overlap', () => {
        const sim = jaccardSimilarity(new Set(['a', 'b', 'c']), new Set(['a', 'b', 'd']));

        expect(sim).toBeCloseTo(0.5, 1);
    });
});

describe('NormalizeText', () => {
    it('lowercases and strips non-alphanumeric', () => {
        expect(normalizeText('Hello World!')).toBe('hello world');
    });

    it('trims whitespace', () => {
        expect(normalizeText('  spaced  ')).toBe('spaced');
    });
});

describe('Similarity', () => {
    it('returns 1 for identical strings', () => {
        expect(similarity('hello', 'hello')).toBe(1);
    });

    it('returns 0 for completely different strings', () => {
        expect(similarity('abc', 'xyz')).toBe(0);
    });

    it('returns 1 when both strings empty', () => {
        expect(similarity('', '')).toBe(1);
    });

    it('computes similarity for similar strings', () => {
        const sim = similarity('hello world', 'hello there');

        expect(sim).toBeGreaterThan(0.3);
        expect(sim).toBeLessThan(0.9);
    });
});
