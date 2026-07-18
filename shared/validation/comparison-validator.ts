/**
 * ComparisonValidator — domain invariants for run comparison analysis.
 *
 * Invariants implemented:
 *   C-01  meaningfulChanges is non-empty
 *   C-02  Numeric values in before/after match input data
 *   C-03  summary is ≤ 5 sentences
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

interface MeaningfulChangeShape {
    metric: string;
    before: string | number;
    after: string | number;
    impact: string;
}

interface ComparisonShape {
    summary?: string;
    meaningfulChanges?: MeaningfulChangeShape[];
    confidence?: number;
    evidence?: string[];
}

function parseComparison(artifact: unknown): ComparisonShape | null {
    if (typeof artifact !== 'object' || artifact === null) return null;
    return artifact;
}

/** C-01: meaningfulChanges array must be non-empty. */
export const invariantChangesNonEmpty: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const comp = parseComparison(artifact);
    if (!comp) return [fail('C-01', 'Artifact is not a valid comparison object')];

    if (!comp.meaningfulChanges || comp.meaningfulChanges.length === 0) {
        return [fail('C-01', 'meaningfulChanges array is empty')];
    }
    return [pass('C-01', `meaningfulChanges has ${comp.meaningfulChanges.length} change(s)`)];
};

/** C-02: Numeric before/after values should be found in input. */
export const invariantNumbersMatchInput: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const comp = parseComparison(artifact);
    if (!comp) return [fail('C-02', 'Artifact is not a valid comparison object')];

    const inputLower = context.inputRaw.toLowerCase();
    const changes = comp.meaningfulChanges || [];

    const mismatches: string[] = [];
    for (const change of changes) {
        const beforeStr = String(change.before);
        const afterStr = String(change.after);

        if (beforeStr.length > 3 && !inputLower.includes(beforeStr.toLowerCase())) {
            mismatches.push(`before value "${beforeStr}" for metric "${change.metric}" not found in input`);
        }
        if (afterStr.length > 3 && !inputLower.includes(afterStr.toLowerCase())) {
            mismatches.push(`after value "${afterStr}" for metric "${change.metric}" not found in input`);
        }
    }

    if (mismatches.length > 0) {
        return [warn('C-02', mismatches.join('; '))];
    }
    return [pass('C-02', 'All before/after values match input data')];
};

/** C-03: Summary must be ≤ 5 sentences. */
export const invariantSummaryLength: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const comp = parseComparison(artifact);
    if (!comp) return [fail('C-03', 'Artifact is not a valid comparison object')];

    if (!comp.summary) return [fail('C-03', 'Summary is missing')];

    const sentenceCount = (comp.summary.match(/[.!?]+/g) || []).length + 1;
    if (sentenceCount > 5) {
        return [warn('C-03', `Summary has ${sentenceCount} sentences (max 5 recommended)`)];
    }
    return [pass('C-03', `Summary has ${sentenceCount} sentence(s) — within limit`)];
};

export function createComparisonValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('comparison');

    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);
    validator.addInvariant('I-05', invariantConclusionHasEvidence);

    validator.addInvariant('C-01', invariantChangesNonEmpty);
    validator.addInvariant('C-02', invariantNumbersMatchInput);
    validator.addInvariant('C-03', invariantSummaryLength);

    return validator;
}
