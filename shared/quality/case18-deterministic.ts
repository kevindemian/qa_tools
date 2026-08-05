/**
 * Case18 Quality Evaluator — Camada 1 (Deterministic, rule-based)
 *
 * 100% deterministic checks for AI-generated test case quality.
 * Based on: ISTQB CTFL, ISO 29119-4, Project Kaleidoscope (arXiv:2607.14673).
 *
 * Metrics (weights sum to 100%):
 * 1. Coverage completeness (25%) — all acceptance criteria cited
 * 2. Step concreteness (20%) — imperative verbs, not vague
 * 3. Precondition specificity (15%) — specific, not generic
 * 4. BVA application (15%) — boundary tests for numeric ranges
 * 5. EP application (10%) — invalid partitions tested
 * 6. Evidence citations (10%) — non-empty evidence arrays
 * 7. Redundancy (5%) — no duplicate steps (Jaccard ≥ 80%)
 */
import type { GeneratedTestCase, DeterministicResult, MetricResult } from './case18-types.js';

/**
 * Dimension Provenance — documents the source and justification for each
 * weight and threshold (pattern mirrored from `requirement-score.ts`).
 */
export const CASE18_FLOOR_PROVENANCE = {
    weights: {
        coverage: {
            value: 0.25,
            source: 'ISTQB CTFL — requirement coverage as primary test design driver',
            standard: 'ISTQB',
        },
        stepConcreteness: {
            value: 0.2,
            source: 'ISO/IEC 29119-4 — test procedure step concreteness (executable, imperative)',
            standard: 'ISO/IEC 29119-4',
        },
        preconditionSpecificity: {
            value: 0.15,
            source: 'ISTQB CTFL — precondition identification as test design prerequisite',
            standard: 'ISTQB',
        },
        bvaApplication: {
            value: 0.15,
            source: 'ISTQB CTFL — Boundary Value Analysis technique',
            standard: 'ISTQB',
        },
        epApplication: {
            value: 0.1,
            source: 'ISTQB CTFL — Equivalence Partitioning technique',
            standard: 'ISTQB',
        },
        evidenceCitations: {
            value: 0.1,
            source: 'Kaleidoscope (arXiv:2607.14673) — evidence-grounded generation',
            standard: 'Kaleidoscope',
        },
        redundancy: {
            value: 0.05,
            source: 'SLR Test Case Quality (Barraood 2021) — minimality/absence of duplicates',
            standard: 'SLR',
        },
    },
    gradeThresholds: {
        A: { min: 90, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        B: { min: 75, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        C: { min: 60, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
        D: { min: 40, source: 'ISO/IEC 25010 product-quality grade bands', standard: 'ISO/IEC 25010' },
    },
} as const;

// Guard (Rule 24): provenance weights must sum to 1.0, else the evaluator is
// reporting an invalid score — fail loudly instead of silently under-scoring.
const _floorWeightSum = Object.values(CASE18_FLOOR_PROVENANCE.weights).reduce((s, w) => s + w.value, 0);
if (Math.abs(_floorWeightSum - 1.0) > 0.001) {
    throw new Error(`case18 floor: weights must sum to 1.0, got ${_floorWeightSum}`);
}

// --- Verb lists ---

const CONCRETE_VERBS = new Set([
    'click',
    'enter',
    'navigate',
    'submit',
    'select',
    'type',
    'press',
    'open',
    'close',
    'fill',
    'upload',
    'download',
    'scroll',
    'hover',
    'drag',
    'drop',
    'tap',
    'swipe',
    'toggle',
    'check',
    'uncheck',
    'wait',
    'reload',
    'refresh',
    'clear',
    'delete',
    'remove',
    'add',
    'create',
    'update',
    'save',
    'cancel',
    'confirm',
    'dismiss',
    'verify',
    'assert',
    'expect',
    'should',
    'must',
    'assert',
    'observe',
    'inspect',
    'examine',
    'review',
    'check',
]);

const VAGUE_STEP_VERBS = new Set([
    'validate',
    'ensure',
    'make sure',
    'confirm that',
    'check that',
    'verify that',
    'assert that',
    'test that',
    'ensure that',
]);

const GENERIC_PRECONDITIONS = new Set([
    'login setup',
    'user is logged in',
    'setup',
    'prerequisite',
    'test data',
    'initial state',
    'pre-condition',
    'logged in',
    'user logged in',
    'authentication',
    'auth setup',
]);

// --- Helpers ---

function tokenize(text: string): string[] {
    return text.toLowerCase().split(/\s+/).filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}

function containsVagueVerb(step: string): boolean {
    const lower = step.toLowerCase();
    return [...VAGUE_STEP_VERBS].some((v) => lower.includes(v));
}

function containsConcreteVerb(step: string): boolean {
    const lower = step.toLowerCase();
    return [...CONCRETE_VERBS].some((v) => lower.startsWith(v + ' ') || lower.includes(' ' + v + ' '));
}

function isGenericPrecondition(desc: string): boolean {
    const lower = desc.toLowerCase().trim();
    return [...GENERIC_PRECONDITIONS].some((g) => lower === g || lower.startsWith(g));
}

function detectNumericRanges(text: string): Array<{ min: number; max: number }> {
    const ranges: Array<{ min: number; max: number }> = [];
    // Match patterns like "18-65", "18 – 65", "between 18 and 65", "from 18 to 65"
    const patterns = [
        /(\d+)\s*[-–]\s*(\d+)/g,
        /between\s+(\d+)\s+and\s+(\d+)/gi,
        /from\s+(\d+)\s+to\s+(\d+)/gi,
        /range\s+(\d+)\s*[-–]\s*(\d+)/gi,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const min = parseInt(match[1] ?? '0', 10);
            const max = parseInt(match[2] ?? '0', 10);
            if (min < max && max - min < 1000) {
                ranges.push({ min, max });
            }
        }
    }
    return ranges;
}

function extractNumbers(text: string): number[] {
    const nums: number[] = [];
    const matches = text.match(/\d+/g);
    if (matches) {
        for (const m of matches) {
            nums.push(parseInt(m, 10));
        }
    }
    return nums;
}

// --- Metric evaluators ---

function evaluateCoverage(testCases: GeneratedTestCase[], acceptanceCriteria: string): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.coverage.value;

    // Extract criteria identifiers from the input text
    // Look for numbered items, bullet points, or lines that look like criteria
    const criteriaLines = acceptanceCriteria
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 10);

    const totalCriteria = criteriaLines.length;

    if (totalCriteria === 0) {
        return { score: 100, weight, passed: ['No criteria to cover'], failed: [], warnings: [] };
    }

    // Check which criteria are cited in coverage arrays
    const citedCriteria = new Set<string>();
    for (const tc of testCases) {
        if (tc.coverage) {
            for (const cov of tc.coverage) {
                if (cov.criterionText) {
                    citedCriteria.add(cov.criterionText.toLowerCase().trim());
                }
            }
        }
    }

    // Also check if criteria text appears in test titles or steps (fallback)
    const allText = testCases
        .map((tc) => [tc.title, ...tc.steps, tc.expectedResult].join(' '))
        .join(' ')
        .toLowerCase();

    let matchedByContent = 0;
    for (const line of criteriaLines) {
        const keywords = line
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter((w) => w.length > 3);
        const matchCount = keywords.filter((k) => allText.includes(k)).length;
        if (matchCount >= Math.ceil(keywords.length * 0.5)) {
            matchedByContent++;
        }
    }

    const effectiveCited = Math.max(citedCriteria.size, matchedByContent);
    const score = Math.min(100, Math.round((effectiveCited / totalCriteria) * 100));

    const passed: string[] = [];
    const failed: string[] = [];
    const warnings: string[] = [];

    if (citedCriteria.size > 0) {
        passed.push(`${citedCriteria.size} criteria cited in coverage arrays`);
    }
    if (matchedByContent > 0 && matchedByContent !== citedCriteria.size) {
        warnings.push(`${matchedByContent} criteria matched by content (not in coverage array)`);
    }
    if (score < 100) {
        failed.push(`${totalCriteria - effectiveCited} criteria not covered`);
    }

    return { score, weight, passed, failed, warnings };
}

