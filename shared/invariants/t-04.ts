import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';

const PASSIVE_STEP_RE = /^(validate that|check if|ensure that|verificar se|validar se|confirm that)/i;

export const invariantConcreteSteps: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-04', 'No tests to validate')];

    const violations: Array<{ testIndex: number; stepIndex: number; text: string }> = [];
    for (let i = 0; i < tests.length; i++) {
        const test = tests[i] as TestCaseShape;
        const steps = test.steps || [];
        for (let j = 0; j < steps.length; j++) {
            const step = steps[j] as string;
            if (PASSIVE_STEP_RE.test(step)) {
                violations.push({ testIndex: i, stepIndex: j, text: step });
            }
        }
    }

    if (violations.length > 0) {
        return [
            fail(
                'T-04',
                `Found ${violations.length} passive/vague step(s): ${violations.map((v) => `test[${v.testIndex}].steps[${v.stepIndex}]="${v.text.slice(0, 50)}..."`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-04', 'All steps are concrete actions')];
};
