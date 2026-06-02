/**
 * Coverage Recalculation — Layer 3 (Semantic).
 *
 * Independently recalculates test coverage from requirements/criteria.
 * Does NOT trust the LLM's self-declared coverage percentage.
 *
 * Strategy:
 *   For each requirement/criterion extracted from input:
 *     1. Check if any test case title mentions it (substring)
 *     2. Check if any test case steps mention it
 *     3. Check if any test case coverage[criterionId] matches it
 *
 * Returns real coverage % + gap list.
 */

import { type ValidationContext } from './artifact-validator';

export interface CoverageVerificationResult {
    declaredCoverage: number | null;
    realCoverage: number;
    totalCriteria: number;
    coveredCriteria: number;
    gaps: Array<{
        criterion: string;
        reason: string;
    }>;
    coverageDelta: number; // real - declared (negative = overselling)
}

/** Extract criteria from input text (acceptance criteria section). */
function extractCriteria(input: string): string[] {
    const lines = input.split('\n');
    const criteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 3) continue;

        if (/^(acceptance\s*criteria|scenarios|cenarios|given|when|then)\b/i.test(trimmed)) {
            inCriteria = true;
            if (/^(given|when|then)\b/i.test(trimmed)) {
                criteria.push(trimmed);
            }
            continue;
        }

        if (inCriteria) {
            if (trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+[.)]/.test(trimmed)) {
                const cleaned = trimmed.replace(/^[-*\d.)\s]+/, '');
                if (cleaned.length > 5) criteria.push(cleaned);
            } else if (/^(user story|description|test|acceptance)/i.test(trimmed)) {
                inCriteria = false;
            }
        }
    }

    return criteria.length > 0 ? criteria : extractFallback(input);
}

/** Fallback: split whole input into candidate requirements by lines. */
function extractFallback(input: string): string[] {
    return input
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !l.startsWith('#') && !l.startsWith('//'))
        .slice(0, 20);
}

/** Normalize text for matching. */
function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim();
}

/** Match criterion against a test's text (title or steps). */
function criterionMatches(criterion: string, testText: string): boolean {
    const normCriterion = normalize(criterion);
    const normText = normalize(testText);

    // Direct substring match
    if (normText.includes(normCriterion)) return true;

    // Key terms in criterion present in test
    const criterionTerms = normCriterion.split(/\s+/).filter((t) => t.length > 3);
    const testTerms = new Set(normText.split(/\s+/));
    if (criterionTerms.length === 0) return false;

    let matches = 0;
    for (const term of criterionTerms) {
        if (testTerms.has(term)) matches++;
    }
    return matches / criterionTerms.length >= 0.5;
}

/** Get test titles and steps from artifact. */
function extractTestTexts(artifact: unknown): string[] {
    const texts: string[] = [];
    if (typeof artifact !== 'object' || artifact === null) return texts;

    const obj = artifact as Record<string, unknown>;
    const tests = obj.tests;
    if (Array.isArray(tests)) {
        for (const test of tests) {
            if (typeof test !== 'object' || test === null) continue;
            const t = test as Record<string, unknown>;
            if (typeof t.title === 'string') texts.push(t.title);
            if (Array.isArray(t.steps)) {
                texts.push(t.steps.filter((s): s is string => typeof s === 'string').join(' '));
            }
            if (typeof t.expectedResult === 'string') texts.push(t.expectedResult);
        }
    }
    return texts;
}

/**
 * Recalculate coverage independently from the LLM's declared value.
 */
export function recalculateCoverage(artifact: unknown, context: ValidationContext): CoverageVerificationResult {
    const criteria = extractCriteria(context.inputRaw);
    const testTexts = extractTestTexts(artifact);

    let declaredCoverage: number | null = null;
    if (typeof artifact === 'object' && artifact !== null) {
        const obj = artifact as Record<string, unknown>;
        const ct = obj.coverageTable as Record<string, unknown> | undefined;
        if (ct && typeof ct.coverage === 'number') {
            declaredCoverage = ct.coverage;
        }
    }

    if (criteria.length === 0) {
        return {
            declaredCoverage,
            realCoverage: testTexts.length > 0 ? 100 : 0,
            totalCriteria: 0,
            coveredCriteria: 0,
            gaps: [],
            coverageDelta: declaredCoverage !== null ? (testTexts.length > 0 ? 100 : 0) - declaredCoverage : 0,
        };
    }

    const gaps: Array<{ criterion: string; reason: string }> = [];
    let coveredCount = 0;

    for (const criterion of criteria) {
        let isCovered = false;
        for (const text of testTexts) {
            if (criterionMatches(criterion, text)) {
                isCovered = true;
                break;
            }
        }
        if (isCovered) {
            coveredCount++;
        } else {
            gaps.push({ criterion: criterion.slice(0, 120), reason: 'No test covers this criterion' });
        }
    }

    const realCoverage = criteria.length > 0 ? Math.round((coveredCount / criteria.length) * 100) : 0;

    return {
        declaredCoverage,
        realCoverage,
        totalCriteria: criteria.length,
        coveredCriteria: coveredCount,
        gaps,
        coverageDelta: declaredCoverage !== null ? realCoverage - declaredCoverage : 0,
    };
}