function evaluateStepConcreteness(testCases: GeneratedTestCase[]): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.stepConcreteness.value;
    let totalSteps = 0;
    let concreteSteps = 0;
    const vagueExamples: string[] = [];

    for (const tc of testCases) {
        for (const step of tc.steps) {
            totalSteps++;
            if (containsConcreteVerb(step) && !containsVagueVerb(step)) {
                concreteSteps++;
            } else if (containsVagueVerb(step)) {
                vagueExamples.push(step.slice(0, 60));
            }
        }
    }

    const score = totalSteps === 0 ? 0 : Math.round((concreteSteps / totalSteps) * 100);

    return {
        score,
        weight,
        passed: totalSteps > 0 ? [`${concreteSteps}/${totalSteps} steps are concrete`] : [],
        failed: vagueExamples.length > 0 ? [`${vagueExamples.length} vague steps found`] : [],
        warnings: [],
    };
}

function evaluatePreconditionSpecificity(testCases: GeneratedTestCase[]): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.preconditionSpecificity.value;
    let total = 0;
    let specific = 0;
    const genericExamples: string[] = [];

    for (const tc of testCases) {
        if (tc.preConditions) {
            for (const pc of tc.preConditions) {
                const desc = pc.description || pc.summary || '';
                if (!desc) continue;
                total++;
                if (!isGenericPrecondition(desc)) {
                    specific++;
                } else {
                    genericExamples.push(desc.slice(0, 60));
                }
            }
        }
    }

    if (total === 0) {
        return { score: 100, weight, passed: ['No preconditions to evaluate'], failed: [], warnings: [] };
    }

    const score = Math.round((specific / total) * 100);

    return {
        score,
        weight,
        passed: [`${specific}/${total} preconditions are specific`],
        failed: genericExamples.length > 0 ? [`${genericExamples.length} generic preconditions`] : [],
        warnings: [],
    };
}

