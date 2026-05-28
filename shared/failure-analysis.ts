/** AI-powered failure analysis: classifies test failures and generates HTML reports with LLM analysis. */
import fs from 'fs';
import path from 'path';
import type { FlatTest } from './result_parser';
import { llmPrompt } from './llm-client';
import { reviewWithLlm, type ReviewResult } from './llm-review';
import { rootLogger } from './logger';
import { generateReportWithFallback } from './report-generator';
import { snapshotLlmMetrics } from './llm-metrics';
import { sanitizeForLlm } from './sanitize';
import { withSpinner } from './spinner';
import { ClassifyResponseSchema } from './classify.schema';

export interface AnalysisReport {
    content: string;
    htmlReport?: string;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed: boolean;
}

export interface LlmContext {
    gitCommits?: string;
    gitTrend?: string;
    jiraIssues?: string;
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
    return failed.map((t, i) => `${i + 1}. [${t.state}] ${t.title} (${t.duration ?? '?'}ms)`).join('\n');
}

/** Analyze all failed tests via an LLM review, generate a full HTML report, and snapshot LLM metrics.
 * Returns empty content immediately when there are no failures. */
export async function analyzeFailuresWithReport(tests: FlatTest[], context?: LlmContext): Promise<AnalysisReport> {
    const failed = tests.filter((t) => t.state === 'failed');
    if (failed.length === 0) return { content: '', confidence: 'high', fallbackUsed: false };

    const systemTemplate = readPrompt('failure-analysis.md');
    if (!systemTemplate) return { content: '', confidence: 'medium', fallbackUsed: true };

    const failedTests = sanitizeForLlm(formatFailedTests(failed));

    let userMessage = '';
    if (context?.gitCommits) {
        userMessage += 'Recent Commits:\n' + sanitizeForLlm(context.gitCommits) + '\n\n';
    }
    if (context?.gitTrend) {
        userMessage += 'Pass Rate Trend:\n' + sanitizeForLlm(context.gitTrend) + '\n\n';
    }
    if (context?.jiraIssues) {
        userMessage += 'Related Jira Issues:\n' + sanitizeForLlm(context.jiraIssues) + '\n\n';
    }
    userMessage += 'Failed Tests:\n' + failedTests;

    let result: ReviewResult;
    try {
        result = await withSpinner('Analisando falhas com IA...', () => reviewWithLlm(systemTemplate, userMessage));
    } catch {
        return { content: '', confidence: 'medium', fallbackUsed: true };
    }

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

/** Classify a single test failure into a category (ASSERTION, TIMEOUT, ENVIRONMENT, etc.) via LLM. */
export async function classifyFailure(title: string, error: string): Promise<string> {
    const systemTemplate = readPrompt('classify.md');
    if (!systemTemplate) return 'UNKNOWN: Could not load prompt template';

    const baseData = 'Test Title:\n' + title + '\n\nError:\n' + sanitizeForLlm(error);

    try {
        const result = await llmPrompt('fast', systemTemplate, baseData, 'classify', undefined, ClassifyResponseSchema);
        return result;
    } catch {
        rootLogger.warn('classifyFailure: llmPrompt + Zod validation failed, falling back to UNKNOWN');
        return 'UNKNOWN: Could not classify failure after retry';
    }
}
