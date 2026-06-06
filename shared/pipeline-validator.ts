/**
 * PipelineValidator — domain invariants for pipeline failure classification.
 *
 * Invariants implemented:
 *   P-01  confidence ≥ 0.6
 *   P-02  evidence[] is non-empty
 *   P-03  code/infrastructure categories have recommendation
 */

import {
    ArtifactValidator,
    type InvariantFn,
    type ValidationContext,
    type ValidationResult,
    fail,
    pass,
} from './artifact-validator.js';
import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
} from './shared-invariants.js';

interface PipelineShape {
    category?: string;
    confidence?: number;
    evidence?: string[];
    recommendation?: string;
}

function parsePipeline(artifact: unknown): PipelineShape | null {
    if (typeof artifact !== 'object' || artifact === null) return null;
    return artifact;
}

/** P-01: confidence must be ≥ 0.6. */
export const invariantMinConfidence: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const pipeline = parsePipeline(artifact);
    if (!pipeline) return [fail('P-01', 'Artifact is not a valid pipeline classification object')];

    if (pipeline.confidence === undefined || pipeline.confidence < 0.6) {
        return [fail('P-01', `Confidence ${pipeline.confidence ?? 'undefined'} is below minimum 0.6`)];
    }
    return [pass('P-01', `Confidence ${pipeline.confidence} meets threshold`)];
};

/** P-02: evidence array must be non-empty. */
export const invariantEvidenceNonEmpty: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const pipeline = parsePipeline(artifact);
    if (!pipeline) return [fail('P-02', 'Artifact is not a valid pipeline classification object')];

    if (!pipeline.evidence || pipeline.evidence.length === 0) {
        return [fail('P-02', 'evidence array is empty or missing')];
    }
    return [pass('P-02', `evidence array has ${pipeline.evidence.length} item(s)`)];
};

/** P-03: code and infrastructure categories require recommendation. */
export const invariantCategoryHasRecommendation: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const pipeline = parsePipeline(artifact);
    if (!pipeline) return [fail('P-03', 'Artifact is not a valid pipeline classification object')];

    if (pipeline.category === 'code' || pipeline.category === 'infrastructure') {
        if (!pipeline.recommendation || pipeline.recommendation.length < 10) {
            return [fail('P-03', `Category "${pipeline.category}" requires a recommendation (min 10 chars)`)];
        }
    }
    return [pass('P-03', 'Recommendation requirements met')];
};

export function createPipelineValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('pipeline');

    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);

    validator.addInvariant('P-01', invariantMinConfidence);
    validator.addInvariant('P-02', invariantEvidenceNonEmpty);
    validator.addInvariant('P-03', invariantCategoryHasRecommendation);

    return validator;
}