function evaluateBVA(testCases: GeneratedTestCase[], acceptanceCriteria: string): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.bvaApplication.value;

    const ranges = detectNumericRanges(acceptanceCriteria);
    if (ranges.length === 0) {
        return {
            score: 100,
            weight,
            passed: ['No numeric ranges detected in criteria'],
            failed: [],
            warnings: [],
        };
    }

    // Collect all numbers mentioned in test cases
    const allTestNumbers = new Set<number>();
    for (const tc of testCases) {
        for (const num of extractNumbers([tc.title, ...tc.steps, tc.expectedResult].join(' '))) {
            allTestNumbers.add(num);
        }
    }

    let coveredBoundaries = 0;
    let totalBoundaries = 0;
    const missingBoundaries: string[] = [];

    for (const range of ranges) {
        const boundaries = [range.min - 1, range.min, range.max, range.max + 1];
        for (const b of boundaries) {
            totalBoundaries++;
            if (allTestNumbers.has(b)) {
                coveredBoundaries++;
            } else {
                missingBoundaries.push(`${b} (range ${range.min}-${range.max})`);
            }
        }
    }

    const score = totalBoundaries === 0 ? 100 : Math.round((coveredBoundaries / totalBoundaries) * 100);

    return {
        score,
        weight,
        passed: coveredBoundaries > 0 ? [`${coveredBoundaries}/${totalBoundaries} boundaries covered`] : [],
        failed: missingBoundaries.length > 0 ? [`Missing boundaries: ${missingBoundaries.slice(0, 5).join(', ')}`] : [],
        warnings: [],
    };
}

