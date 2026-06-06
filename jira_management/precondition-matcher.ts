import type { PreConditionSummary, PreConditionMatchResult } from '../shared/types.js';

/** Stopwords (English + Portuguese) for asymmetric token verification. */
const STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'in',
    'on',
    'at',
    'to',
    'for',
    'of',
    'with',
    'by',
    'from',
    'up',
    'into',
    'over',
    'be',
    'is',
    'are',
    'was',
    'were',
    'been',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'shall',
    'should',
    'may',
    'might',
    'can',
    'could',
    'must',
    'need',
    'not',
    'no',
    'or',
    'and',
    'but',
    'if',
    'as',
    'so',
    'than',
    'that',
    'this',
    'these',
    'those',
    'it',
    'its',
    'each',
    'every',
    'all',
    'any',
    'some',
    'such',
    'only',
    'own',
    'same',
    'very',
    'just',
    'about',
    'after',
    'before',
    'between',
    'through',
    'during',
    'without',
    'within',
    'along',
    'o',
    'a',
    'os',
    'as',
    'de',
    'da',
    'do',
    'das',
    'dos',
    'para',
    'com',
    'por',
    'no',
    'na',
    'num',
    'numa',
    'em',
    'um',
    'uma',
    'uns',
    'umas',
    'ao',
    'aos',
    'pela',
    'pelas',
    'pelo',
    'pelos',
    'ser',
    'estar',
    'ter',
    'é',
    'são',
    'foi',
    'não',
    'se',
    'que',
    'como',
    'já',
    'só',
    'mais',
    'entre',
    'sobre',
    'após',
    'até',
    'sob',
    'ante',
    'desde',
    'sem',
    'conforme',
    'segundo',
]);

export function matchPreconditionByTokenOverlap(
    query: string,
    candidates: PreConditionSummary[],
    threshold = 0.5,
): PreConditionMatchResult {
    const qLower = query.toLowerCase().trim();
    if (!qLower || candidates.length === 0) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    const exact = candidates.find((c) => c.summary.toLowerCase().trim() === qLower);
    if (exact) {
        return { key: exact.key, summary: exact.summary, matchType: 'exact' };
    }
    const contain = candidates.find(
        (c) => c.summary.toLowerCase().includes(qLower) || qLower.includes(c.summary.toLowerCase()),
    );
    if (contain) {
        return { key: contain.key, summary: contain.summary, matchType: 'containment' };
    }
    const qWords = new Set(qLower.split(/\s+/).filter(Boolean));
    let best: { candidate: PreConditionSummary; score: number } | null = null;
    for (const c of candidates) {
        const cWords = new Set(c.summary.toLowerCase().split(/\s+/).filter(Boolean));
        const intersection = new Set([...qWords].filter((w) => cWords.has(w)));
        const union = new Set([...qWords, ...cWords]);
        const score = intersection.size / union.size;
        if (score > (best?.score ?? 0)) {
            best = { candidate: c, score };
        }
    }
    if (best && best.score >= threshold) {
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }
    return { key: '__create__', summary: query, matchType: 'create' };
}

export function matchPreconditionByDualThreshold(
    query: string,
    candidates: PreConditionSummary[],
): PreConditionMatchResult {
    const qLower = query.toLowerCase().trim();
    if (!qLower || candidates.length === 0) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    const exact = candidates.find((c) => c.summary.toLowerCase().trim() === qLower);
    if (exact) {
        return { key: exact.key, summary: exact.summary, matchType: 'exact' };
    }
    const contain = candidates.find(
        (c) => c.summary.toLowerCase().includes(qLower) || qLower.includes(c.summary.toLowerCase()),
    );
    if (contain) {
        return { key: contain.key, summary: contain.summary, matchType: 'containment' };
    }
    const qWords = new Set(qLower.split(/\s+/).filter(Boolean));
    let best: { candidate: PreConditionSummary; score: number } | null = null;
    for (const c of candidates) {
        const cWords = new Set(c.summary.toLowerCase().split(/\s+/).filter(Boolean));
        const intersection = new Set([...qWords].filter((w) => cWords.has(w)));
        const union = new Set([...qWords, ...cWords]);
        const score = intersection.size / union.size;
        if (score > (best?.score ?? 0)) {
            best = { candidate: c, score };
        }
    }
    if (!best) {
        return { key: '__create__', summary: query, matchType: 'create' };
    }
    if (best.score >= 0.7) {
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }
    if (best.score >= 0.5) {
        const qContentTokens = [...qWords].filter((w) => !STOPWORDS.has(w));
        const cContentTokens = new Set(
            [...best.candidate.summary.toLowerCase().split(/\s+/).filter(Boolean)].filter((w) => !STOPWORDS.has(w)),
        );
        const uniqueToQuery = qContentTokens.filter((w) => !cContentTokens.has(w));
        const uniqueToCandidate = [...cContentTokens].filter((w) => !qContentTokens.includes(w));
        if (uniqueToQuery.length > 0 && uniqueToCandidate.length > 0) {
            return { key: '__create__', summary: query, matchType: 'create' };
        }
        return { key: best.candidate.key, summary: best.candidate.summary, matchType: 'overlap' };
    }
    return { key: '__create__', summary: query, matchType: 'create' };
}
