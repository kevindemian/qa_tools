/**
 * LLM Prompt Benchmark — runs golden dataset fixtures through the LLM and reports match rates.
 * Skip by default. Run with: BENCHMARK=true npx tsx shared/llm-benchmark.ts
 * Requires LLM_API_KEY (and optionally LLM_FAST_API_KEY) in environment.
 */
import fs from 'fs';
import path from 'path';
import { llmPrompt } from './llm-client.js';
import { rootLogger } from './logger.js';
import { gracefulExit } from './cli_base.js';
import { ExitCode } from './types.js';
import Config from './config.js';
import { defaultOutput } from './output.js';
import {
    loadFailureAnalysisFixtures,
    loadUserStoryFixtures,
    loadClassifyFixtures,
    type FailureAnalysisFixture,
    type UserStoryFixture,
    type ClassifyFixture,
} from './prompts/__fixtures__/index.js';
import { validateJsonSchema, validateJsonArray, validateClassify } from './benchmark-validators.js';
import { computeCoverageMetrics, type BenchmarkMetrics } from './benchmark-metrics.js';
import { checkQualitySignals } from './quality-suggester.js';
import type { QualitySignal } from './quality-suggester.js';

const PROMPT_DIR = import.meta.dirname + '/prompts';

function readPrompt(file: string): string {
    try {
        return fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');
    } catch (err) {
        rootLogger.debug('llm-benchmark: failed to read prompt: ' + (err instanceof Error ? err.message : String(err)));
        return '';
    }
}

const CACHED_PROMPTS: Record<string, string> = {};

interface BenchmarkResult {
    fixture: string;
    passed: boolean;
    error?: string;
    durationMs: number;
    metrics: BenchmarkMetrics;
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
        const icon = r.passed ? '\u2705' : '\u274C';
        const status = r.passed ? 'PASS' : 'FAIL';
        let line = icon + ' [' + status + '] ' + r.fixture + ' (' + r.durationMs + 'ms)';
        if (r.error) {
            line += '\n   Error: ' + r.error;
        }
        line +=
            '\n   Metrics \u2192 criteria: ' +
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
                    fixture: (Reflect.get(batch, j) as { name: string } | undefined)?.name || 'unknown',
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

    // SW-15: Feed benchmark results into quality signal engine
    const total = results.length;
    const passCount = results.filter((r) => r.passed).length;
    const passRate = total > 0 ? passCount / total : 1;
    const benchmarkSignals: QualitySignal[] = [];
    if (passRate < 0.5) {
        benchmarkSignals.push({
            severity: 'critical',
            source: 'benchmark',
            message: `Benchmark pass rate ${(passRate * 100).toFixed(0)}% (${passCount}/${total}) abaixo do esperado.`,
            suggestedAction: 'Verifique a qualidade das respostas do modelo ou considere trocar de provedor.',
        });
    } else if (passRate < 0.8) {
        benchmarkSignals.push({
            severity: 'warning',
            source: 'benchmark',
            message: `Benchmark pass rate ${(passRate * 100).toFixed(0)}% (${passCount}/${total}) abaixo do ideal.`,
            suggestedAction: 'Monitore os resultados e considere revisar as configurações do modelo.',
        });
    }
    checkQualitySignals(benchmarkSignals);
}

const isMain = process.argv[1]?.endsWith('llm-benchmark.ts');
if (isMain) {
    runBenchmark().catch((err) => {
        rootLogger.error('Benchmark failed: ' + (err as Error).message);
        gracefulExit(ExitCode.ERROR);
    });
}
