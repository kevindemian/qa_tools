import fs from 'fs';
import path from 'path';
import type { FlatTest } from './result_parser';
import { llmPrompt } from './llm-client';
import { reviewWithLlm } from './llm-review';
import { rootLogger } from './logger';
import { generateReportWithFallback } from './report-generator';
import { snapshotLlmMetrics } from './llm-metrics';
import { sanitizeForLlm } from './sanitize';
import { withSpinner } from './spinner';

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

export async function analyzeFailuresWithReport(tests: FlatTest[]): Promise<AnalysisReport> {
    const failed = tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) return { content: '', confidence: 'high', fallbackUsed: false };

    const systemTemplate = readPrompt('failure-analysis.md');
    if (!systemTemplate) return { content: '', confidence: 'medium', fallbackUsed: true };

    const failedTests = sanitizeForLlm(formatFailedTests(failed));
    const result = await withSpinner('Analisando falhas com IA...', () =>
        reviewWithLlm(systemTemplate, 'Failed Tests:\n' + failedTests),
    );

    const htmlReport = generateReportWithFallback(tests, {
        title: 'Failure Analysis Report',
        llmAnalysis: result.content,
        llmConfidence: result.confidence,
        llmFallback: result.fallbackUsed,
        generatedAt: new Date().toISOString(),
        source: 'AI Failure Analysis',
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

    const baseData = 'Test Title:\n' + title + '\n\nError:\n' + sanitizeForLlm(error);

    const classifyRegex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;
    const retryMessages = [
        'Classify this failure.',
        'Responda exatamente no formato CATEGORIA: explicacao. Use uma das categorias: ASSERTION, TIMEOUT, ENVIRONMENT, FLAKY, APPLICATION, UNKNOWN.',
    ];
    const retryCalls = ['classify', 'classify-retry'];

    for (let i = 0; i < retryMessages.length; i++) {
        const result = await llmPrompt('fast', systemTemplate, baseData + '\n\n' + retryMessages[i]!, retryCalls[i]);
        if (classifyRegex.test(result)) return result;
        if (i < retryMessages.length - 1) {
            rootLogger.warn('classifyFailure: invalid format, retrying');
        }
    }

    rootLogger.warn('classifyFailure: retry also returned invalid format, falling back to UNKNOWN');
    return 'UNKNOWN: Could not classify failure after retry';
}