/**
 * Equivalence Partitioning application — detects whether test cases cover
 * invalid partitions of constrained fields.
 *
 * Heuristic (deterministic, ISTQB CTFL EP technique):
 * 1. Detect fields with constraints from acceptance criteria (e.g. "Email must
 *    be valid", "Age must be positive", "Field must not be empty").
 * 2. A field is constrained when a constraint verb ("must be", "should be",
 *    "cannot", "must not") or a quality adjective ("valid", "invalid") appears
 *    near a candidate field name.
 * 3. For each constrained field, check whether ANY test case exercises an
 *    INVALID value for that field (invalid = negation of the constraint, or
 *    explicit "invalid/empty/null/wrong/missing" language).
 * 4. Score = fraction of constrained fields with at least one invalid-partition
 *    test. When no constrained fields are detected, EP is not applicable and
 *    the metric returns 100 (like BVA when no numeric ranges exist).
 */
function evaluateEP(testCases: GeneratedTestCase[], acceptanceCriteria: string): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.epApplication.value;

    const constrainedFields = detectConstrainedFields(acceptanceCriteria);

    if (constrainedFields.length === 0) {
        return {
            score: 100,
            weight,
            passed: ['No constrained fields detected in criteria (EP not applicable)'],
            failed: [],
            warnings: [],
        };
    }

    let coveredFields = 0;
    const uncoveredFields: string[] = [];

    for (const field of constrainedFields) {
        if (hasInvalidPartitionTest(testCases, field)) {
            coveredFields++;
        } else {
            uncoveredFields.push(field);
        }
    }

    const total = constrainedFields.length;
    const score = total === 0 ? 100 : Math.round((coveredFields / total) * 100);

    return {
        score,
        weight,
        passed: coveredFields > 0 ? [`${coveredFields}/${total} constrained fields have invalid-partition tests`] : [],
        failed:
            uncoveredFields.length > 0
                ? [`No invalid-partition tests for: ${uncoveredFields.slice(0, 5).join(', ')}`]
                : [],
        warnings: [],
    };
}

/** Detect field names in acceptance criteria that carry a validation constraint. */
function detectConstrainedFields(criteria: string): string[] {
    if (!criteria || typeof criteria !== 'string') return [];

    const constraintPatterns = [
        /(\b[A-Za-z][A-Za-z ]{1,39}\b)\s+(?:must|should|needs? to|has to|is required to|cannot|can not|must not)\s+(?:be|have|contain|accept|start|end)/gi,
        /(\b[A-Za-z][A-Za-z ]{1,39}\b)\s+(?:must be|should be|is|must)\s+(?:valid|invalid|non[- ]?empty|positive|numeric|greater|less|between|at least|at most)/gi,
    ];

    const fields = new Set<string>();
    for (const pattern of constraintPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(criteria)) !== null) {
            const raw = match[1];
            if (raw) {
                const field = raw.trim().toLowerCase();
                if (field.length >= 2 && !isGenericFieldName(field)) {
                    fields.add(field);
                }
            }
        }
    }
    return [...fields];
}

/** Skip overly generic tokens that would create false positives (e.g. "the user", "a value"). */
function isGenericFieldName(field: string): boolean {
    const GENERIC = new Set(['the user', 'the system', 'a value', 'the field', 'the page', 'an error']);
    if (GENERIC.has(field)) return true;
    if (/^(the|a|an)\s+/.test(field)) return true;
    return field.length < 2;
}

/** Check whether any test case exercises an INVALID partition of the given field. */
function hasInvalidPartitionTest(testCases: GeneratedTestCase[], field: string): boolean {
    const INVALID_MARKERS = [
        'invalid',
        'empty',
        'null',
        'missing',
        'wrong',
        'malformed',
        'too short',
        'too long',
        'not valid',
        'does not',
    ];
    const fieldTokens = tokenize(field);

    for (const tc of testCases) {
        const text = [tc.title, ...tc.steps, tc.expectedResult].join(' ').toLowerCase();
        const hasField = fieldTokens.every((t) => text.includes(t));
        if (!hasField) continue;
        const hasInvalidMarker = INVALID_MARKERS.some((m) => text.includes(m));
        if (hasInvalidMarker) return true;
    }
    return false;
}

