import fs from 'fs';
import path from 'path';
import type { FlatTest } from './result_parser';
import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';
import { rootLogger } from './logger';
import { generateReportWithFallback } from './report-generator';
import { snapshotLlmMetrics } from './llm-metrics';

export interface AnalysisReport {
    content: string;
    htmlReport?: string;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed: boolean;
}

const PROMPT_DIR = path.resolve(__dirname, 'prompts');

function readPrompt(file: string): string {
    try {
        return fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');
    } catch (err) {
        rootLogger.error('Failed to read prompt template: ' + (err as Error).message);
        return '';
    }
}

function formatFailedTests(failed: FlatTest[]): string {
    return failed.map((t, i) => `${i + 1}. [${t.state}] ${t.title} (${t.duration}ms)`).join('\n');
}

export async function analyzeFailures(tests: FlatTest[]): Promise<string> {
    const result = await analyzeFailuresWithReport(tests);
    return result.content;
}

export async function analyzeFailuresWithReport(tests: FlatTest[]): Promise<AnalysisReport> {
    const failed = tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) return { content: '', confidence: 'high', fallbackUsed: false };

    const systemTemplate = readPrompt('failure-analysis.md');
    if (!systemTemplate) return { content: '', confidence: 'medium', fallbackUsed: true };

    const system = systemTemplate.replace('{{FAILED_TESTS}}', formatFailedTests(failed));
    const result = await reviewWithLlm(
        system,
        'Please analyze the test failures above. Respond with a JSON object containing a "tests" array, where each test has: title, classification, severity, recommendation.',
    );

    const htmlReport = generateReportWithFallback(tests, {
        title: 'Failure Analysis Report',
        llmAnalysis: result.content,
        llmConfidence: result.confidence,
        llmFallback: result.fallbackUsed,
    });

    snapshotLlmMetrics();

    return {
        content: result.content,
        htmlReport,
        confidence: result.confidence,
        fallbackUsed: result.fallbackUsed || false,
    };
}

export async function classifyFailure(title: string, error: string): Promise<string> {
    const systemTemplate = readPrompt('classify.md');
    if (!systemTemplate) return 'UNKNOWN: Could not load prompt template';

    const system = systemTemplate.replace('{{TEST_TITLE}}', title).replace('{{ERROR_MESSAGE}}', error);
    return llmPrompt('fast', system, 'Classify this failure.');
}
