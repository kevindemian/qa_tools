import type { InvariantFn, ValidationContext, ValidationResult } from '../validation/artifact-validator.js';
import { pass, fail, warn } from '../validation/artifact-validator.js';
import { parseTests } from './types.js';
import { detectNumericRange } from './numeric.js';

export const invariantBoundaryCoverage: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const range = detectNumericRange(context.inputRaw);
    if (!range) return [pass('T-12', 'No numeric range detected — boundary coverage not applicable')];
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-12', 'No tests found — cannot verify boundary coverage')];
    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');
    const { min, max } = range;
    const expectedBoundaries = [min, max, min - 1, max + 1];
    const missing: number[] = [];
    for (const b of expectedBoundaries) {
        const re = new RegExp('\\b' + b + '\\b');
        if (!re.test(allText)) {
            missing.push(b);
        }
    }
    if (missing.length > 0) {
        const covered = expectedBoundaries.length - missing.length;
        return [
            warn(
                'T-12',
                'Missing ' +
                    missing.length +
                    ' of ' +
                    expectedBoundaries.length +
                    ' boundary values: [' +
                    missing.join(', ') +
                    ']. ' +
                    'Covered ' +
                    covered +
                    '/' +
                    expectedBoundaries.length +
                    '. (ISO 29119-4 BVA: test min, max, min-1, max+1)',
            ),
        ];
    }
    return [
        pass(
            'T-12',
            'All boundary values covered: min=' +
                min +
                ', max=' +
                max +
                ', min-1=' +
                (min - 1) +
                ', max+1=' +
                (max + 1),
        ),
    ];
};
