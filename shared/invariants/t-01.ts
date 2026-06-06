import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';
import { parseTests, extractCriteria } from './types.js';

export const invariantCoverageComplete: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const criteria = extractCriteria(context.inputRaw);
    if (criteria.length === 0) return [pass('T-01', 'No criteria found in input to cross-reference')];

    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-01', 'No tests found to cross-reference against criteria')];

    const coveredCriteria = new Set<string>();
    for (const test of tests) {
        if (test.coverage) {
            for (const c of test.coverage) {
                coveredCriteria.add(c.criterionId);
                coveredCriteria.add(c.criterionText.toLowerCase());
            }
        }
        if (test.title) {
            for (const c of criteria) {
                if (test.title.toLowerCase().includes(c.toLowerCase())) {
                    coveredCriteria.add(c.toLowerCase());
                }
            }
        }
    }

    const criteriaLower = criteria.map((c) => c.toLowerCase());
    const uncovered = criteriaLower.filter((c) => {
        const found = Array.from(coveredCriteria).some((cc) => cc.includes(c) || c.includes(cc));
        return !found;
    });

    if (uncovered.length > 0) {
        return [fail('T-01', `Uncovered acceptance criteria: ${uncovered.join(', ')}`)];
    }
    return [pass('T-01', 'All acceptance criteria are covered by at least one test')];
};
