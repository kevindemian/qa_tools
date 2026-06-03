/**
 * TestCaseValidator — domain invariants for LLM-generated test suites.
 *
 * Invariants implemented:
 *   T-01  Each acceptance criterion → at least 1 test case
 *   T-02  Coverage ≥ 90% OR gap has reason
 *   T-03  State mutation → before + after tests
 *   T-04  Steps are concrete actions (no passive voice)
 *   T-05  expectedResult is verifiable (no vague language)
 *   T-06  All test titles are unique
 *   T-07  preConditions is non-empty for each test
 *   T-08  expectedResult matches the action (create/update/delete)
 *   T-09  Numeric data consistency (items_count vs items array)
 *   T-10  No duplicate test scenarios (high similarity)
 *   T-11  Equivalence partitions covered (ISO 29119-4, ISTQB CTFL)
 *   T-12  Boundary values tested (ISO 29119-4, ISTQB CTFL)
 *   T-13  No redundancy, overlap, or coupling between tests
 *         (GOVERNANCE.md §10.1-10.3 — 4 sub-checks: steps redundancy,
 *         coverage overlap, resource coupling, title+result duplication)
 */

import {
    ArtifactValidator,
    type InvariantFn,
    type ValidationContext,
    type ValidationResult,
    fail,
    pass,
    warn,
} from './artifact-validator';
import {
    invariantNoPlaceholder,
    invariantNoMarkdown,
    invariantEvidenceExists,
    invariantNoEmptyStrings,
    invariantConclusionHasEvidence,
} from './shared-invariants';

const PASSIVE_STEP_RE = /^(validate that|check if|ensure that|verificar se|validar se|confirm that)/i;
const VAGUE_RESULT_RE =
    /(funcionar|corretamente|ok|should work|must be|deveria funcionar|funciona|funcionou|está certo)/i;
const MUTATION_KEYWORDS = /\b(create|update|delete|post|put|patch|register|remove|add|edit|save)\b/i;

interface TestCaseShape {
    title?: string;
    steps?: string[];
    expectedResult?: string;
    preConditions?: unknown[];
    coverage?: Array<{ criterionId: string; criterionText: string }>;
}

function parseTests(artifact: unknown): TestCaseShape[] {
    if (typeof artifact !== 'object' || artifact === null) return [];
    const obj = artifact as Record<string, unknown>;
    if (Array.isArray(obj)) return obj as TestCaseShape[];
    if (Array.isArray(obj.tests)) return obj.tests as TestCaseShape[];
    return [];
}

/** T-01: Each acceptance criterion in input → at least 1 test covering it. */
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

/** Extract acceptance criteria from input text. */
function extractCriteria(input: string): string[] {
    const lines = input.split('\n');
    const criteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (/^(acceptance\s*criteria|scenarios|cenarios|criteria|criterion):/i.test(trimmed)) {
            inCriteria = true;
            const afterPrefix = trimmed.replace(/^[^:]+:\s*/, '');
            if (afterPrefix) criteria.push(afterPrefix);
            continue;
        }
        if (inCriteria) {
            if (
                /^(given|when|then|scenario|test|cenario|given that)/i.test(trimmed) ||
                trimmed.startsWith('-') ||
                trimmed.startsWith('*') ||
                /^\d+[.)]/.test(trimmed)
            ) {
                const cleaned = trimmed.replace(/^[-*\d.)\s]+/, '');
                if (cleaned) criteria.push(cleaned);
            } else if (trimmed === '' || /^(user story|description|acceptance|scenarios)/i.test(trimmed)) {
                inCriteria = false;
            }
        }
    }
    return criteria.length > 0 ? criteria : extractFallback(input);
}

function extractFallback(input: string): string[] {
    return input
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !l.startsWith('#') && !l.startsWith('//'))
        .slice(0, 20);
}

