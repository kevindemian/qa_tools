import type { InvariantFn, ValidationContext, ValidationResult } from '../validation/artifact-validator.js';
import { pass, fail, warn } from '../validation/artifact-validator.js';
import { parseTests } from './types.js';
import { detectNumericRange } from './numeric.js';

export const invariantPartitionCoverage: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const range = detectNumericRange(context.inputRaw);
    if (!range) return [pass('T-11', 'No numeric range detected — partition coverage not applicable')];
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-11', 'No tests found — cannot verify partition coverage')];
    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');
    const { min, max } = range;
    const validPartitionCovered = new RegExp('\\b' + min + '\\b|\\b' + max + '\\b', 'i').test(allText);
    const belowMinCovered =
        new RegExp('\\b' + (min - 1) + '\\b', 'i').test(allText) || /below|less than|under/i.test(allText);
    const aboveMaxCovered =
        new RegExp('\\b' + (max + 1) + '\\b', 'i').test(allText) || /above|greater than|over|exceed/i.test(allText);
    const missing: string[] = [];
    if (!validPartitionCovered) missing.push('valid range (' + min + '-' + max + ')');
    if (!belowMinCovered) missing.push('below minimum (' + (min - 1) + ')');
    if (!aboveMaxCovered) missing.push('above maximum (' + (max + 1) + ')');
    if (missing.length > 0) {
        return [
            warn(
                'T-11',
                'Missing partition coverage for: ' +
                    missing.join(', ') +
                    '. (ISO 29119-4: each partition must have ≥1 test)',
            ),
        ];
    }
    return [pass('T-11', 'All equivalence partitions covered: valid range, below min, above max')];
};
