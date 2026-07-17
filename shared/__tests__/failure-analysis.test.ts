import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config-accessor.js', () => ({ default: { get: vi.fn<(k: string) => string>(() => '') } }));
vi.mock('child_process', () => ({ execFileSync: vi.fn(() => '') }));
vi.mock('../spinner.js', () => ({ withSpinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()) }));
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    const readFileSync = vi.fn(actual.readFileSync);
    return { ...actual, readFileSync, default: { ...actual, readFileSync } };
});
vi.mock('../llm-review.js', () => ({ reviewWithLlm: vi.fn() }));
vi.mock('../report-generator.js', () => ({ generateReportWithFallback: vi.fn(() => '<html>report</html>') }));
vi.mock('../llm-metrics.js', () => ({ snapshotLlmMetrics: vi.fn() }));
vi.mock('../llm-client.js', () => ({ llmPrompt: vi.fn() }));

import { execFileSync } from 'child_process';
import Config from '../config-accessor.js';
import fs from 'fs';
import {
    analyzeFailuresWithReport,
    classifyFailure,
    crossReferenceFailures,
    getCommitAuthor,
} from '../failure-analysis.js';
import { reviewWithLlm } from '../llm-review.js';
import type { ReviewResult } from '../llm-review.js';
import { generateReportWithFallback } from '../report-generator.js';
import { snapshotLlmMetrics } from '../llm-metrics.js';
import { llmPrompt } from '../llm-client.js';
import { rootLogger } from '../logger.js';
import type { FlatTest } from '../result_parser.js';
import type { DataHub, FailureRecord } from '../types/data-hub.js';

function makeHub(records: FailureRecord[], qualityValid = true, provenanceConfidence = 0.9): DataHub {
    const quality = { valid: qualityValid } as never;
    const provenance = new Map<string, { confidence: number | null }>([
        ['failureRecords', { confidence: provenanceConfidence }],
    ]);
    return {
        getFailureRecords: () => records,
        getQuality: () => quality,
        getProvenance: () => provenance,
    } as unknown as DataHub;
}

const failedTest: FlatTest = { title: 'auth.login fails', state: 'failed', duration: 12 };