function evaluateEvidenceCitations(testCases: GeneratedTestCase[]): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.evidenceCitations.value;
    let withEvidence = 0;

    for (const tc of testCases) {
        if (tc.evidence && tc.evidence.length > 0) {
            withEvidence++;
        }
    }

    const total = testCases.length;
    const score = total === 0 ? 0 : Math.round((withEvidence / total) * 100);

    return {
        score,
        weight,
        passed: withEvidence > 0 ? [`${withEvidence}/${total} tests have evidence citations`] : [],
        failed: withEvidence === 0 ? ['No tests have evidence citations'] : [],
        warnings: [],
    };
}

function evaluateRedundancy(testCases: GeneratedTestCase[]): MetricResult {
    const weight = CASE18_FLOOR_PROVENANCE.weights.redundancy.value;
    const redundantPairs: Array<[number, number, number]> = [];

    for (let i = 0; i < testCases.length; i++) {
        for (let j = i + 1; j < testCases.length; j++) {
            const stepsA = (testCases[i]?.steps ?? []).map(tokenize).flat();
            const stepsB = (testCases[j]?.steps ?? []).map(tokenize).flat();
            const similarity = jaccardSimilarity(stepsA, stepsB);
            if (similarity >= 0.8) {
                redundantPairs.push([i, j, similarity]);
            }
        }
    }

    const score = redundantPairs.length === 0 ? 100 : Math.max(0, 100 - redundantPairs.length * 10);

    return {
        score,
        weight,
        passed: redundantPairs.length === 0 ? ['No redundant tests found'] : [],
        failed: redundantPairs.length > 0 ? [`${redundantPairs.length} redundant pairs (Jaccard ≥ 80%)`] : [],
        warnings: [],
    };
}

// --- Main evaluator ---

/**
 * Evaluate test cases using deterministic (rule-based) checks.
 *
 * @param testCases - LLM-generated test cases
 * @param acceptanceCriteria - Raw acceptance criteria text from user story
 * @returns Deterministic evaluation result with per-metric scores
 */
export function evaluateDeterministic(testCases: GeneratedTestCase[], acceptanceCriteria: string): DeterministicResult {
    const coverage = evaluateCoverage(testCases, acceptanceCriteria);
    const stepConcreteness = evaluateStepConcreteness(testCases);
    const preconditionSpecificity = evaluatePreconditionSpecificity(testCases);
    const bvaApplication = evaluateBVA(testCases, acceptanceCriteria);
    const epApplication = evaluateEP(testCases, acceptanceCriteria);
    const evidenceCitations = evaluateEvidenceCitations(testCases);
    const redundancy = evaluateRedundancy(testCases);

    // Weighted average (weights sourced from CASE18_FLOOR_PROVENANCE — sum validated = 1.0)
    const scoreValue =
        coverage.score * coverage.weight +
        stepConcreteness.score * stepConcreteness.weight +
        preconditionSpecificity.score * preconditionSpecificity.weight +
        bvaApplication.score * bvaApplication.weight +
        epApplication.score * epApplication.weight +
        evidenceCitations.score * evidenceCitations.weight +
        redundancy.score * redundancy.weight;
    const score = Math.round(Number.isFinite(scoreValue) ? scoreValue : 0);

    return {
        score,
        metrics: {
            coverage,
            stepConcreteness,
            preconditionSpecificity,
            bvaApplication,
            epApplication,
            evidenceCitations,
            redundancy,
        },
        details: {
            totalTests: testCases.length,
            totalCriteria:
                coverage.failed.length > 0
                    ? parseInt(coverage.failed[0]?.match(/(\d+) criteria not covered/)?.[1] || '0', 10) +
                      coverage.passed.length
                    : coverage.passed.length,
            citedCriteria: coverage.passed.length,
            redundantPairs: [],
        },
    };
}
