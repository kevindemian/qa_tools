/** AI-powered failure analysis: classifies test failures, assigns blame via git blame, and generates HTML reports with LLM analysis. */
import { formatErr } from './errors.js';
import fs from 'fs';
import path from 'path';
import { sanitizePath } from './path-utils.js';
import { execFileSync } from 'child_process';
import type { FlatTest } from './result_parser.js';
import type { DataHub, FailureRecord } from './types/data-hub.js';
import { llmPrompt } from './llm-client.js';
import type { LlmPromptOptions } from './types/llm.js';
import { reviewWithLlm, type ReviewResult } from './llm-review.js';
import { rootLogger } from './logger.js';
import { generateReportWithFallback } from './report-generator.js';
import { snapshotLlmMetrics } from './llm-metrics.js';
import Config from './config-accessor.js';
import { sanitizeForLlm } from './sanitize.js';
import { withSpinner } from './spinner.js';
import { ClassifyResponseSchema } from './classify.schema.js';

const GIT_BIN = '/usr/bin/git';
import { consensusGenerate } from './llm-self-consistency.js';
import { ArtifactValidator, type ValidationContext, pass, fail } from './artifact-validator.js';

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

/** Cross-reference of a failed test against the unified model's historical failure records. */
export interface FailureCrossReference {
    title: string;
    found: boolean;
    priorCategory?: string | undefined;
    priorConfidence?: number | undefined;
    qualityValid: boolean;
    sourceConfidence: number | null;
}

/**
 * EIXO C (C-3f): cross-reference failed tests against the unified model's failure records by
 * test-name fingerprint, attaching prior root-cause category + data-quality/provenance signal.
 * Consumes the typed accessor surface (getFailureRecords / getQuality / getProvenance) — never
 * the raw store directly.
 */
export function crossReferenceFailures(tests: FlatTest[], hub: DataHub): FailureCrossReference[] {
    const records = hub.getFailureRecords() ?? [];
    const byName = new Map<string, FailureRecord>();
    for (const r of records) byName.set(r.name, r);
    const quality = hub.getQuality('failureRecords');
    const provenance = hub.getProvenance()?.get('failureRecords');
    return tests
        .filter((t) => t.state === 'failed')
        .map((t) => {
            const rec = byName.get(t.title);
            return {
                title: t.title,
                found: Boolean(rec),
                priorCategory: rec?.category,
                priorConfidence: rec?.confidence,
                qualityValid: quality ? quality.valid : true,
                sourceConfidence: provenance?.confidence ?? null,
            };
        });
}

