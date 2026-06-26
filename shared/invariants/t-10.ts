import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, warn } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';
import { similarity } from './text-utils.js';

export const invariantNoDuplicateTests: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length < 2) return [pass('T-10', 'Fewer than 2 tests — no duplicates possible')];
    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < tests.length; i++) {
        for (let j = i + 1; j < tests.length; j++) {
            const a: TestCaseShape = Reflect.get(tests, i);
            const b: TestCaseShape = Reflect.get(tests, j);
            const sim = similarity(
                (a.steps || []).join(' '),
                (b.steps || []).join(' '),
            );
            if (sim > 0.8) {
                pairs.push([i, j, Math.round(sim * 100)]);
            }
        }
    }
    if (pairs.length > 0) {
        return [
            warn(
                'T-10',
                `Found ${pairs.length} highly similar test pair(s): ${pairs.map(([i, j, s]) => `test[${i}] ↔ test[${j}] (${s}% similarity)`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-10', 'No duplicate test scenarios found')];
};
