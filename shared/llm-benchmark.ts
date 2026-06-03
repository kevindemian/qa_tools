/**
 * LLM Prompt Benchmark — runs golden dataset fixtures through the LLM and reports match rates.
 * Runs golden dataset fixtures through the LLM and reports match rates.
 * Extended with coverage metrics: criteria coverage, partition coverage, boundary coverage.
 * Skip by default. Run with: BENCHMARK=true npx tsx shared/llm-benchmark.ts
 * Requires LLM_API_KEY (and optionally LLM_FAST_API_KEY) in environment.
 */
import fs from 'fs';
import path from 'path';
import { llmPrompt } from './llm-client';
import { rootLogger } from './logger';
import { gracefulExit } from './cli_base';
import { ExitCode } from './types';
import Config from './config';
import { defaultOutput } from './output';
import { ReportValidator, type ValidationRule } from './report-validator';
import {
    loadFailureAnalysisFixtures,
    loadUserStoryFixtures,
    loadClassifyFixtures,
    type FailureAnalysisFixture,
    type UserStoryFixture,
    type ClassifyFixture,
} from './prompts/__fixtures__/index';

const BENCHMARK_SCHEMA: ValidationRule[] = [
    { field: 'tests', required: true, type: 'array', minLength: 1 },
    { field: 'tests[0].title', required: true, type: 'string' },
    { field: 'tests[0].classification', required: true, type: 'string' },
    { field: 'tests[0].severity', required: true, type: 'string' },
    { field: 'tests[0].recommendation', required: true, type: 'string', minLength: 10 },
];
const benchmarkValidator = new ReportValidator(BENCHMARK_SCHEMA);

const PROMPT_DIR = __dirname + '/prompts';

function readPrompt(file: string): string {
    try {
        return fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');
    } catch {
        return '';
    }
}

const CACHED_PROMPTS: Record<string, string> = {};

interface BenchmarkMetrics {
    /** Fraction of expected criteria covered (0-1) */
    criteriaCoverage: number;
    /** Fraction of numeric ranges with partition coverage (0-1) */
    partitionCoverage: number;
    /** Fraction of boundary values covered (0-1) */
    boundaryCoverage: number;
    /** Total test cases in output */
    totalTests: number;
    /** Number of criteria that had at least one covering test */
    coveredCriteriaCount: number;
    /** Total number of expected criteria */
    totalCriteria: number;
}

interface BenchmarkResult {
    fixture: string;
    passed: boolean;
    error?: string;
    durationMs: number;
    metrics: BenchmarkMetrics;
}

interface TestCaseShape {
    title?: string;
    steps?: string[];
    expectedResult?: string;
    preConditions?: unknown[];
    coverage?: Array<{ criterionId: string; criterionText: string }>;
}

/** @internal exported for testing */
export function validateJsonSchema(body: string, minTests: number): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return 'Invalid JSON';
    }
    const obj = parsed as Record<string, unknown>;
    if (!obj.tests || !Array.isArray(obj.tests)) return 'Missing tests array';
    if (obj.tests.length < minTests) return 'Too few tests: ' + obj.tests.length + ' < ' + minTests;
    const result = benchmarkValidator.validateAll(parsed);
    if (!result.valid) return result.errors[0] || 'Validation failed';
    return null;
}

/** @internal exported for testing */
export function validateJsonArray(body: string, minItems: number): string | null {
    try {
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) return 'Not an array';
        if (parsed.length < minItems) return 'Too few items: ' + parsed.length + ' < ' + minItems;
        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i] as Record<string, unknown>;
            if (!item.title || typeof item.title !== 'string' || item.title.length < 5)
                return 'item[' + i + '] invalid title';
            if (!Array.isArray(item.steps) || item.steps.length === 0) return 'item[' + i + '] invalid steps';
            if (!item.expectedResult || typeof item.expectedResult !== 'string' || item.expectedResult.length < 10)
                return 'item[' + i + '] invalid expectedResult';
        }
        return null;
    } catch {
        return 'Invalid JSON';
    }
}

