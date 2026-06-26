/**
 * Shared invariants (I-01 to I-05) — cross-artifact validation rules.
 *
 * These invariants apply to ALL artifact types and are registered
 * automatically by each domain validator.
 *
 * I-01: No placeholder text (TODO, FIXME, TBD, asdf)
 * I-02: No markdown formatting in string field values
 * I-03: Referenced IDs/evidence exist in the input
 * I-04: No empty required fields
 * I-05: No conclusion without supporting evidence
 */

import type { InvariantFn, ValidationContext, ValidationResult } from './artifact-validator.js';
import { fail, pass, warn } from './artifact-validator.js';

const PLACEHOLDER_RE = /\b(TODO|FIXME|TBD|asdf|xxxxx)\b/i;
const MARKDOWN_RE = /[*_~`]/;

function flattenStrings(obj: unknown, path = ''): Array<{ value: string; path: string }> {
    const result: Array<{ value: string; path: string }> = [];
    if (typeof obj === 'string') {
        result.push({ value: obj, path });
    } else if (Array.isArray(obj)) {
        for (const [i, item] of obj.entries()) {
            result.push(...flattenStrings(item, `${path}[${i}]`));
        }
    } else if (obj !== null && typeof obj === 'object') {
        for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
            result.push(...flattenStrings(val, path ? `${path}.${key}` : key));
        }
    }
    return result;
}

export const invariantNoPlaceholder: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const results: ValidationResult[] = [];
    const strings = flattenStrings(artifact);
    for (const entry of strings) {
        if (PLACEHOLDER_RE.test(entry.value)) {
            results.push(
                fail('I-01', `String contains placeholder text at "${entry.path}": "${entry.value}"`, entry.path),
            );
        }
    }
    if (results.length === 0) {
        results.push(pass('I-01', 'No placeholder text found'));
    }
    return results;
};

export const invariantNoMarkdown: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const results: ValidationResult[] = [];
    const strings = flattenStrings(artifact);
    for (const entry of strings) {
        if (MARKDOWN_RE.test(entry.value)) {
            results.push(
                warn('I-02', `String may contain markdown characters at "${entry.path}": "${entry.value}"`, entry.path),
            );
        }
    }
    if (results.length === 0) {
        results.push(pass('I-02', 'No markdown characters found'));
    }
    return results;
};

export const invariantEvidenceExists: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const results: ValidationResult[] = [];
    const strings = flattenStrings(artifact);
    const evidenceFields = strings.filter((s) => s.path.endsWith('evidence') || s.path.includes('evidence['));
    const inputLower = context.inputRaw.toLowerCase();

    for (const ev of evidenceFields) {
        const trimmed = ev.value.trim();
        if (trimmed.length < 5) continue;
        if (!inputLower.includes(trimmed.toLowerCase().slice(0, 60))) {
            results.push(
                warn('I-03', `Evidence "${trimmed.slice(0, 80)}" at "${ev.path}" was not found in input`, ev.path),
            );
        }
    }
    if (results.length === 0) {
        results.push(pass('I-03', 'All evidence references verified against input'));
    }
    return results;
};

export const invariantNoEmptyStrings: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const results: ValidationResult[] = [];
    const strings = flattenStrings(artifact);
    for (const entry of strings) {
        if (entry.value.trim() === '') {
            results.push(fail('I-04', `Empty string at "${entry.path}"`, entry.path));
        }
    }
    if (results.length === 0) {
        results.push(pass('I-04', 'No empty strings found'));
    }
    return results;
};

export const invariantConclusionHasEvidence: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const results: ValidationResult[] = [];
    const strings = flattenStrings(artifact);

    const conclusionFields = strings.filter(
        (s) =>
            s.path.endsWith('summary') ||
            s.path.endsWith('recommendation') ||
            s.path.endsWith('description') ||
            s.path.endsWith('expectedResult') ||
            s.path.endsWith('actualResult'),
    );

    const hasEvidence = strings.some((s) => s.path.endsWith('evidence') || s.path.includes('evidence['));

    if (conclusionFields.length > 0 && !hasEvidence) {
        results.push(warn('I-05', 'Artifact has conclusion fields but no evidence array'));
    } else {
        results.push(pass('I-05', 'Evidence present for conclusions'));
    }
    return results;
};