/** T-02: Coverage < 90% requires justified gap. */
export const invariantCoverageThreshold: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    if (typeof artifact !== 'object' || artifact === null) return [fail('T-02', 'Artifact is not an object')];

    const obj = artifact as Record<string, unknown>;
    if (Array.isArray(obj)) return [pass('T-02', 'Array artifact has no coverage table — skipping')];

    const coverageTable = obj.coverageTable as Record<string, unknown> | undefined;
    if (!coverageTable) return [warn('T-02', 'No coverageTable found in artifact')];

    const coverage = coverageTable.coverage as number | undefined;
    if (coverage === undefined || coverage < 0) return [fail('T-02', 'coverageTable.coverage must be a valid number')];

    if (coverage >= 90) return [pass('T-02', `Coverage is ${coverage}% — meets threshold`)];
    const gaps = coverageTable.gaps as Array<Record<string, unknown>> | undefined;
    if (!gaps || gaps.length === 0) {
        return [fail('T-02', `Coverage is ${coverage}% (< 90%) but no gaps array with reasons provided`)];
    }
    const missingReasons = gaps.filter((g) => !g.reason || typeof g.reason !== 'string' || g.reason.trim() === '');
    if (missingReasons.length > 0) {
        return [fail('T-02', `Coverage is ${coverage}% but ${missingReasons.length} gap(s) missing reason`)];
    }
    return [pass('T-02', `Coverage is ${coverage}% with ${gaps.length} justified gap(s)`)];
};

/** T-03: State mutation → two tests: before + after state verification. */
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

/** T-04: Steps are concrete actions (no passive voice, no vague verbs). */
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

/** T-05: expectedResult is verifiable (no vague language). */
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

/** T-06: All test titles are unique. */
export const invariantUniqueTitles: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-06', 'No tests to validate')];

    const seen = new Map<string, number[]>();
    for (let i = 0; i < tests.length; i++) {
        const title = ((tests[i] as TestCaseShape).title || '').toLowerCase().trim();
        if (!title) continue;
        const existing = seen.get(title) || [];
        existing.push(i);
        seen.set(title, existing);
    }

    const duplicates = Array.from(seen.entries()).filter(([, indices]) => indices.length > 1);
    if (duplicates.length > 0) {
        return [
            fail(
                'T-06',
                `Duplicate titles found: ${duplicates.map(([title, indices]) => `"${title}" at indices [${indices.join(',')}]`).join('; ')}`,
            ),
        ];
    }
    return [pass('T-06', 'All test titles are unique')];
};

/** T-07: Each test has at least 1 preCondition. */
export const invariantPreconditionsExist: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-07', 'No tests to validate')];

    const withoutPreconditions: number[] = [];
    for (let i = 0; i < tests.length; i++) {
        const pre = (tests[i] as TestCaseShape).preConditions;
        if (!pre || pre.length === 0) {
            withoutPreconditions.push(i);
        }
    }

    if (withoutPreconditions.length > 0) {
        return [fail('T-07', `Tests without preConditions at indices: [${withoutPreconditions.join(',')}]`)];
    }
    return [pass('T-07', 'All tests have preConditions')];
};

/** T-08: expectedResult matches the action type (create/update/delete). */
export const invariantResultMatchesAction: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-08', 'No tests to validate')];

    const mismatches: Array<{ testIndex: number; action: string; expected: string }> = [];

    for (let i = 0; i < tests.length; i++) {
        const steps = (tests[i] as TestCaseShape).steps || [];
        const expected = (tests[i] as TestCaseShape).expectedResult || '';
        const stepsText = steps.join(' ');

        const createMatch = stepsText.match(/\b(create|register|add|new)\b/i);
        const updateMatch = stepsText.match(/\b(update|edit|modify|change|save)\b/i);
        const deleteMatch = stepsText.match(/\b(delete|remove|destroy|erase)\b/i);

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

/** T-09: Numeric data consistency check. */
export const invariantNumericConsistency: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    if (typeof artifact !== 'object' || artifact === null)
        return [pass('T-09', 'No numeric consistency check applicable')];

    const obj = artifact as Record<string, unknown>;
    const numericKeys = Object.keys(obj).filter((k) => /count|total|size|num|number_of/i.test(k));
    if (numericKeys.length === 0) return [pass('T-09', 'No numeric fields to validate')];

    for (const key of numericKeys) {
        const value = obj[key];
        if (typeof value !== 'number') continue;
        const arrayKey = key.replace(/count|_count|total|_total|num_|number_of_/i, '').replace(/_$/, '') + 's';
        const array = obj[arrayKey] as unknown[] | undefined;
        if (Array.isArray(array) && array.length !== value) {
            return [fail('T-09', `Field "${key}" = ${value} but "${arrayKey}" has ${array.length} elements`)];
        }
    }
    return [pass('T-09', 'Numeric data consistent')];
};

