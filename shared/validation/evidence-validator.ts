/**
 * Evidence Citation Verification — Layer 3 (Semantic).
 *
 * Parses the `evidence[]` field from any artifact and verifies that
 * each citation actually references content from the input.
 *
 * Strategies:
 *   1. Direct substring match — evidence text appears in input
 *   2. Fuzzy match — 70%+ of evidence tokens appear in input
 *   3. ID cross-reference — evidence item matches a known ID in input
 *
 * Returns structured results: verified, unverifiable, hallucinated.
 */

import { type ValidationResult, type ValidationContext } from './artifact-validator.js';

export interface EvidenceVerificationResult {
    totalCitations: number;
    verified: number;
    unverifiable: number;
    hallucinated: number;
    details: Array<{
        citation: string;
        status: 'verified' | 'unverifiable' | 'hallucinated';
        context: string;
    }>;
    allVerified: boolean;
}

function isNonNullObject(val: unknown): val is Record<string, unknown> {
    return val != null && Object.getPrototypeOf(val) !== null;
}

function extractCoverageTexts(testObj: { [key: string]: unknown }): string[] {
    if (!Array.isArray(testObj['coverage'])) return [];
    const results: string[] = [];
    for (const cov of testObj['coverage']) {
        if (isNonNullObject(cov)) {
            const covObj = cov as { [key: string]: unknown };
            if (typeof covObj['criterionText'] === 'string') {
                results.push(covObj['criterionText']);
            }
        }
    }
    return results;
}

function extractLongSteps(testObj: { [key: string]: unknown }): string[] {
    if (!Array.isArray(testObj['steps'])) return [];
    const results: string[] = [];
    for (const step of testObj['steps']) {
        if (typeof step === 'string' && step.length > 20) {
            results.push(step);
        }
    }
    return results;
}

function extractEvidenceFromTest(testObj: { [key: string]: unknown }): string[] {
    const results: string[] = [];
    if (Array.isArray(testObj['evidence'])) {
        results.push(...testObj['evidence'].filter((e): e is string => typeof e === 'string'));
    }
    results.push(...extractCoverageTexts(testObj));
    results.push(...extractLongSteps(testObj));
    return results;
}

/** Extract all strings from evidence arrays in an artifact. */
function extractEvidenceStrings(artifact: unknown): string[] {
    if (typeof artifact !== 'object' || artifact === null) return [];

    const obj = artifact as { [key: string]: unknown };
    const results: string[] = [];

    if (Array.isArray(obj['evidence'])) {
        results.push(...obj['evidence'].filter((e): e is string => typeof e === 'string'));
    }

    const tests = obj['tests'];
    if (!Array.isArray(tests)) return results;

    for (const test of tests) {
        if (isNonNullObject(test)) {
            results.push(...extractEvidenceFromTest(test));
        }
    }

    return results;
}

/** Tokenize a string into normalized word tokens. */
function tokenize(text: string): Set<string> {
    return new Set(
        text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((t) => t.length > 2),
    );
}

/** Check what fraction of evidence tokens appear in input text (0-1). */
function tokenOverlap(evidence: string, input: string): number {
    const evTokens = tokenize(evidence);
    const inputTokens = tokenize(input);
    if (evTokens.size === 0) return 1;
    let matchCount = 0;
    for (const token of evTokens) {
        if (inputTokens.has(token)) matchCount++;
    }
    return matchCount / evTokens.size;
}

function verifySingleCitation(citation: string, input: string): EvidenceVerificationResult['details'][number] {
    const trimmed = citation.trim();
    if (trimmed.length < 5) {
        return { citation: trimmed, status: 'unverifiable', context: 'Too short to verify' };
    }
    if (input.includes(trimmed) || input.includes(trimmed.slice(0, 80))) {
        return { citation: trimmed.slice(0, 100), status: 'verified', context: 'Direct match found' };
    }
    const overlap = tokenOverlap(trimmed, input);
    if (overlap >= 0.7) {
        return {
            citation: trimmed.slice(0, 100),
            status: 'verified',
            context: `Token overlap ${Math.round(overlap * 100)}%`,
        };
    }
    const idMatch = /^([A-Z]+-\d+|[a-z0-9]{8,}|error\s+\d{3})/i.exec(trimmed);
    if (idMatch && input.includes(idMatch[1] as string)) {
        return {
            citation: trimmed.slice(0, 100),
            status: 'verified',
            context: `Reference ID "${idMatch[1]}" found in input`,
        };
    }
    if (overlap < 0.3 && trimmed.length > 20) {
        return {
            citation: trimmed.slice(0, 100),
            status: 'hallucinated',
            context: `Only ${Math.round(overlap * 100)}% token overlap with input`,
        };
    }
    return {
        citation: trimmed.slice(0, 100),
        status: 'unverifiable',
        context: `Partial overlap ${Math.round(overlap * 100)}%`,
    };
}

/**
 * Verify every evidence citation in artifact against input context.
 * Citations are classified as:
 *   - verified: substring or high token overlap found in input
 *   - unverifiable: too short or too generic to verify
 *   - hallucinated: substantial text not found in input
 */
export function verifyEvidence(artifact: unknown, context: ValidationContext): EvidenceVerificationResult {
    const input = context.inputRaw;
    const citations = extractEvidenceStrings(artifact);
    const details = citations.map((citation) => verifySingleCitation(citation, input));

    const verified = details.filter((d) => d.status === 'verified').length;
    const unverifiable = details.filter((d) => d.status === 'unverifiable').length;
    const hallucinated = details.filter((d) => d.status === 'hallucinated').length;

    return {
        totalCitations: citations.length,
        verified,
        unverifiable,
        hallucinated,
        details,
        allVerified: hallucinated === 0,
    };
}

/** Evidence verification as an ArtifactValidator-compatible function. */
export function evidenceValidationResult(artifact: unknown, context: ValidationContext): ValidationResult[] {
    const result = verifyEvidence(artifact, context);
    const validationResults: ValidationResult[] = [];

    if (result.totalCitations === 0) {
        validationResults.push({
            passed: true,
            invariantId: 'E-00',
            message: 'No evidence citations to verify',
            severity: 'error',
            artifactPath: '',
        });
        return validationResults;
    }

    if (result.hallucinated > 0) {
        validationResults.push({
            passed: false,
            invariantId: 'E-01',
            message: `Evidence verification: ${result.hallucinated} hallucinated citation(s), ${result.unverifiable} unverifiable, ${result.verified} verified`,
            severity: 'error',
            artifactPath: 'evidence',
        });
    }

    if (result.verified > 0) {
        validationResults.push({
            passed: true,
            invariantId: 'E-02',
            message: `${result.verified}/${result.totalCitations} citations verified against input`,
            severity: 'error',
            artifactPath: '',
        });
    }

    return validationResults;
}
