import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';

export const invariantPreconditionsExist: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-07', 'No tests to validate')];

    const withoutPreconditions: number[] = [];
    for (let i = 0; i < tests.length; i++) {
        const test: TestCaseShape = Reflect.get(tests, i);
        const pre = test.preConditions;
        if (!pre || pre.length === 0) {
            withoutPreconditions.push(i);
        }
    }

    if (withoutPreconditions.length > 0) {
        return [fail('T-07', `Tests without preConditions at indices: [${withoutPreconditions.join(',')}]`)];
    }
    return [pass('T-07', 'All tests have preConditions')];
};