/** T-10: No duplicate test scenarios (Levenshtein similarity). */
export const invariantNoDuplicateTests: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    const tests = parseTests(artifact);
    if (tests.length < 2) return [pass('T-10', 'Fewer than 2 tests — no duplicates possible')];

    const pairs: Array<[number, number, number]> = [];
    for (let i = 0; i < tests.length; i++) {
        for (let j = i + 1; j < tests.length; j++) {
            const sim = similarity(
                ((tests[i] as TestCaseShape).steps || []).join(' '),
                ((tests[j] as TestCaseShape).steps || []).join(' '),
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

/** Simple Levenshtein-based similarity ratio. */
function similarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const edits = levenshtein(longer, shorter);
    return (longer.length - edits) / longer.length;
}

function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        const row0 = matrix[0] as number[];
        row0[j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            const cost = a[j - 1] === b[i - 1] ? 0 : 1;
            const row = matrix[i] as number[];
            const rowPrev = matrix[i - 1] as number[];
            row[j] = Math.min(
                (rowPrev[j] as number) + 1,
                (row[j - 1] as number) + 1,
                (rowPrev[j - 1] as number) + cost,
            );
        }
    }
    const lastRow = matrix[b.length] as number[];
    return lastRow[a.length] as number;
}

/**
 * Regex patterns to detect numeric ranges in test input criteria.
 * Examples: "ages between 18 and 65", "password 6 to 30 chars", "range 1-100"
 */
const RANGE_PATTERN = /(\d+)\s*(?:and|to|-|through)\s*(\d+)/i;

/**
 * Detect numeric range metadata from input text for boundary/partition validation.
 * Returns null if no range found.
 */
function detectNumericRange(input: string): { min: number; max: number } | null {
    const match = RANGE_PATTERN.exec(input);
    if (match) {
        const min = parseInt(match[1] as string, 10);
        const max = parseInt(match[2] as string, 10);
        if (!isNaN(min) && !isNaN(max) && min < max) {
            return { min, max };
        }
    }
    return null;
}

/**
 * T-11: Equivalence partitions covered (ISO 29119-4 §8.3, ISTQB CTFL §4.3.1).
 * Divides input domain into valid and invalid partitions — each must have ≥1 test case.
 * Checks: below min (invalid), within range (valid), above max (invalid).
 */
export const invariantPartitionCoverage: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const range = detectNumericRange(context.inputRaw);
    if (!range) return [pass('T-11', 'No numeric range detected — partition coverage not applicable')];

    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-11', 'No tests found — cannot verify partition coverage')];

    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');

    const validPartitionCovered = new RegExp('\\b' + range.min + '\\b|\\b' + range.max + '\\b', 'i').test(allText);
    const { min, max } = range;
    const belowMinCovered =
        new RegExp('\\b' + (min - 1) + '\\b', 'i').test(allText) || /below|less than|under/i.test(allText);
    const aboveMaxCovered =
        new RegExp('\\b' + (max + 1) + '\\b', 'i').test(allText) || /above|greater than|over|exceed/i.test(allText);

    const missing: string[] = [];
    if (!validPartitionCovered) missing.push('valid range (' + min + '-' + max + ')');
    if (!belowMinCovered) missing.push('below minimum (' + (min - 1) + ')');
    if (!aboveMaxCovered) missing.push('above maximum (' + (max + 1) + ')');

    if (missing.length > 0) {
        return [
            warn(
                'T-11',
                'Missing partition coverage for: ' +
                    missing.join(', ') +
                    '. (ISO 29119-4: each partition must have ≥1 test)',
            ),
        ];
    }
    return [pass('T-11', 'All equivalence partitions covered: valid range, below min, above max')];
};