/** @internal exported for testing */
export function validateClassify(body: string, expectedCategory: string): string | null {
    const regex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;
    if (!regex.test(body)) return 'Invalid format: expected CATEGORY: explanation';
    const category = body.split(':')[0] ?? '';
    if (category !== expectedCategory) return 'Wrong category: expected ' + expectedCategory + ' got ' + category;
    return null;
}

/**
 * Check if each expected criterion has at least one covering test case.
 * Returns the number of covered criteria.
 */
function countCoveredCriteria(tests: TestCaseShape[], expectedCriteria: string[]): number {
    let covered = 0;
    for (const criterion of expectedCriteria) {
        const hasCoverage = tests.some((test) => {
            if (test.coverage) {
                const hasMatch = test.coverage.some(
                    (c) =>
                        c.criterionText.toLowerCase().includes(criterion.toLowerCase()) ||
                        criterion.toLowerCase().includes(c.criterionText.toLowerCase()),
                );
                if (hasMatch) return true;
            }
            if (test.title) {
                if (test.title.toLowerCase().includes(criterion.toLowerCase())) return true;
            }
            const stepsText = (test.steps || []).join(' ').toLowerCase();
            if (stepsText.includes(criterion.toLowerCase())) return true;
            return false;
        });
        if (hasCoverage) covered++;
    }
    return covered;
}

/**
 * Check if partition coverage exists for a given range.
 * A partition is covered if there is at least one test:
 *   - inside the valid range (age between min-max inclusive)
 *   - below min
 *   - above max
 * Returns number of partitions covered (0-3).
 */
function countCoveredPartitions(tests: TestCaseShape[], min: number, max: number): number {
    let partitions = 0;

    const stepsTexts = tests.map((t) => (t.steps || []).join(' ').toLowerCase());
    const allText = stepsTexts.join(' ');

    const belowMinRe = new RegExp('\\b' + (min - 1) + '\\b', 'i');
    const aboveMaxRe = new RegExp('\\b' + (max + 1) + '\\b', 'i');
    const validRe = new RegExp('\\b(?:' + (min + 1) + '|' + min + '|' + max + '|' + (max - 1) + ')\\b', 'i');

    if (validRe.test(allText)) partitions++;
    if (belowMinRe.test(allText) || /below|less than|under/i.test(allText)) partitions++;
    if (aboveMaxRe.test(allText) || /above|greater than|over|exceed/i.test(allText)) partitions++;

    return Math.min(partitions, 3);
}

/**
 * Check if boundary values for a range are covered in test data.
 * Expected boundaries: min, max, min-1, max+1 (2-value BVA).
 * Returns number of boundaries covered (0-4).
 */
function countCoveredBoundaries(tests: TestCaseShape[], min: number, max: number): number {
    let boundaries = 0;
    const allText = tests
        .map((t) => {
            const steps = (t.steps || []).join(' ');
            const expected = t.expectedResult || '';
            const title = t.title || '';
            return (steps + ' ' + expected + ' ' + title).toLowerCase();
        })
        .join(' ');

    const boundariesToCheck = [min, max, min - 1, max + 1];
    for (const b of boundariesToCheck) {
        const re = new RegExp('\\b' + b + '\\b');
        if (re.test(allText)) boundaries++;
    }

    return boundaries;
}

/** Compute coverage metrics for user story test output. */
/** @internal exported for testing */
export function computeCoverageMetrics(body: string, fixture: UserStoryFixture): BenchmarkMetrics {
    try {
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) {
            return {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: fixture.coverage.expectedCriteria.length,
            };
        }

        const tests = parsed as TestCaseShape[];

        const totalCriteria = fixture.coverage.expectedCriteria.length;
        const coveredCriteriaCount =
            fixture.coverage.expectedCriteria.length > 0
                ? countCoveredCriteria(tests, fixture.coverage.expectedCriteria)
                : 0;
        const criteriaCoverage = totalCriteria > 0 ? coveredCriteriaCount / totalCriteria : 0;

        let partitionCoverage = 0;
        let boundaryCoverage = 0;
        const ranges = fixture.coverage.numericRanges;

        if (ranges.length > 0) {
            let totalPartitions = 0;
            let coveredPartitions = 0;
            let totalBoundaries = 0;
            let coveredBoundaries = 0;

            for (const range of ranges) {
                totalPartitions += 3;
                coveredPartitions += countCoveredPartitions(tests, range.min, range.max);

                totalBoundaries += 4;
                coveredBoundaries += countCoveredBoundaries(tests, range.min, range.max);
            }

            partitionCoverage = totalPartitions > 0 ? coveredPartitions / totalPartitions : 0;
            boundaryCoverage = totalBoundaries > 0 ? coveredBoundaries / totalBoundaries : 0;
        }

        return {
            criteriaCoverage,
            partitionCoverage,
            boundaryCoverage,
            totalTests: tests.length,
            coveredCriteriaCount,
            totalCriteria,
        };
    } catch {
        return {
            criteriaCoverage: 0,
            partitionCoverage: 0,
            boundaryCoverage: 0,
            totalTests: 0,
            coveredCriteriaCount: 0,
            totalCriteria: fixture.coverage.expectedCriteria.length,
        };
    }
}

