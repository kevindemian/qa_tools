export const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'between',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'each',
    'every',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'because',
    'if',
    'then',
    'else',
    'when',
    'where',
    'why',
    'how',
    'which',
    'who',
    'whom',
    'what',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'o',
    'a',
    'e',
    'em',
    'para',
    'com',
    'por',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'no',
    'na',
    'nos',
    'nas',
    'um',
    'uma',
    'uns',
    'umas',
]);

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    if (union.size === 0) return 1;
    return intersection.size / union.size;
}

export function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
}

export function similarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const edits = levenshtein(longer, shorter);
    return (longer.length - edits) / longer.length;
}

function levenshtein(a: string, b: string): number {
    const cols = a.length + 1;
    const cell = (i: number, j: number) => `${i},${j}`;
    const matrix = new Map<string, number>();
    for (let i = 0; i <= b.length; i++) {
        matrix.set(cell(i, 0), i);
    }
    for (let j = 0; j <= cols; j++) {
        matrix.set(cell(0, j), j);
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= cols; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            matrix.set(cell(i, j), Math.min(
                (matrix.get(cell(i - 1, j)) ?? 0) + 1,
                (matrix.get(cell(i, j - 1)) ?? 0) + 1,
                (matrix.get(cell(i - 1, j - 1)) ?? 0) + cost,
            ));
        }
    }
    return matrix.get(cell(b.length, a.length)) ?? 0;
}