/**
 * T-12: Boundary values tested (ISO 29119-4 §8.4, ISTQB CTFL §4.3.2).
 * Uses 2-value BVA by default: tests value at boundary and one neighbor from adjacent partition.
 * Checks: min, max, min-1, max+1 boundary values.
 */
export const invariantBoundaryCoverage: InvariantFn = (
    artifact: unknown,
    context: ValidationContext,
): ValidationResult[] => {
    const range = detectNumericRange(context.inputRaw);
    if (!range) return [pass('T-12', 'No numeric range detected — boundary coverage not applicable')];

    const tests = parseTests(artifact);
    if (tests.length === 0) return [fail('T-12', 'No tests found — cannot verify boundary coverage')];

    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');

    const { min, max } = range;
    const expectedBoundaries = [min, max, min - 1, max + 1];
    const missing: number[] = [];

    for (const b of expectedBoundaries) {
        const re = new RegExp('\\b' + b + '\\b');
        if (!re.test(allText)) {
            missing.push(b);
        }
    }

    if (missing.length > 0) {
        const covered = expectedBoundaries.length - missing.length;
        return [
            warn(
                'T-12',
                'Missing ' +
                    missing.length +
                    ' of ' +
                    expectedBoundaries.length +
                    ' boundary values: [' +
                    missing.join(', ') +
                    ']. ' +
                    'Covered ' +
                    covered +
                    '/' +
                    expectedBoundaries.length +
                    '. (ISO 29119-4 BVA: test min, max, min-1, max+1)',
            ),
        ];
    }
    return [
        pass(
            'T-12',
            'All boundary values covered: min=' +
                min +
                ', max=' +
                max +
                ', min-1=' +
                (min - 1) +
                ', max+1=' +
                (max + 1),
        ),
    ];
};

// ---- T-13: Redundancy / Overlap / Coupling ----

const STOP_WORDS = new Set([
    'a',
    'an',
    'the',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'each',
    'every',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'because',
    'if',
    'then',
    'else',
    'when',
    'where',
    'why',
    'how',
    'which',
    'who',
    'whom',
    'what',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    'o',
    'a',
    'e',
    'em',
    'para',
    'com',
    'por',
    'de',
    'do',
    'da',
    'dos',
    'das',
    'no',
    'na',
    'nos',
    'nas',
    'um',
    'uma',
    'uns',
    'umas',
]);

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    if (union.size === 0) return 1;
    return intersection.size / union.size;
}

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .trim();
}

/**
 * T-13: No redundant, overlapping, or coupled tests (GOVERNANCE.md §10.1-10.3).
 *
 * Sub-checks:
 *   A — Steps token overlap ≥ 80% → error (if also D) or warning
 *   B — Coverage criterionId Jaccard ≥ 75% → warning (overlap)
 *   C — Coupled via shared resource → warning
 *   D — Title+expectedResult Levenshtein ≥ 85% → error (if also A)
 */
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
            const a = tests[i] as TestCaseShape;
            const b = tests[j] as TestCaseShape;

            const stepsA = (a.steps || []).join(' ');
            const stepsB = (b.steps || []).join(' ');

            const tokensA = new Set(tokenize(stepsA));
            const tokensB = new Set(tokenize(stepsB));
            const stepOverlap = jaccardSimilarity(tokensA, tokensB);

            const titleResultA = normalizeText((a.title || '') + ' ' + (a.expectedResult || ''));
            const titleResultB = normalizeText((b.title || '') + ' ' + (b.expectedResult || ''));
            const titleResultSim = similarity(titleResultA, titleResultB);

            // Sub-check A: steps redundancy (token overlap ≥ 70%)
            const stepsRedundant = stepOverlap >= 0.7;

            // Sub-check D: title+result duplication (Levenshtein ≥ 85%)
            const titleResultDupe = titleResultSim >= 0.85;

            // Decision: A + D → error (structurally identical)
            if (stepsRedundant && titleResultDupe) {
                errorPairs.push(
                    `test[${i}] ↔ test[${j}] (steps ${(stepOverlap * 100).toFixed(0)}%, title+result ${(titleResultSim * 100).toFixed(0)}%)`,
                );
                continue;
            }

            // A only → warning (possible redundancy)
            if (stepsRedundant) {
                warningPairs.push(
                    `test[${i}] ↔ test[${j}] steps ${(stepOverlap * 100).toFixed(0)}% similar (consider merge if only data differs)`,
                );
            }

            // Sub-check B: coverage overlap (Jaccard ≥ 75%)
            const covIdsA = new Set((a.coverage || []).map((c) => c.criterionId));
            const covIdsB = new Set((b.coverage || []).map((c) => c.criterionId));
            if (covIdsA.size > 0 && covIdsB.size > 0) {
                const covOverlap = jaccardSimilarity(covIdsA, covIdsB);
                if (covOverlap >= 0.75) {
                    warningPairs.push(`test[${i}] ↔ test[${j}] coverage ${(covOverlap * 100).toFixed(0)}% overlapping`);
                }
            }

            // Sub-check C: resource coupling detection
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