describe('Failure-analysis', () => {
    describe('CrossReferenceFailures', () => {
        it('returns empty for no failed tests', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([{ title: 'x', state: 'passed', duration: 1 }], makeHub([]));

            expect(out).toStrictEqual([]);
        });

        it('flags a matched prior record with its category and confidence', () => {
            expect.hasAssertions();

            const rec: FailureRecord = {
                name: 'auth.login fails',
                status: 'failed',
                category: 'ASSERT',
                confidence: 0.8,
                source: 's',
            };
            const out = crossReferenceFailures([failedTest], makeHub([rec]));

            expect(out[0]?.found).toBeTruthy();
            expect(out[0]?.priorCategory).toBe('ASSERT');
            expect(out[0]?.priorConfidence).toBeCloseTo(0.8, 5);
            expect(out[0]?.qualityValid).toBeTruthy();
            expect(out[0]?.sourceConfidence).toBeCloseTo(0.9, 5);
        });

        it('reports qualityValid=false when quality is invalid', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([failedTest], makeHub([], false));

            expect(out[0]?.qualityValid).toBeFalsy();
        });

        it('reports sourceConfidence null when provenance absent', () => {
            expect.hasAssertions();

            const hub = {
                getFailureRecords: () => [],
                getQuality: () => undefined,
                getProvenance: () => undefined,
            } as unknown as DataHub;
            const out = crossReferenceFailures([failedTest], hub);

            expect(out[0]?.sourceConfidence).toBeNull();
        });

        it('marks unmatched failures as not found', () => {
            expect.hasAssertions();

            const out = crossReferenceFailures([failedTest], makeHub([]));

            expect(out[0]?.found).toBeFalsy();
            expect(out[0]?.priorCategory).toBeUndefined();
        });
    });

    describe('GetCommitAuthor', () => {
        it('returns unknown when diff has no file markers', () => {
            expect.hasAssertions();
            expect(getCommitAuthor('no files here')).toBe('unknown');
        });

        it('returns unknown when blame yields no author', () => {
            expect.hasAssertions();

            vi.mocked(execFileSync).mockReturnValue('');

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('unknown');
        });

        it('returns author with email from blame output', () => {
            expect.hasAssertions();

            const blame = ['author Jane Doe', 'author-mail <jane@example.com>', 'line 1', 'line 2'].join('\n');
            vi.mocked(execFileSync).mockReturnValue(blame);

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('Jane Doe <jane@example.com>');
        });

        it('returns author without email when author-mail absent', () => {
            expect.hasAssertions();

            vi.mocked(execFileSync).mockReturnValue('author Solo\nother line');

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('Solo');
        });

        it('returns unknown WITHOUT throwing when git blame itself throws for a candidate file', () => {
            expect.assertions(2);

            const debugSpy = vi.spyOn(rootLogger, 'debug').mockImplementation(() => undefined);
            vi.mocked(execFileSync).mockImplementation(() => {
                throw new Error('fatal: not a git repository');
            });

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('unknown');
            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('git blame failed'));

            debugSpy.mockRestore();
        });

        it('returns unknown WITHOUT throwing when the ignore-rev config lookup throws', () => {
            expect.assertions(2);

            const debugSpy = vi.spyOn(rootLogger, 'debug').mockImplementation(() => undefined);
            vi.spyOn(Config, 'get').mockImplementationOnce(function (this: void): void {
                throw new Error('config unavailable');
            });

            expect(getCommitAuthor('--- a/src/x.ts\n+++ b/src/x.ts')).toBe('unknown');
            expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('author extraction failed'));

            debugSpy.mockRestore();
        });
    });

    describe('AnalyzeFailuresWithReport', () => {
        const failed: FlatTest = { title: 'checkout total is wrong', state: 'failed', duration: 30 };

        beforeEach(() => {
            vi.mocked(reviewWithLlm).mockReset();
            vi.mocked(generateReportWithFallback).mockClear();
            vi.mocked(snapshotLlmMetrics).mockClear();
        });

        it('returns high-confidence empty result when there are no failed tests', async () => {
            expect.assertions(3);

            const out = await analyzeFailuresWithReport([{ title: 'ok', state: 'passed', duration: 1 }]);

            expect(out).toStrictEqual({ content: '', confidence: 'high', fallbackUsed: false });
            expect(reviewWithLlm).not.toHaveBeenCalled();
            expect(generateReportWithFallback).not.toHaveBeenCalled();
        });

        it('builds an HTML report and snapshots metrics on the happy path', async () => {
            expect.assertions(4);

            const review: ReviewResult = {
                content: 'root cause: rounding',
                reviewed: true,
                confidence: 'high',
                fallbackUsed: false,
            };
            vi.mocked(reviewWithLlm).mockResolvedValue(review);

            const out = await analyzeFailuresWithReport([failed]);

            expect(out.content).toBe('root cause: rounding');
            expect(out.htmlReport).toBe('<html>report</html>');
            expect(out.confidence).toBe('high');
            expect(snapshotLlmMetrics).toHaveBeenCalledTimes(1);
        });

        it('includes git commits, trend, and jira context in the LLM user message when provided', async () => {
            expect.assertions(3);

            const review: ReviewResult = { content: 'x', reviewed: true, confidence: 'high', fallbackUsed: false };
            vi.mocked(reviewWithLlm).mockResolvedValue(review);

            await analyzeFailuresWithReport([failed], {
                gitCommits: 'abc123 fix rounding',
                gitTrend: 'pass rate 80%',
                jiraIssues: 'PROJ-1 open',
            });

            const userMessage = vi.mocked(reviewWithLlm).mock.calls[0]?.[1] ?? '';

            expect(userMessage).toContain('Recent Commits:');
            expect(userMessage).toContain('Pass Rate Trend:');
            expect(userMessage).toContain('Related Jira Issues:');
        });

        it('cross-references prior failure records into the LLM user message when a dataHub is provided', async () => {
            expect.assertions(2);

            const review: ReviewResult = { content: 'x', reviewed: true, confidence: 'medium', fallbackUsed: false };
            vi.mocked(reviewWithLlm).mockResolvedValue(review);
            const rec: FailureRecord = {
                name: 'checkout total is wrong',
                status: 'failed',
                category: 'ASSERT',
                confidence: 0.8,
                source: 's',
            };

            await analyzeFailuresWithReport([failed], undefined, { dataHub: makeHub([rec]) });

            const userMessage = vi.mocked(reviewWithLlm).mock.calls[0]?.[1] ?? '';

            expect(userMessage).toContain('Prior Failure Records');
            expect(userMessage).toContain('prior category=ASSERT');
        });

        it('annotates the user message when a failure has no prior record and quality is invalid', async () => {
            expect.assertions(2);

            const review: ReviewResult = { content: 'x', reviewed: true, confidence: 'high', fallbackUsed: false };
            vi.mocked(reviewWithLlm).mockResolvedValue(review);

            await analyzeFailuresWithReport([failed], undefined, { dataHub: makeHub([], false) });

            const userMessage = vi.mocked(reviewWithLlm).mock.calls[0]?.[1] ?? '';

            expect(userMessage).toContain('no prior failure record');
            expect(userMessage).toContain('[failure-records quality issue]');
        });

        it('degrades to a medium-confidence fallback when the prompt template cannot be read', async () => {
            expect.assertions(2);

            vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
                throw new Error('template missing');
            });

            const out = await analyzeFailuresWithReport([failed]);

            expect(out).toStrictEqual({ content: '', confidence: 'medium', fallbackUsed: true });
            expect(reviewWithLlm).not.toHaveBeenCalled();
        });

        it('degrades to fallback WITHOUT silencing when the LLM call throws (logs a warning)', async () => {
            expect.assertions(3);

            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            vi.mocked(reviewWithLlm).mockRejectedValue(new Error('LLM unreachable'));

            const out = await analyzeFailuresWithReport([failed]);

            expect(out).toStrictEqual({ content: '', confidence: 'medium', fallbackUsed: true });
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LLM unreachable'));
            expect(generateReportWithFallback).not.toHaveBeenCalled();

            warnSpy.mockRestore();
        });

        it('propagates fallbackUsed from the review result', async () => {
            expect.assertions(1);

            const review: ReviewResult = { content: 'c', reviewed: false, confidence: 'low', fallbackUsed: true };
            vi.mocked(reviewWithLlm).mockResolvedValue(review);

            const out = await analyzeFailuresWithReport([failed]);

            expect(out.fallbackUsed).toBeTruthy();
        });
    });

    describe('ClassifyFailure', () => {
        beforeEach(() => {
            vi.mocked(llmPrompt).mockReset();
        });

        it('returns the consensus winner running the REAL self-consistency + schema validator (agreement)', async () => {
            expect.assertions(2);

            const infoSpy = vi.spyOn(rootLogger, 'info').mockImplementation(() => undefined);
            vi.mocked(llmPrompt).mockResolvedValue('ASSERTION: expected 42 but got 41');

            const out = await classifyFailure('checkout total', 'expected 42 but got 41');

            expect(out).toBe('ASSERTION: expected 42 but got 41');
            expect(infoSpy).not.toHaveBeenCalled();

            infoSpy.mockRestore();
        });

        it('drops candidates that fail the CLASSIFY-SCHEMA invariant and returns a schema-valid winner', async () => {
            expect.assertions(2);

            vi.mocked(llmPrompt)
                .mockResolvedValueOnce('this has no category prefix')
                .mockResolvedValueOnce('TIMEOUT: exceeded 5000ms')
                .mockResolvedValueOnce('TIMEOUT: exceeded 5000ms');

            const out = await classifyFailure('slow test', 'timed out');

            expect(out).toBe('TIMEOUT: exceeded 5000ms');
            expect(vi.mocked(llmPrompt)).toHaveBeenCalledTimes(3);
        });

        it('logs the divergence level when self-consistency candidates disagree', async () => {
            expect.assertions(2);

            const infoSpy = vi.spyOn(rootLogger, 'info').mockImplementation(() => undefined);
            vi.mocked(llmPrompt)
                .mockResolvedValueOnce('ASSERTION: expected true but received false in the login flow assertion')
                .mockResolvedValueOnce('ASSERTION: expected true but received false in the login flow assertion')
                .mockResolvedValueOnce('FLAKY: intermittent network blip caused a sporadic non-deterministic fail');

            const out = await classifyFailure('login test', 'assertion mismatch');

            expect(out).toContain('ASSERTION');
            expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('self-consistency divergence level ='));

            infoSpy.mockRestore();
        });

        it('falls back to a single llmPrompt call when every consensus candidate is rejected', async () => {
            expect.assertions(3);

            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            vi.mocked(llmPrompt)
                .mockRejectedValueOnce(new Error('gen 1 failed'))
                .mockRejectedValueOnce(new Error('gen 2 failed'))
                .mockRejectedValueOnce(new Error('gen 3 failed'))
                .mockResolvedValueOnce('ENVIRONMENT: missing dependency');

            const out = await classifyFailure('env test', 'module not found');

            expect(out).toBe('ENVIRONMENT: missing dependency');
            expect(vi.mocked(llmPrompt)).toHaveBeenCalledTimes(4);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Self-consistency failed'));

            warnSpy.mockRestore();
        });

        it('returns an explicit UNKNOWN when consensus AND the fallback llmPrompt both fail (no silencing)', async () => {
            expect.assertions(2);

            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            vi.mocked(llmPrompt).mockRejectedValue(new Error('prompt failed'));

            const out = await classifyFailure('broken test', 'boom');

            expect(out).toBe('UNKNOWN: Could not classify failure after retry');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('llmPrompt + Zod validation failed'));

            warnSpy.mockRestore();
        });

        it('returns an explicit UNKNOWN when the prompt template cannot be loaded', async () => {
            expect.assertions(2);

            vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
                throw new Error('template missing');
            });

            const out = await classifyFailure('title', 'error');

            expect(out).toBe('UNKNOWN: Could not load prompt template');
            expect(llmPrompt).not.toHaveBeenCalled();
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });
});
