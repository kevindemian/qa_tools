import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail, warn } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';
import { tokenize, jaccardSimilarity, normalizeText, similarity } from './text-utils.js';
import { testCoupling } from './resource-utils.js';

export const invariantRedundancyCoupling: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length < 2) return [pass('T-13', 'Fewer than 2 tests — no redundancy possible')];
    const results: ValidationResult[] = [];
    const errorPairs: string[] = [];
    const warningPairs: string[] = [];
    for (let i = 0; i < tests.length; i++) {
        for (let j = i + 1; j < tests.length; j++) {
            const a: TestCaseShape = Reflect.get(tests, i);
            const b: TestCaseShape = Reflect.get(tests, j);
            const stepsA = (a.steps || []).join(' ');
            const stepsB = (b.steps || []).join(' ');
            const tokensA = new Set(tokenize(stepsA));
            const tokensB = new Set(tokenize(stepsB));
            const stepOverlap = jaccardSimilarity(tokensA, tokensB);
            const titleResultA = normalizeText((a.title || '') + ' ' + (a.expectedResult || ''));
            const titleResultB = normalizeText((b.title || '') + ' ' + (b.expectedResult || ''));
            const titleResultSim = similarity(titleResultA, titleResultB);
            const stepsRedundant = stepOverlap >= 0.7;
            const titleResultDupe = titleResultSim >= 0.85;
            if (stepsRedundant && titleResultDupe) {
                errorPairs.push(
                    `test[${i}] ↔ test[${j}] (steps ${(stepOverlap * 100).toFixed(0)}%, title+result ${(titleResultSim * 100).toFixed(0)}%)`,
                );
                continue;
            }
            if (stepsRedundant) {
                warningPairs.push(
                    `test[${i}] ↔ test[${j}] steps ${(stepOverlap * 100).toFixed(0)}% similar (consider merge if only data differs)`,
                );
            }
            const covIdsA = new Set((a.coverage || []).map((c) => c.criterionId));
            const covIdsB = new Set((b.coverage || []).map((c) => c.criterionId));
            if (covIdsA.size > 0 && covIdsB.size > 0) {
                const covOverlap = jaccardSimilarity(covIdsA, covIdsB);
                if (covOverlap >= 0.75) {
                    warningPairs.push(`test[${i}] ↔ test[${j}] coverage ${(covOverlap * 100).toFixed(0)}% overlapping`);
                }
            }
            const coupled = testCoupling(stepsA, stepsB);
            if (coupled) {
                warningPairs.push(`test[${i}] ↔ test[${j}] coupled (create/delete shared resource)`);
            }
        }
    }
    if (errorPairs.length > 0) {
        results.push(
            fail(
                'T-13',
                `Found ${errorPairs.length} structurally identical test pair(s): ${errorPairs.join('; ')}. Merge or differentiate. (GOVERNANCE.md §10.1)`,
            ),
        );
    }
    if (warningPairs.length > 0) {
        for (const msg of warningPairs) {
            results.push(warn('T-13', msg));
        }
    }
    if (results.length === 0) {
        return [pass('T-13', 'No redundancy, overlap, or coupling detected')];
    }
    return results;
};
