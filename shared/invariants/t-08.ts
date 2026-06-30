import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail, warn } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';

export const invariantResultMatchesAction: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-08', 'No tests to validate')];
    const mismatches: Array<{ testIndex: number; action: string; expected: string }> = [];
    for (let i = 0; i < tests.length; i++) {
        const test: TestCaseShape = Reflect.get(tests, i);
        const steps = test.steps || [];
        const expected = test.expectedResult || '';
        const stepsText = steps.join(' ');
        const createMatch = /\b(create|register|add|new)\b/i.exec(stepsText);
        const updateMatch = /\b(update|edit|modify|change|save)\b/i.exec(stepsText);
        const deleteMatch = /\b(delete|remove|destroy|erase)\b/i.exec(stepsText);
        if (createMatch && !/\b(created|id|new|confirmation|success)\b/i.test(expected)) {
            mismatches.push({ testIndex: i, action: 'create', expected });
        } else if (updateMatch && !/\b(updated|changed|modified|success|confirmation)\b/i.test(expected)) {
            mismatches.push({ testIndex: i, action: 'update', expected });
        } else if (
            deleteMatch &&
            !/\b(removed|deleted|gone|no longer|disappeared|success|confirmation)\b/i.test(expected)
        ) {
            mismatches.push({ testIndex: i, action: 'delete', expected });
        }
    }
    if (mismatches.length > 0) {
        return [
            warn(
                'T-08',
                `${mismatches.length} test(s) have expectedResult that may not match action: ${mismatches.map((m) => `test[${m.testIndex}] action=${m.action}`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-08', 'All expectedResults match their actions')];
};
