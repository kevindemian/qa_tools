/**
 * AnalysisValidator — domain invariants for LLM-generated failure analysis.
 *
 * Invariants implemented:
 *   A-01  Each test title exists in the input failed tests list
 *   A-02  Recommendation references the specific error
 *   A-03  Severity is consistent with classification
 *   A-04  UNKNOWN classification has a justification reason
 *   A-05  Recommendation ≥ 20 chars when severity=high
 */

import {
    ArtifactValidator,
    type InvariantFn,
    type ValidationContext,
    type ValidationResult,
    fail,
    pass,
    warn,
} from './artifact-validator.js';
import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from './shared-invariants.js';

interface AnalysisTestShape {
    title?: string;
    classification?: string;
    severity?: string;
    recommendation?: string;
}

function parseTests(artifact: unknown): AnalysisTestShape[] {
    if (typeof artifact !== 'object' || artifact === null) return [];
    const obj = artifact as Record<string, unknown>;
    if (Array.isArray(obj['tests'])) return obj['tests'] as AnalysisTestShape[];
    return [];
}

function extractFailedTestTitles(input: string): string[] {
    const lines = input.split('\n');
    const titles: string[] = [];
    for (const line of lines) {
        const match = /^\d+\.\s+\[(?:failed|error)\]\s+(.+)/i.exec(line);
        if (match && match[1]) {
            titles.push(match[1].trim());
        }
    }
    return titles;
}

/** A-01: Each test title in output exists in input failed tests. */
export const invariantTestTitleExists: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const inputTitles = extractFailedTestTitles(context.inputRaw);
    if (inputTitles.length === 0) return [pass('A-01', 'No failed test titles found in input to cross-reference')];

    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('A-01', 'No tests found in artifact')];

    const missingTitles: string[] = [];
    for (const test of tests) {
        if (!test.title) continue;
        const title: string = test.title;
        const found = inputTitles.some((t) => t.includes(title) || title.includes(t));
        if (!found) {
            missingTitles.push(title);
        }
    }

    if (missingTitles.length > 0) {
        return [fail('A-01', `Test titles not found in input failed tests: ${missingTitles.join(', ')}`)];
    }
    return [pass('A-01', 'All test titles exist in the input failed tests list')];
};

/** A-02: Recommendation references the specific error from test context. */
export const invariantRecommendationReferencesError: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [pass('A-02', 'No tests to validate')];

    const inputLines = context.inputRaw.split('\n');
    const errorTerms: string[] = [];
    for (const line of inputLines) {
        const terms = line.match(
            /\b(error|fail|exception|timeout|assert|500|400|404|503|reject|crash|oom|null|undefined)\b/gi,
        );
        if (terms) errorTerms.push(...terms);
    }
    const uniqueErrorTerms = [...new Set(errorTerms.map((t) => t.toLowerCase()))];

    if (uniqueErrorTerms.length === 0) return [pass('A-02', 'No error terms found in input to cross-reference')];

    const missing: string[] = [];
    for (const test of tests) {
        if (!test.recommendation) continue;
        const recLower = test.recommendation.toLowerCase();
        const matches = uniqueErrorTerms.filter((t) => recLower.includes(t));
        if (matches.length === 0 && test.title) {
            missing.push(test.title);
        }
    }

    if (missing.length > 0) {
        return [warn('A-02', `Recommendations for [${missing.join(', ')}] do not reference specific error terms`)];
    }
    return [pass('A-02', 'All recommendations reference specific error terms')];
};

/** A-03: Severity is consistent with classification. */
export const invariantSeverityConsistent: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [pass('A-03', 'No tests to validate')];

    const warnings: string[] = [];
    for (const [i, t] of tests.entries()) {
        if (t.classification === 'ASSERTION' && t.severity === 'low') {
            warnings.push(`test[${i}]: ASSERTION classified as low severity`);
        }
        if (t.classification === 'FLAKY' && t.severity === 'high') {
            warnings.push(`test[${i}]: FLAKY classified as high severity`);
        }
        if (t.classification === 'ENVIRONMENT' && t.severity === 'high') {
            warnings.push(`test[${i}]: ENVIRONMENT classified as high severity`);
        }
    }

    if (warnings.length > 0) {
        return [warn('A-03', warnings.join('; '))];
    }
    return [pass('A-03', 'All severities are consistent with classifications')];
};

/** A-04: UNKNOWN classification has a justification reason. */
export const invariantUnknownHasReason: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [pass('A-04', 'No tests to validate')];

    const unknownNoReason: number[] = [];
    for (const [i, t] of tests.entries()) {
        if (t.classification === 'UNKNOWN') {
            const rec = t.recommendation || '';
            if (rec.length < 15) {
                unknownNoReason.push(i);
            }
        }
    }

    if (unknownNoReason.length > 0) {
        return [
            fail(
                'A-04',
                `UNKNOWN classifications at indices [${unknownNoReason.join(',')}] lack justification (recommendation too short)`,
            ),
        ];
    }
    return [pass('A-04', 'All UNKNOWN classifications have justification')];
};

/** A-05: Recommendation ≥ 20 chars when severity=high. */
export const invariantHighSeverityRecommendation: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [pass('A-05', 'No tests to validate')];

    const shortRecommendations: number[] = [];
    for (const [i, t] of tests.entries()) {
        if (t.severity === 'high' && (!t.recommendation || t.recommendation.length < 20)) {
            shortRecommendations.push(i);
        }
    }

    if (shortRecommendations.length > 0) {
        return [
            fail(
                'A-05',
                `High-severity tests at indices [${shortRecommendations.join(',')}] have recommendation < 20 chars`,
            ),
        ];
    }
    return [pass('A-05', 'All high-severity recommendations meet minimum length')];
};

/** Create a pre-configured AnalysisValidator with all invariants registered. */
export function createAnalysisValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('analysis');

    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);
    validator.addInvariant('I-05', invariantConclusionHasEvidence);

    validator.addInvariant('A-01', invariantTestTitleExists);
    validator.addInvariant('A-02', invariantRecommendationReferencesError);
    validator.addInvariant('A-03', invariantSeverityConsistent);
    validator.addInvariant('A-04', invariantUnknownHasReason);
    validator.addInvariant('A-05', invariantHighSeverityRecommendation);

    return validator;
}
