import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';

export const invariantUniqueTitles: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-06', 'No tests to validate')];

    const seen = new Map<string, number[]>();
    for (let i = 0; i < tests.length; i++) {
        const title = ((tests[i] as TestCaseShape).title || '').toLowerCase().trim();
        if (!title) continue;
        const existing = seen.get(title) || [];
        existing.push(i);
        seen.set(title, existing);
    }

    const duplicates = Array.from(seen.entries()).filter(([, indices]) => indices.length > 1);
    if (duplicates.length > 0) {
        return [
            fail(
                'T-06',
                `Duplicate titles found: ${duplicates.map(([title, indices]) => `"${title}" at indices [${indices.join(',')}]`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-06', 'All test titles are unique')];
};
