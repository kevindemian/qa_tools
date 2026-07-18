import type { InvariantFn, ValidationContext, ValidationResult } from '../validation/artifact-validator.js';
import { pass, fail } from '../validation/artifact-validator.js';
import { parseTests, extractCriteria } from './types.js';

function collectCoveredCriteria(tests: ReturnType<typeof parseTests>, criteria: string[]): Set<string> {
    const covered = new Set<string>();
    for (const test of tests) {
        if (test.coverage) {
            for (const c of test.coverage) {
                covered.add(c.criterionId);
                covered.add(c.criterionText.toLowerCase());
            }
        }
        if (test.title) {
            for (const c of criteria) {
                if (test.title.toLowerCase().includes(c.toLowerCase())) {
                    covered.add(c.toLowerCase());
                }
            }
        }
    }
    return covered;
}

function findUncovered(criteria: string[], covered: Set<string>): string[] {
    return criteria.filter((c) => !Array.from(covered).some((cc) => cc.includes(c) || c.includes(cc)));
}

export const invariantCoverageComplete: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const criteria = extractCriteria(context.inputRaw);
    if (criteria.length === 0) return [pass('T-01', 'No criteria found in input to cross-reference')];

    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-01', 'No tests found to cross-reference against criteria')];

    const criteriaLower = criteria.map((c) => c.toLowerCase());
    const covered = collectCoveredCriteria(tests, criteria);
    const uncovered = findUncovered(criteriaLower, covered);

    if (uncovered.length > 0) {
        return [fail('T-01', `Uncovered acceptance criteria: ${uncovered.join(', ')}`)];
    }
    return [pass('T-01', 'All acceptance criteria are covered by at least one test')];
};
