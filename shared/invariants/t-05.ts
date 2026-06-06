import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';
import { parseTests, type TestCaseShape } from './types.js';

const VAGUE_RESULT_RE =
    /(funcionar|corretamente|ok|should work|must be|deveria funcionar|funciona|funcionou|está certo)/i;

export const invariantVerifiableResult: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-05', 'No tests to validate')];

    const vagueResults: Array<{ testIndex: number; text: string }> = [];
    for (let i = 0; i < tests.length; i++) {
        const er = (tests[i] as TestCaseShape).expectedResult || '';
        if (VAGUE_RESULT_RE.test(er)) {
            vagueResults.push({ testIndex: i, text: er });
        }
    }

    if (vagueResults.length > 0) {
        return [
            fail(
                'T-05',
                `Found ${vagueResults.length} vague expectedResult(s): ${vagueResults.map((v) => `test[${v.testIndex}]="${v.text.slice(0, 50)}..."`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-05', 'All expectedResults are verifiable')];
};