async function runFailureAnalysisFixture(fixture: FailureAnalysisFixture): Promise<BenchmarkResult> {
    const start = Date.now();
    const system =
        CACHED_PROMPTS['failure-analysis.md'] ??
        (CACHED_PROMPTS['failure-analysis.md'] = readPrompt('failure-analysis.md'));
    try {
        const result = await llmPrompt({
            tier: 'report',
            system,
            user: 'Failed Tests:\n' + fixture.input,
            callerId: 'benchmark-fa',
        });
        const error = validateJsonSchema(result, fixture.validate.minTests);
        return {
            fixture: fixture.name,
            passed: !error,
            ...(error ? { error } : {}),
            durationMs: Date.now() - start,
            metrics: {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: 0,
            },
        };
    } catch (err) {
        return {
            fixture: fixture.name,
            passed: false,
            error: (err as Error).message,
            durationMs: Date.now() - start,
            metrics: {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: 0,
            },
        };
    }
}

async function runUserStoryFixture(fixture: UserStoryFixture): Promise<BenchmarkResult> {
    const start = Date.now();
    const system =
        CACHED_PROMPTS['user-story-to-tests.md'] ??
        (CACHED_PROMPTS['user-story-to-tests.md'] = readPrompt('user-story-to-tests.md'));
    const userMsg =
        'User Story:\n' + fixture.input.story + '\n\nAcceptance Criteria:\n' + fixture.input.criteria.join('\n');
    try {
        const result = await llmPrompt({ tier: 'main', system, user: userMsg, callerId: 'benchmark-us' });
        const error = validateJsonArray(result, fixture.validate.minItems);
        const metrics = computeCoverageMetrics(result, fixture);
        return {
            fixture: fixture.name,
            passed: !error,
            ...(error ? { error } : {}),
            durationMs: Date.now() - start,
            metrics,
        };
    } catch (err) {
        return {
            fixture: fixture.name,
            passed: false,
            error: (err as Error).message,
            durationMs: Date.now() - start,
            metrics: {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: fixture.coverage.expectedCriteria.length,
            },
        };
    }
}

async function runClassifyFixture(fixture: ClassifyFixture): Promise<BenchmarkResult> {
    const start = Date.now();
    const system = CACHED_PROMPTS['classify.md'] ?? (CACHED_PROMPTS['classify.md'] = readPrompt('classify.md'));
    const userMsg = 'Test Title:\n' + fixture.input.title + '\n\nError:\n' + fixture.input.error;
    try {
        const result = await llmPrompt({ tier: 'fast', system, user: userMsg, callerId: 'benchmark-cl' });
        const error = validateClassify(result, fixture.expectedCategory);
        return {
            fixture: fixture.name,
            passed: !error,
            ...(error ? { error } : {}),
            durationMs: Date.now() - start,
            metrics: {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: 0,
            },
        };
    } catch (err) {
        return {
            fixture: fixture.name,
            passed: false,
            error: (err as Error).message,
            durationMs: Date.now() - start,
            metrics: {
                criteriaCoverage: 0,
                partitionCoverage: 0,
                boundaryCoverage: 0,
                totalTests: 0,
                coveredCriteriaCount: 0,
                totalCriteria: 0,
            },
        };
    }
}

