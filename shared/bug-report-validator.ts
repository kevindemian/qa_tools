/**
 * BugReportValidator — domain invariants for LLM-generated bug reports.
 *
 * Invariants implemented:
 *   B-01  stepsToReproduce ≥ 3 steps
 *   B-02  Each step starts with an imperative verb
 *   B-03  severity is consistent with description length
 *   B-04  "Not specified" fields are justified by missing input
 */

import {
    ArtifactValidator,
    type InvariantFn,
    type ValidationContext,
    type ValidationResult,
    fail,
    pass,
    warn,
} from './artifact-validator';
import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from './shared-invariants';

const IMPERATIVE_RE =
    /^(Click|Type|Navigate|Enter|Select|Executar|Clicar|Preencher|Navegar|Press|Open|Close|Drag|Drop|Scroll|Hover|Focus|Submit|Send|Tap|Swipe|Input|Choose|Check|Uncheck|Fill|Clear|Wait|Verify|Assert|Expect|Run|Execute)/i;

interface BugReportShape {
    summary?: string;
    description?: string;
    stepsToReproduce?: string[];
    expectedResult?: string;
    actualResult?: string;
    severity?: string;
    component?: string;
    environment?: string;
    evidence?: string[];
}

function parseReport(artifact: unknown): BugReportShape | null {
    if (typeof artifact !== 'object' || artifact === null) return null;
    return artifact;
}

/** B-01: stepsToReproduce must have at least 3 steps. */
export const invariantMinSteps: InvariantFn = (artifact: unknown, _context: ValidationContext): ValidationResult[] => {
    const report = parseReport(artifact);
    if (!report) return [fail('B-01', 'Artifact is not a valid bug report object')];

    if (!report.stepsToReproduce || report.stepsToReproduce.length < 3) {
        return [fail('B-01', `stepsToReproduce has ${report.stepsToReproduce?.length ?? 0} step(s), minimum is 3`)];
    }
    return [pass('B-01', `stepsToReproduce has ${report.stepsToReproduce.length} steps`)];
};

/** B-02: Each step starts with an imperative verb. */
export const invariantImperativeSteps: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const report = parseReport(artifact);
    if (!report) return [fail('B-02', 'Artifact is not a valid bug report object')];

    const nonImperative: number[] = [];
    const steps = report.stepsToReproduce || [];
    for (let i = 0; i < steps.length; i++) {
        if (!IMPERATIVE_RE.test(steps[i] as string)) {
            nonImperative.push(i);
        }
    }

    if (nonImperative.length > 0) {
        return [warn('B-02', `Steps at indices [${nonImperative.join(',')}] do not start with an imperative verb`)];
    }
    return [pass('B-02', 'All steps start with an imperative verb')];
};

/** B-03: Severity consistent with description length. */
export const invariantSeverityConsistentWithDescription: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const report = parseReport(artifact);
    if (!report) return [fail('B-03', 'Artifact is not a valid bug report object')];

    if (report.severity === 'critical' && (!report.description || report.description.length < 50)) {
        return [warn('B-03', 'Severity is critical but description is very short (< 50 chars)')];
    }
    return [pass('B-03', 'Severity and description length are consistent')];
};

/** B-04: "Not specified" fields justified by missing input evidence. */
export const invariantNotSpecifiedJustified: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const report = parseReport(artifact);
    if (!report) return [fail('B-04', 'Artifact is not a valid bug report object')];

    const fieldsWithNotSpecified: string[] = [];
    for (const [key, value] of Object.entries(report)) {
        if (typeof value === 'string' && /not specified/i.test(value)) {
            fieldsWithNotSpecified.push(key);
        }
    }

    if (fieldsWithNotSpecified.length === 0) return [pass('B-04', 'No "Not specified" fields found')];

    const inputLower = context.inputRaw.toLowerCase();
    const fieldsWithInfoInInput = fieldsWithNotSpecified.filter((field) => {
        return inputLower.includes(field.toLowerCase());
    });

    if (fieldsWithInfoInInput.length > 0) {
        return [
            warn(
                'B-04',
                `Fields [${fieldsWithInfoInInput.join(',')}] set to "Not specified" but input may contain relevant information`,
            ),
        ];
    }
    return [pass('B-04', '"Not specified" fields justified by missing input')];
};

export function createBugReportValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('bug-report');

    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);
    validator.addInvariant('I-05', invariantConclusionHasEvidence);

    validator.addInvariant('B-01', invariantMinSteps);
    validator.addInvariant('B-02', invariantImperativeSteps);
    validator.addInvariant('B-03', invariantSeverityConsistentWithDescription);
    validator.addInvariant('B-04', invariantNotSpecifiedJustified);

    return validator;
}
