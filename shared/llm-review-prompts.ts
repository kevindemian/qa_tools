/**
 * Prompt builders for the LLM review pipeline.
 * Change frequency: prompt engineering / schema changes.
 */
import type { ZodSchema } from './types.js';
import type { ArtifactType } from './llm-review-types.js';
import { FailureAnalysisSchema } from './failure-analysis.schema.js';
import { TestSuiteSchema } from './test-suite.schema.js';
import { PipelineClassificationSchema } from './pipeline-schema.js';
import { AiBugReportSchema } from './bug-report.schema.js';
import { RunComparisonSchema } from './comparison-schema.js';
import { sanitizeForLlm } from './sanitize.js';

export const ADVERSARIAL_TIERS = ['report', 'fast', 'fallback'] as const;
export const REV_TIERS = ['reviewer', 'fast', 'fallback'] as const;

/** Map artifact type to its Zod schema for Layer 1 validation. */
export function getSchemaForType(type: ArtifactType): ZodSchema {
    switch (type) {
        case 'test-suite':
            return TestSuiteSchema;
        case 'analysis':
            return FailureAnalysisSchema;
        case 'pipeline':
            return PipelineClassificationSchema;
        case 'bug-report':
            return AiBugReportSchema;
        case 'comparison':
            return RunComparisonSchema;
    }
}

/** Type-specific check instructions for adversarial audit prompts. */
export function getTypeReviewChecks(type: ArtifactType): string {
    switch (type) {
        case 'test-suite':
            return [
                'Type-specific checks for test-suites:',
                '- Every acceptance criterion must have ≥1 test case covering it',
                '- Coverage must be ≥ 90% or gap justified',
                '- State mutations must have before + after tests',
                '- All steps must be concrete actions (not "validate that...")',
                '- All expectedResults must be verifiable (not "should work")',
            ].join('\n');
        case 'analysis':
            return [
                'Type-specific checks for failure analysis:',
                '- Each test title must exist in the input failed tests list',
                '- Recommendations must reference specific error terms',
                '- Severity must be consistent with classification',
                '- UNKNOWN classifications must have justification',
            ].join('\n');
        case 'bug-report':
            return [
                'Type-specific checks for bug reports:',
                '- Steps to reproduce must have ≥ 3 ordered steps',
                '- Each step must start with an imperative verb',
                '- Severity must be consistent with description',
                '- No hallucinated fields — "Not specified" only when input lacks info',
            ].join('\n');
        case 'comparison':
            return [
                'Type-specific checks for run comparisons:',
                '- Meaningful changes must be identified (non-empty)',
                '- Before/after values must match the input data',
                '- Summary must be concise (≤ 5 sentences)',
            ].join('\n');
        case 'pipeline':
            return [
                'Type-specific checks for pipeline classification:',
                '- Confidence score must be ≥ 0.6',
                '- Evidence array must be non-empty',
                '- Code/infrastructure categories require a recommendation',
            ].join('\n');
    }
}

/** Build the adversarial review prompt with NÃO CONFORMIDADE framing. */
export function buildReviewPrompt(original: string, type: ArtifactType): string {
    const typeSpecificChecks = getTypeReviewChecks(type);
    return [
        'You are an adversarial QA auditor. Perform an adversarial audit of the ' + type + ' below.',
        '',
        'PREMISE OF NON-COMPLIANCE:',
        'Start from the assumption that EVERY claim is WRONG.',
        'Only conclude COMPLIANT if you find explicit evidence for each requirement.',
        'If evidence is missing or insufficient → mark as VIOLATION.',
        '',
        'Audit steps (execute mentally before responding):',
        '1. Identify every factual error, logical gap, or missing detail',
        '2. Challenge each recommendation — is it specific, actionable, and correct?',
        '3. Verify all evidence citations — do they reference real content from input?',
        '4. Check all required fields are present and non-empty',
        '5. Mentally iterate: revise with your fixes, then re-audit the revised version',
        '6. Repeat until no more issues are found',
        '',
        typeSpecificChecks,
        '',
        'After completing your adversarial audit, respond with exactly one verdict:',
        'AGREE — the output is accurate and complete after your mental revision',
        'PARTIAL — minor issues remain (list them briefly)',
        'DISAGREE — major errors or omissions remain (explain why)',
        '',
        'Then list each issue you found and how it was fixed (or why it persists if not AGREE).',
        '',
        '--- ' + type.toUpperCase() + ' TO AUDIT ---',
        original,
    ].join('\n');
}

