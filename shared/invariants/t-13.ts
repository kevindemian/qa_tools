import type { InvariantFn, ValidationContext, ValidationResult } from '../validation/artifact-validator.js';
import { pass, fail, warn } from '../validation/artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';
import { tokenize, jaccardSimilarity, normalizeText, similarity } from './text-utils.js';
import { testCoupling } from './resource-utils.js';

interface PairAnalysis {
    errorPairs: string[];
    warningPairs: string[];
}

function compareTestPair(a: TestCaseShape, b: TestCaseShape, i: number, j: number, analysis: PairAnalysis): void {
    const stepsA = (a.steps || []).join(' ');
    const stepsB = (b.steps || []).join(' ');
    const tokensA = new Set(tokenize(stepsA));
    const tokensB = new Set(tokenize(stepsB));
    const stepOverlap = jaccardSimilarity(tokensA, tokensB);
    const titleResultA = normalizeText(a.title + ' ' + a.expectedResult);
    const titleResultB = normalizeText(b.title + ' ' + b.expectedResult);
    const titleResultSim = similarity(titleResultA, titleResultB);
    const stepsRedundant = stepOverlap >= 0.7;
    const titleResultDupe = titleResultSim >= 0.85;

    if (stepsRedundant && titleResultDupe) {
        analysis.errorPairs.push(
            `test[${i}] ↔ test[${j}] (steps ${(stepOverlap * 100).toFixed(0)}%, title+result ${(titleResultSim * 100).toFixed(0)}%)`,
        );
        return;
    }
    if (stepsRedundant) {
        analysis.warningPairs.push(
            `test[${i}] ↔ test[${j}] steps ${(stepOverlap * 100).toFixed(0)}% similar (consider merge if only data differs)`,
        );
    }
    checkCoverageOverlap(a, b, i, j, analysis);
    checkCoupling(stepsA, stepsB, i, j, analysis);
}

function checkCoverageOverlap(a: TestCaseShape, b: TestCaseShape, i: number, j: number, analysis: PairAnalysis): void {
    const covIdsA = new Set((a.coverage || []).map((c) => c.criterionId));
    const covIdsB = new Set((b.coverage || []).map((c) => c.criterionId));
    if (covIdsA.size > 0 && covIdsB.size > 0) {
        const covOverlap = jaccardSimilarity(covIdsA, covIdsB);
        if (covOverlap >= 0.75) {
            analysis.warningPairs.push(
                `test[${i}] ↔ test[${j}] coverage ${(covOverlap * 100).toFixed(0)}% overlapping`,
            );
        }
    }
}

function checkCoupling(stepsA: string, stepsB: string, i: number, j: number, analysis: PairAnalysis): void {
    if (testCoupling(stepsA, stepsB)) {
        analysis.warningPairs.push(`test[${i}] ↔ test[${j}] coupled (create/delete shared resource)`);
    }
}

function buildResults(analysis: PairAnalysis): ValidationResult[] {
    const results: ValidationResult[] = [];
    if (analysis.errorPairs.length > 0) {
        results.push(
            fail(
                'T-13',
                `Found ${analysis.errorPairs.length} structurally identical test pair(s): ${analysis.errorPairs.join('; ')}. Merge or differentiate. (GOVERNANCE.md §10.1)`,
            ),
        );
    }
    for (const msg of analysis.warningPairs) {
        results.push(warn('T-13', msg));
    }
    if (results.length === 0) {
        return [pass('T-13', 'No redundancy, overlap, or coupling detected')];
    }
    return results;
}

export const invariantRedundancyCoupling: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length < 2) return [pass('T-13', 'Fewer than 2 tests — no redundancy possible')];
    const analysis: PairAnalysis = { errorPairs: [], warningPairs: [] };
    for (let i = 0; i < tests.length; i++) {
        for (let j = i + 1; j < tests.length; j++) {
            compareTestPair(Reflect.get(tests, i), Reflect.get(tests, j), i, j, analysis);
        }
    }
    return buildResults(analysis);
};
