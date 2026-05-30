/**
 * LLM Prompt Benchmark — runs golden dataset fixtures through the LLM and reports match rates.
 * Runs golden dataset fixtures through the LLM and reports match rates.
 * Skip by default. Run with: BENCHMARK=true npx tsx shared/llm-benchmark.ts
 * Requires LLM_API_KEY (and optionally LLM_FAST_API_KEY) in environment.
 */
import fs from 'fs';
import path from 'path';
import { llmPrompt } from './llm-client';
import { rootLogger } from './logger';
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

interface BenchmarkResult {
    fixture: string;
    passed: boolean;
    error?: string;
    durationMs: number;
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
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed)) return 'Not an array';
        if (parsed.length < minItems) return 'Too few items: ' + parsed.length + ' < ' + minItems;
        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i];
            if (!item.title || typeof item.title !== 'string' || item.title.length < 5)
                return 'item[' + i + '] invalid title';
            if (!Array.isArray(item.steps) || item.steps.length === 0) return 'item[' + i + '] invalid steps';
            if (!item.expectedResult || item.expectedResult.length < 10)
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
    const category = body.split(':')[0]!;
    if (category !== expectedCategory) return 'Wrong category: expected ' + expectedCategory + ' got ' + category;
    return null;
}

async function runFailureAnalysisFixture(fixture: FailureAnalysisFixture): Promise<BenchmarkResult> {
    const start = Date.now();
    const system =
        CACHED_PROMPTS['failure-analysis.md'] ??
        (CACHED_PROMPTS['failure-analysis.md'] = readPrompt('failure-analysis.md'));
    try {
        const result = await llmPrompt('report', system, 'Failed Tests:\n' + fixture.input, 'benchmark-fa');
        const error = validateJsonSchema(result, fixture.validate.minTests);
        return { fixture: fixture.name, passed: !error, error: error || undefined, durationMs: Date.now() - start };
    } catch (err) {
        return { fixture: fixture.name, passed: false, error: (err as Error).message, durationMs: Date.now() - start };
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
        const result = await llmPrompt('main', system, userMsg, 'benchmark-us');
        const error = validateJsonArray(result, fixture.validate.minItems);
        return { fixture: fixture.name, passed: !error, error: error || undefined, durationMs: Date.now() - start };
    } catch (err) {
        return { fixture: fixture.name, passed: false, error: (err as Error).message, durationMs: Date.now() - start };
    }
}

async function runClassifyFixture(fixture: ClassifyFixture): Promise<BenchmarkResult> {
    const start = Date.now();
    const system = CACHED_PROMPTS['classify.md'] ?? (CACHED_PROMPTS['classify.md'] = readPrompt('classify.md'));
    const userMsg = 'Test Title:\n' + fixture.input.title + '\n\nError:\n' + fixture.input.error;
    try {
        const result = await llmPrompt('fast', system, userMsg, 'benchmark-cl');
        const error = validateClassify(result, fixture.expectedCategory);
        return { fixture: fixture.name, passed: !error, error: error || undefined, durationMs: Date.now() - start };
    } catch (err) {
        return { fixture: fixture.name, passed: false, error: (err as Error).message, durationMs: Date.now() - start };
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
        defaultOutput.print(icon + ' [' + status + '] ' + r.fixture + ' (' + r.durationMs + 'ms)');
        if (r.error) {
            defaultOutput.print('   Error: ' + r.error);
        }
    }
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
                    error: r.reason?.message || 'Unknown error',
                    durationMs: 0,
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
        process.exit(1);
    });
}
