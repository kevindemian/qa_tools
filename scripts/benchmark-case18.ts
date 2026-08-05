/**
 * Case18 benchmark runner — manual verification gate (plan T4.7).
 *
 * Runs the deterministic floor against the calibrated benchmark suites
 * (ECSPOL-960 real baseline + synthetic BVA/EP/State-Transition scenarios)
 * and prints the resulting score/grade. No network, no LLM.
 *
 * Usage: `npm run benchmark:case18`
 */

import { evaluateCase18 } from '../shared/quality/case18-evaluator.js';
import {
    ECSPOL960_BASELINE,
    ECSPOL960_STORY,
    BVA_BENCHMARK,
    EP_BENCHMARK,
    STATE_TRANSITION_BENCHMARK,
    ERROR_GUESSING_BENCHMARK,
} from '../shared/quality/case18-benchmarks.js';
import type { GeneratedTestCase } from '../shared/quality/case18-types.js';

function benchmark(label: string, testCases: GeneratedTestCase[], criteria: string): void {
    const result = evaluateCase18(testCases, criteria);
    const d = result.layers.deterministic;
    console.log(`${label}: score=${result.score} grade=${result.grade}`);
    console.log(`  metrics: ${JSON.stringify(d.metrics)}`);
    for (const f of result.details.failed) console.log(`  FAILED: ${f}`);
    for (const w of result.details.warnings) console.log(`  WARN: ${w}`);
    console.log('');
}

console.log('=== Case18 Quality Benchmarks (deterministic floor) ===\n');

benchmark('ECSPOL-960 baseline', ECSPOL960_BASELINE, ECSPOL960_STORY.description.split('\n').slice(1).join('\n'));

const bvaCases: GeneratedTestCase[] = [
    {
        title: 'Reject age below minimum',
        steps: ['Set age to 17', 'Submit registration'],
        expectedResult: 'Registration rejected',
        coverage: [],
        evidence: ['Boundary below range'],
    },
    {
        title: 'Accept age at minimum boundary',
        steps: ['Set age to 18', 'Submit registration'],
        expectedResult: 'Registration accepted',
        coverage: [],
        evidence: ['Lower boundary'],
    },
    {
        title: 'Accept age at maximum boundary',
        steps: ['Set age to 65', 'Submit registration'],
        expectedResult: 'Registration accepted',
        coverage: [],
        evidence: ['Upper boundary'],
    },
    {
        title: 'Reject age above maximum',
        steps: ['Set age to 66', 'Submit registration'],
        expectedResult: 'Registration rejected',
        coverage: [],
        evidence: ['Boundary above range'],
    },
];
benchmark('BVA (age 18-65)', bvaCases, BVA_BENCHMARK.criteria);

const epCases: GeneratedTestCase[] = [
    {
        title: 'Accept valid email format',
        steps: ['Enter user@example.com', 'Submit form'],
        expectedResult: 'Email accepted',
        coverage: [],
        evidence: ['Valid partition'],
    },
    {
        title: 'Reject missing domain',
        steps: ['Enter value without domain', 'Submit form'],
        expectedResult: 'Email rejected',
        coverage: [],
        evidence: ['Invalid partition'],
    },
    {
        title: 'Reject missing at-sign',
        steps: ['Enter no-at-sign value', 'Submit form'],
        expectedResult: 'Email rejected',
        coverage: [],
        evidence: ['Invalid partition'],
    },
    {
        title: 'Reject empty value',
        steps: ['Leave email empty', 'Submit form'],
        expectedResult: 'Email rejected',
        coverage: [],
        evidence: ['Invalid partition'],
    },
];
benchmark('EP (email format)', epCases, EP_BENCHMARK.criteria);

const stCases: GeneratedTestCase[] = [
    {
        title: 'Transition pending to shipped',
        steps: ['Open order in pending status', 'Ship order'],
        expectedResult: 'Order status becomes shipped',
        coverage: [],
        evidence: ['Valid transition'],
    },
    {
        title: 'Transition shipped to delivered',
        steps: ['Open order in shipped status', 'Mark delivered'],
        expectedResult: 'Order status becomes delivered',
        coverage: [],
        evidence: ['Valid transition'],
    },
    {
        title: 'Reject delivered to pending',
        steps: ['Open order in delivered status', 'Attempt to set pending'],
        expectedResult: 'Transition rejected',
        coverage: [],
        evidence: ['Invalid transition'],
    },
];
benchmark('State Transition (order lifecycle)', stCases, STATE_TRANSITION_BENCHMARK.criteria);

const egCases: GeneratedTestCase[] = [
    {
        title: 'Reject empty required field',
        steps: ['Leave required field empty', 'Submit form'],
        expectedResult: 'Validation error shown',
        coverage: [],
        evidence: ['Empty value'],
    },
    {
        title: 'Reject special characters in input',
        steps: ['Enter special characters', 'Submit form'],
        expectedResult: 'Validation error shown',
        coverage: [],
        evidence: ['Special characters'],
    },
    {
        title: 'Reject value exceeding max length',
        steps: ['Enter value exceeding max length', 'Submit form'],
        expectedResult: 'Validation error shown',
        coverage: [],
        evidence: ['Max length exceeded'],
    },
];
benchmark('Error Guessing (form validation)', egCases, ERROR_GUESSING_BENCHMARK.criteria);
