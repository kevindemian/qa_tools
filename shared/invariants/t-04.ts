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
        const test: TestCaseShape = Reflect.get(tests, i);
        const steps = test.steps || [];
        for (let j = 0; j < steps.length; j++) {
            const step: string = Reflect.get(steps, j);
            if (PASSIVE_STEP_RE.test(step)) {
                violations.push({ testIndex: i, stepIndex: j, text: step });
            }
        }
    }

    if (violations.length > 0) {
        return [
            fail(
                'T-04',
                `Found ${violations.length} passive/vague step(s): ${violations
                    .map((v) => {
                        const step = `test[${v.testIndex}].steps[${v.stepIndex}]`;
                        const text = `"${v.text.slice(0, 50)}..."`;
                        return `${step}=${text}`;
                    })
                    .join('; ')}`,
            ),
        ];
    }
    return [pass('T-04', 'All steps are concrete actions')];
};