/**
 * Build the self-critique prompt for the SAME model (2-persona).
 * Stronger adversarial framing to mitigate self-bias —
 * explicitly separate the critic persona from the generator persona.
 */
export function buildSelfCritiquePrompt(original: string, type: ArtifactType): string {
    const typeSpecificChecks = getTypeReviewChecks(type);
    return [
        'You are an independent adversarial auditor — a DIFFERENT agent from the report generator.',
        'The ' + type + ' below was produced by ANOTHER agent. Treat it as untrusted.',
        'Your role is to find flaws, omissions, and inaccuracies. Do NOT polish or rewrite.',
        '',
        'PREMISE OF NON-COMPLIANCE:',
        'Start from the assumption that EVERY claim is WRONG.',
        'Only conclude COMPLIANT if you find explicit evidence for each requirement.',
        'If evidence is missing or insufficient → mark as VIOLATION.',
        '',
        'Audit steps (execute mentally before responding):',
        '1. Identify every factual error, logical gap, or missing detail',
        '2. Challenge each recommendation — is it specific, actionable, and correct?',
        '3. Verify all evidence citations — do they reference real content from input?',
        '4. Check all required fields are present and non-empty',
        '5. If you find ANY issue, mark as DISAGREE or PARTIAL — do NOT rationalize',
        '',
        typeSpecificChecks,
        '',
        'After completing your adversarial audit, respond with exactly one verdict:',
        'AGREE — the output is accurate and complete (no issues found)',
        'PARTIAL — minor issues remain (list them briefly)',
        'DISAGREE — major errors or omissions remain (explain why)',
        '',
        'Then list each issue you found and how you would fix it.',
        '',
        '--- ' + type.toUpperCase() + ' TO AUDIT ---',
        original,
    ].join('\n');
}

/** Build adversarial retry prompt with specific quality gaps from peer review. */
export function buildAdversarialRetryPrompt(gaps: string, user: string, type: ArtifactType): string {
    return [
        'Your previous ' + type + ' had these quality gaps identified by peer review:',
        '',
        gaps,
        '',
        'Regenerate the ' + type + ', addressing each gap above.',
        '',
        'Adversarial audit steps (execute mentally, do not include in output):',
        '1. Identify every remaining gap, factual error, or logical flaw',
        '2. Challenge each fix — does it truly address the detected peer-review gap?',
        '3. Verify all classifications, severities, and recommendations conform to the schema',
        '4. Start from the premise your fix is STILL WRONG — verify before finalizing',
        '5. Repeat until you can find no new issues — only then output the final ' + type,
        '',
        'Original context:',
        user,
    ].join('\n');
}

/** Build retry prompt for validation-error recovery in the retry loop. */
export function buildRetryPrompt(original: string, errors: string[], invalidResponse?: string): string {
    const lines = [
        'Your previous response had validation issues. Before retrying, adversarially audit your fix:',
        '',
        '1. Understand each error below — why it occurred and how to prevent it',
        '2. Revise the output fixing all issues',
        '3. Mentally re-validate the revised version against the schema',
        '4. Repeat until no validation errors remain, then output the final result',
        '',
        'Validation errors to fix:',
        ...errors.map((e) => '- ' + e),
        '',
    ];
    if (invalidResponse) {
        lines.push('', '--- YOUR INVALID RESPONSE (fix this) ---', sanitizeForLlm(invalidResponse).slice(0, 500));
    }
    lines.push('', 'Original instructions:', original);
    return lines.join('\n');
}