const CREATE_RESOURCE_RE = /\b(?:create|register|new|criar|registrar|adicionar)\s+(\w+)/i;
const DELETE_RESOURCE_RE = /\b(?:delete|remove|destroy|erase|excluir|remover|deletar)\s+(\w+)/i;
const COMMON_WORDS = new Set([
    'fill',
    'form',
    'page',
    'link',
    'item',
    'list',
    'view',
    'edit',
    'save',
    'cancel',
    'submit',
    'formulario',
    'dados',
    'nome',
    'email',
    'senha',
    'valor',
    'arquivo',
]);

function extractCreateResource(text: string): string | null {
    const match = CREATE_RESOURCE_RE.exec(text);
    const name = match?.[1];
    if (name && !COMMON_WORDS.has(name.toLowerCase())) return name;
    return null;
}

function extractDeleteResource(text: string): string | null {
    const match = DELETE_RESOURCE_RE.exec(text);
    const name = match?.[1];
    if (name && !COMMON_WORDS.has(name.toLowerCase())) return name;
    return null;
}

/** Check if stepsA creates a resource that stepsB deletes (or vice-versa). */
function testCoupling(stepsA: string, stepsB: string): boolean {
    const created = extractCreateResource(stepsA);
    const deleted = extractDeleteResource(stepsB);
    if (created && deleted && created.toLowerCase() === deleted.toLowerCase()) return true;
    const createdB = extractCreateResource(stepsB);
    const deletedA = extractDeleteResource(stepsA);
    if (createdB && deletedA && createdB.toLowerCase() === deletedA.toLowerCase()) return true;
    return false;
}

/** Create a pre-configured TestCaseValidator with all invariants registered. */
export function createTestCaseValidator(): ArtifactValidator<unknown> {
    const validator = new ArtifactValidator<unknown>('test-suite');

    // Shared invariants (I-01 to I-05)
    validator.addInvariant('I-01', invariantNoPlaceholder);
    validator.addInvariant('I-02', invariantNoMarkdown);
    validator.addInvariant('I-03', invariantEvidenceExists);
    validator.addInvariant('I-04', invariantNoEmptyStrings);
    validator.addInvariant('I-05', invariantConclusionHasEvidence);

    // Domain invariants (T-01 to T-13)
    validator.addInvariant('T-01', invariantCoverageComplete);
    validator.addInvariant('T-02', invariantCoverageThreshold);
    validator.addInvariant('T-03', invariantStateMutation);
    validator.addInvariant('T-04', invariantConcreteSteps);
    validator.addInvariant('T-05', invariantVerifiableResult);
    validator.addInvariant('T-06', invariantUniqueTitles);
    validator.addInvariant('T-07', invariantPreconditionsExist);
    validator.addInvariant('T-08', invariantResultMatchesAction);
    validator.addInvariant('T-09', invariantNumericConsistency);
    validator.addInvariant('T-10', invariantNoDuplicateTests);
    validator.addInvariant('T-11', invariantPartitionCoverage);
    validator.addInvariant('T-12', invariantBoundaryCoverage);
    validator.addInvariant('T-13', invariantRedundancyCoupling);

    return validator;
}
