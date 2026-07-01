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

import { type ValidationContext } from './artifact-validator.js';

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

function isCriteriaHeader(line: string): boolean {
    return /^(acceptance\s*criteria|scenarios|cenarios|given|when|then)\b/i.test(line);
}

function isCriterionLine(line: string): boolean {
    return line.startsWith('-') || line.startsWith('*') || /^\d+[.)]/.test(line);
}

function isSectionEnd(line: string): boolean {
    return /^(user story|description|test|acceptance)/i.test(line);
}

function processCriteriaLine(trimmed: string, inCriteria: boolean, criteria: string[]): boolean {
    if (isCriteriaHeader(trimmed)) {
        if (/^(given|when|then)\b/i.test(trimmed)) {
            criteria.push(trimmed);
        }
        return true;
    }
    if (!inCriteria) return false;
    if (isCriterionLine(trimmed)) {
        const cleaned = trimmed.replace(/^[-*\d.)\s]+/, '');
        if (cleaned.length > 5) criteria.push(cleaned);
    } else if (isSectionEnd(trimmed)) {
        return false;
    }
    return inCriteria;
}

function extractCriteriaFromSection(lines: string[], criteria: string[]): void {
    let inCriteria = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 3) continue;
        inCriteria = processCriteriaLine(trimmed, inCriteria, criteria);
    }
}

function extractCriteria(input: string): string[] {
    const lines = input.split('\n');
    const criteria: string[] = [];

    extractCriteriaFromSection(lines, criteria);

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

function extractTestTextsFromArtifact(artifact: unknown): string[] {
    const texts: string[] = [];
    if (typeof artifact !== 'object' || artifact === null) return texts;

    const obj = artifact as { [key: string]: unknown };
    const tests = obj['tests'];
    if (!Array.isArray(tests)) return texts;

    for (const test of tests) {
        if (typeof test !== 'object' || test === null) continue;
        const t = test as { [key: string]: unknown };
        if (typeof t['title'] === 'string') texts.push(t['title']);
        if (Array.isArray(t['steps'])) {
            texts.push(t['steps'].filter((s): s is string => typeof s === 'string').join(' '));
        }
        if (typeof t['expectedResult'] === 'string') texts.push(t['expectedResult']);
    }
    return texts;
}

/** Get test titles and steps from artifact. */
function extractTestTexts(artifact: unknown): string[] {
    return extractTestTextsFromArtifact(artifact);
}

function extractDeclaredCoverage(artifact: unknown): number | null {
    if (typeof artifact !== 'object' || artifact === null) return null;
    const obj = artifact as { [key: string]: unknown };
    const ct = obj['coverageTable'] as { [key: string]: unknown } | undefined;
    if (ct && typeof ct['coverage'] === 'number' && !isNaN(ct['coverage'])) {
        return ct['coverage'];
    }
    return null;
}

/**
 * Recalculate coverage independently from the LLM's declared value.
 */
export function recalculateCoverage(artifact: unknown, context: ValidationContext): CoverageVerificationResult {
    const criteria = extractCriteria(context.inputRaw);
    const testTexts = extractTestTexts(artifact);
    const declaredCoverage = extractDeclaredCoverage(artifact);

    if (criteria.length === 0) {
        const realCoverage = testTexts.length > 0 ? 100 : 0;
        return {
            declaredCoverage,
            realCoverage,
            totalCriteria: 0,
            coveredCriteria: 0,
            gaps: [],
            coverageDelta: declaredCoverage === null ? 0 : realCoverage - declaredCoverage,
        };
    }

    const gaps: Array<{ criterion: string; reason: string }> = [];
    let coveredCount = 0;

    for (const criterion of criteria) {
        const isCovered = testTexts.some((text) => criterionMatches(criterion, text));
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