function printResults(results: BenchmarkResult[]): void {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    defaultOutput.print('\n=== LLM BENCHMARK RESULTS ===');
    defaultOutput.print(
        'Total: ' +
            total +
            ' | Passed: ' +
            passed +
            ' | Failed: ' +
            failed +
            ' | Rate: ' +
            Math.round((passed / total) * 100) +
            '%',
    );
    defaultOutput.print('');

    for (const r of results) {
        const icon = r.passed ? '✅' : '❌';
        const status = r.passed ? 'PASS' : 'FAIL';
        let line = icon + ' [' + status + '] ' + r.fixture + ' (' + r.durationMs + 'ms)';
        if (r.error) {
            line += '\n   Error: ' + r.error;
        }
        line +=
            '\n   Metrics → criteria: ' +
            r.metrics.coveredCriteriaCount +
            '/' +
            r.metrics.totalCriteria +
            ' (' +
            Math.round(r.metrics.criteriaCoverage * 100) +
            '%)' +
            ' | partitions: ' +
            Math.round(r.metrics.partitionCoverage * 100) +
            '%' +
            ' | boundaries: ' +
            Math.round(r.metrics.boundaryCoverage * 100) +
            '%' +
            ' | tests: ' +
            r.metrics.totalTests;
        defaultOutput.print(line);
    }

    // Aggregate metrics
    const aggCriteria = results.reduce((acc, r) => acc + r.metrics.criteriaCoverage, 0) / results.length;
    const aggPartitions = results.reduce((acc, r) => acc + r.metrics.partitionCoverage, 0) / results.length;
    const aggBoundaries = results.reduce((acc, r) => acc + r.metrics.boundaryCoverage, 0) / results.length;

    defaultOutput.print('\n--- Aggregate Coverage Metrics ---');
    defaultOutput.print('  Average criteria coverage: ' + Math.round(aggCriteria * 100) + '%');
    defaultOutput.print('  Average partition coverage: ' + Math.round(aggPartitions * 100) + '%');
    defaultOutput.print('  Average boundary coverage: ' + Math.round(aggBoundaries * 100) + '%');
}

export async function runBenchmark(): Promise<void> {
    if (Config.get('BENCHMARK') !== 'true') {
        defaultOutput.print('Skipping benchmark. Set BENCHMARK=true to run.');
        return;
    }

    defaultOutput.print('Loading fixtures...');
    const faFixtures = loadFailureAnalysisFixtures();
    const usFixtures = loadUserStoryFixtures();
    const clFixtures = loadClassifyFixtures();

    defaultOutput.print('Running ' + (faFixtures.length + usFixtures.length + clFixtures.length) + ' benchmarks...');

    const allRunners: { name: string; run: () => Promise<BenchmarkResult> }[] = [
        ...faFixtures.map((f) => ({ name: f.name, run: () => runFailureAnalysisFixture(f) })),
        ...usFixtures.map((f) => ({ name: f.name, run: () => runUserStoryFixture(f) })),
        ...clFixtures.map((f) => ({ name: f.name, run: () => runClassifyFixture(f) })),
    ];

    const results: BenchmarkResult[] = [];
    const CONCURRENCY = 3;
    for (let i = 0; i < allRunners.length; i += CONCURRENCY) {
        const batch = allRunners.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.allSettled(batch.map((r) => r.run()));
        for (const [j, r] of batchResults.entries()) {
            if (r.status === 'fulfilled') results.push(r.value);
            else {
                results.push({
                    fixture: batch[j]?.name || 'unknown',
                    passed: false,
                    error: (r.reason as Error | undefined)?.message || 'Unknown error',
                    durationMs: 0,
                    metrics: {
                        criteriaCoverage: 0,
                        partitionCoverage: 0,
                        boundaryCoverage: 0,
                        totalTests: 0,
                        coveredCriteriaCount: 0,
                        totalCriteria: 0,
                    },
                });
            }
        }
    }

    printResults(results);
}

// Allow direct execution: npx tsx shared/llm-benchmark.ts
const isMain = process.argv[1]?.endsWith('llm-benchmark.ts');
if (isMain) {
    runBenchmark().catch((err) => {
        rootLogger.error('Benchmark failed: ' + (err as Error).message);
        gracefulExit(ExitCode.ERROR);
    });
}