function extractFilesFromDiff(diff: string): Set<string> {
    const lines = diff.split('\n').filter((l) => l.startsWith('+++ b/') || l.startsWith('--- a/'));
    const files = new Set<string>();
    for (const line of lines) {
        const file = line.replace(/^--- a\//, '').replace(/^\+\+\+ b\//, '');
        if (file && file !== '/dev/null') files.add(file);
    }
    return files;
}

function blameFile(file: string, ignoreArgs: string[]): string | null {
    try {
        const blameOut = execFileSync(GIT_BIN, ['blame', '--line-porcelain', ...ignoreArgs, '--', file], {
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        const authorMatch = /^author (.+)$/m.exec(blameOut);
        const emailMatch = /^author-mail <(.+)>$/m.exec(blameOut);
        if (authorMatch) {
            let author = authorMatch[1]?.trim() ?? 'unknown';
            if (emailMatch) {
                author += ' <' + (emailMatch[1] ?? '') + '>';
            }
            return author;
        }
    } catch (err) {
        rootLogger.debug('failure-analysis: git blame failed for candidate: ' + String(err));
    }
    return null;
}

export function getCommitAuthor(diff: string): string {
    try {
        const files = extractFilesFromDiff(diff);
        if (files.size === 0) return 'unknown';

        const ignoreRevs = String(Config.get('qaGitBlameIgnore') || '');
        const ignoreArgs = ignoreRevs ? ['--ignore-rev', ignoreRevs] : [];

        for (const file of files) {
            const author = blameFile(file, ignoreArgs);
            if (author) return author;
        }
        return 'unknown';
    } catch (err) {
        rootLogger.debug('failure-analysis: author extraction failed: ' + String(err));
        return 'unknown';
    }
}

/**
 * Module-level ArtifactValidator for classify failure responses.
 * Validates that the LLM output matches the ClassifyResponseSchema (CATEGORY: explanation).
 */
const classifyValidator = new ArtifactValidator<string>('analysis');
classifyValidator.addInvariant('CLASSIFY-SCHEMA', (artifact: string, _context: ValidationContext) => {
    const parsed = ClassifyResponseSchema.safeParse(artifact);
    return parsed.success
        ? [pass('CLASSIFY-SCHEMA', 'Response matches classification schema')]
        : [fail('CLASSIFY-SCHEMA', 'Response does not match classification schema: ' + parsed.error.message)];
});

const PROMPT_DIR = path.resolve(import.meta.dirname, 'prompts');

function readPrompt(file: string): string {
    try {
        return fs.readFileSync(sanitizePath(PROMPT_DIR, file), 'utf8');
    } catch (err) {
        rootLogger.error('Failed to read prompt template: ' + formatErr(err));
        return '';
    }
}

function formatFailedTests(failed: FlatTest[]): string {
    return failed.map((t, i) => `${i + 1}. [${t.state}] ${t.title} (${t.duration}ms)`).join('\n');
}

/** Analyze all failed tests via an LLM review, generate a full HTML report, and snapshot LLM metrics.
 * Returns empty content immediately when there are no failures. */
export async function analyzeFailuresWithReport(
    tests: FlatTest[],
    context?: LlmContext,
    options?: { dataHub?: DataHub | undefined },
): Promise<AnalysisReport> {
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
    if (options?.dataHub) {
        const cross = crossReferenceFailures(tests, options.dataHub);
        if (cross.length > 0) {
            const lines = cross.map((c) => {
                const category = c.found ? `prior category=${c.priorCategory ?? 'unknown'}` : 'no prior failure record';
                const qualityNote = c.qualityValid ? '' : ' [failure-records quality issue]';
                return `- ${c.title}: ${category}${qualityNote}`;
            });
            userMessage += 'Prior Failure Records (cross-referenced by test name):\n' + lines.join('\n') + '\n\n';
        }
    }
    userMessage += 'Failed Tests:\n' + failedTests;

    let result: ReviewResult;
    try {
        result = await withSpinner('Analisando falhas com IA...', () => reviewWithLlm(systemTemplate, userMessage));
    } catch (err) {
        rootLogger.warn('Failure analysis LLM call failed: ' + String(err));
        return { content: '', confidence: 'medium', fallbackUsed: true };
    }

    const htmlReport = generateReportWithFallback(tests, {
        title: 'Failure Analysis Report',
        llmAnalysis: result.content,
        llmConfidence: result.confidence,
        ...(result.fallbackUsed ? { llmFallback: result.fallbackUsed } : {}),
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

/** Classify a single test failure into a category (ASSERTION, TIMEOUT, ENVIRONMENT, etc.) via self-consistency LLM.
 *  Uses self-consistency (n=3 parallel LLM calls with majority voting) when possible, falling back to
 *  single llmPrompt call if the consensus mechanism fails. Logs the divergence level when self-consistency
 *  is used. */
export async function classifyFailure(title: string, error: string): Promise<string> {
    const systemTemplate = readPrompt('classify.md');
    if (!systemTemplate) return 'UNKNOWN: Could not load prompt template';

    const baseData = 'Test Title:\n' + sanitizeForLlm(title) + '\n\nError:\n' + sanitizeForLlm(error);

    try {
        const context: ValidationContext = {
            inputRaw: baseData,
            outputRaw: {},
            artifactType: 'analysis',
        };
        const result = await consensusGenerate(
            {
                tier: 'fast',
                system: systemTemplate,
                user: baseData,
                callerId: 'classify',
                schema: ClassifyResponseSchema,
            } as LlmPromptOptions,
            classifyValidator,
            context,
            3,
        );
        if (result.divergence !== 'none') {
            rootLogger.info('classifyFailure: self-consistency divergence level = ' + result.divergence);
        }
        return result.winner;
    } catch (err) {
        rootLogger.warn('Self-consistency failed for classifyFailure: ' + String(err));
        try {
            const fallbackResult = await llmPrompt({
                tier: 'fast',
                system: systemTemplate,
                user: baseData,
                callerId: 'classify',
                schema: ClassifyResponseSchema,
            });
            return fallbackResult;
        } catch (err) {
            rootLogger.warn('classifyFailure: llmPrompt + Zod validation failed: ' + String(err));
            return 'UNKNOWN: Could not classify failure after retry';
        }
    }
}
