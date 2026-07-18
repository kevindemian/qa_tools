import type { InvariantFn, ValidationContext, ValidationResult } from '../validation/artifact-validator.js';
import { pass, warn } from '../validation/artifact-validator.js';
import { parseTests } from './types.js';

const MUTATION_KEYWORDS = /\b(create|update|delete|post|put|patch|register|remove|add|edit|save)\b/i;

export const invariantStateMutation: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const hasMutation = MUTATION_KEYWORDS.test(context.inputRaw);
    if (!hasMutation) return [pass('T-03', 'No state mutation keywords detected in input')];

    const tests = parseTests(artifact);
    const testsWithMutation = tests.filter((t) => {
        const stepsText = (t.steps || []).join(' ');
        return MUTATION_KEYWORDS.test(stepsText);
    });

    if (testsWithMutation.length < 2) {
        return [
            warn(
                'T-03',
                `Input has mutation keywords but only ${testsWithMutation.length} test(s) cover mutation (expected ≥ 2 for before/after)`,
            ),
        ];
    }
    return [pass('T-03', `State mutation covered by ${testsWithMutation.length} tests (before + after)`)];
};
