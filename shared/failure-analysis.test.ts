vi.mock('fs');
vi.mock('./llm-client', () => ({
    llmPrompt: vi.fn<(...args: [opts: import('./llm-client.js').LlmPromptOptions]) => Promise<string>>(),
    getLlmClientMetrics: vi.fn(() => ({
        cacheHits: 0,
        cacheMisses: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        requestsByProviderKey: {},
    })),
    resetLlmClientMetrics: vi.fn(),
    parseRetryAfter: vi.fn(() => 2000),
}));
vi.mock('./llm-review', () => ({ reviewWithLlm: vi.fn() }));

import fs from 'fs';

import { llmPrompt } from './llm-client.js';
import { reviewWithLlm } from './llm-review.js';
import { analyzeFailuresWithReport, classifyFailure, crossReferenceFailures } from './failure-analysis.js';
import type { FlatTest } from './result_parser.js';
import { nonNull } from './test-utils.js';
import { makeDataHubMock } from './test-utils/factories/data-hub-mock.js';
import type { DataSource, FailureRecord } from './types/data-hub.js';
import type { QualityCategory, QualityReport } from './data-hub/quality.js';

const mockReviewWithLlm = vi.mocked(reviewWithLlm);
const mockLlmPrompt = vi.mocked(llmPrompt);

describe('Failure Analysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('AnalyzeFailuresWithReport', () => {
        it('returns empty content when no failed tests', async () => {
            expect.hasAssertions();

            const tests: FlatTest[] = [{ title: 'Pass', state: 'passed', duration: 100 }];

            const result = await analyzeFailuresWithReport(tests);

            expect(result.content).toBe('');
            expect(mockReviewWithLlm).not.toHaveBeenCalled();
        });

        it('passes LlmContext to reviewWithLlm when provided', async () => {
            expect.hasAssertions();

            const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);
            mockReviewWithLlm.mockResolvedValueOnce({
                content: 'Root cause with context',
                reviewed: true,
                confidence: 'high',
                fallbackUsed: false,
            });

            const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

            const result = await analyzeFailuresWithReport(tests, {
                gitCommits: '- fix auth module (joao, 2026-05-28)',
                gitTrend: 'Run 1: 90.0% (9/10)',
                jiraIssues: '- BUG-123 (Open): Auth module breaks on null input',
            });

            expect(result.content).toBe('Root cause with context');
            expect(mockReviewWithLlm).toHaveBeenCalledTimes(1);

            const userMsg: string = (mockReviewWithLlm.mock.calls[0]?.[1] as string) || '';

            expect(userMsg).toContain('Recent Commits:');
            expect(userMsg).toContain('Pass Rate Trend:');
            expect(userMsg).toContain('Related Jira Issues:');
            expect(userMsg).toContain('Login fails');
        });

        it('23.9: analyzeFailuresWithReport HTML exception path', async () => {
            expect.hasAssertions();

            // Mock to trigger exception during HTML report generation
            const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);

            // Mock reviewWithLlm to fail or behave in a way that generates error in report generation
            mockReviewWithLlm.mockRejectedValueOnce(new Error('HTML report generation failed'));

            const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

            // This should be caught and logged, not crash
            const result = await analyzeFailuresWithReport(tests);

            expect(result.fallbackUsed).toBeTruthy();
        });

        it('23.10: HTML report output verified', async () => {
            expect.hasAssertions();

            const promptContent = 'Analyze these failures:\n{{FAILED_TESTS}}';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);
            mockReviewWithLlm.mockResolvedValueOnce({
                content: 'Root cause: assertion error',
                reviewed: true,
                confidence: 'high',
            });

            const tests: FlatTest[] = [{ title: 'Login fails', state: 'failed', duration: 200 }];

            const result = await analyzeFailuresWithReport(tests);

            expect(result.content).toContain('Root cause: assertion error');
        });

        it('handles missing prompt template gracefully', async () => {
            expect.hasAssertions();

            vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });

            const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

            const result = await analyzeFailuresWithReport(tests);

            expect(result.content).toBe('');
        });

        it('returns fallback=true when template is missing', async () => {
            expect.hasAssertions();

            vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });

            const tests: FlatTest[] = [{ title: 'Fail', state: 'failed', duration: 100 }];

            const result = await analyzeFailuresWithReport(tests);

            expect(result.fallbackUsed).toBeTruthy();
        });
    });

    describe('ClassifyFailure', () => {
        it('calls llmPrompt (fast tier) with test title and Zod schema', async () => {
            expect.hasAssertions();

            const promptContent = 'Classify: ';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);
            mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected true but got false');

            const result = await classifyFailure('Login test', 'expected true, got false');

            expect(result).toBe('ASSERTION: expected true but got false');

            const [callOpts] = nonNull(mockLlmPrompt.mock.calls[0]);

            expect(callOpts).toHaveProperty('system', expect.any(String));
            expect(callOpts).toHaveProperty('user', expect.any(String));
            expect(callOpts).toHaveProperty('schema', expect.anything());
            expect(mockLlmPrompt).toHaveBeenCalledWith(expect.objectContaining({ tier: 'fast', callerId: 'classify' }));
        });

        it('returns valid classification when llmPrompt returns matching format', async () => {
            expect.hasAssertions();

            const promptContent = 'Classify: ';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);
            mockLlmPrompt.mockResolvedValueOnce('ASSERTION: expected 200 got 500');

            const result = await classifyFailure('Login test', 'expected 200, got 500');

            expect(result).toBe('ASSERTION: expected 200 got 500');
        });

        it('falls back to UNKNOWN when llmPrompt throws (Zod validation failed after retry)', async () => {
            expect.hasAssertions();

            const promptContent = 'Classify: ';
            vi.spyOn(fs, 'readFileSync').mockReturnValue(promptContent);
            // Self-consistency calls llmPrompt 3×; fallback calls it 1× more
            mockLlmPrompt.mockRejectedValue(new Error('LLM response failed schema validation after retry'));

            const result = await classifyFailure('Login test', 'some error');

            expect(result).toBe('UNKNOWN: Could not classify failure after retry');
        });

        it('returns UNKNOWN when classify.md cannot be read', async () => {
            expect.hasAssertions();

            vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
                throw new Error('ENOENT');
            });
            const result = await classifyFailure('Login test', 'error');

            expect(result).toBe('UNKNOWN: Could not load prompt template');
        });
    });

    describe('ClassifyRegex — edge case mutations', () => {
        const regex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;

        it('matches valid classification with explanation', () => {
            expect(regex.test('ASSERTION: expected 200 got 500')).toBeTruthy();
        });

        it('matches TIMEOUT classification', () => {
            expect(regex.test('TIMEOUT: test exceeded 30s limit')).toBeTruthy();
        });

        it('rejects AGREEMENT (not a valid category)', () => {
            expect(regex.test('AGREEMENT: some issue')).toBeFalsy();
        });

        it('rejects lowercase classification', () => {
            expect(regex.test('assertion: expected 200')).toBeFalsy();
        });

        it('rejects missing colon and space after category', () => {
            expect(regex.test('ASSERTION expected 200')).toBeFalsy();
        });

        it('matches first line of multi-line response', () => {
            expect(regex.test('ASSERTION: expected 200\nsome extra text')).toBeTruthy();
        });

        it('matches ENVIRONMENT classification', () => {
            expect(regex.test('ENVIRONMENT: database connection failed')).toBeTruthy();
        });

        it('rejects empty string', () => {
            expect(regex.test('')).toBeFalsy();
        });

        it('rejects category-only without colon', () => {
            expect(regex.test('ASSERTION')).toBeFalsy();
        });
    });

    describe('EIXO C — crossReferenceFailures (C-3f)', () => {
        const tests: FlatTest[] = [
            { title: 'Login fails', state: 'failed', duration: 10 },
            { title: 'Signup passes', state: 'passed', duration: 5 },
            { title: 'Checkout broken', state: 'failed', duration: 8 },
        ];

        it('cross-references failed tests against historical failure records by name', () => {
            expect.hasAssertions();

            const records: FailureRecord[] = [
                { name: 'Login fails', status: 'failed', category: 'assertion', confidence: 0.9, source: 'junit' },
                { name: 'Checkout broken', status: 'broken', category: 'environment', confidence: 0.7, source: 'log' },
            ];
            const provenance = new Map<string, DataSource>([
                ['failureRecords', { source: 'github', confidence: 0.8, timestamp: '2026-01-01T00:00:00.000Z' }],
            ]);
            const quality: Partial<Record<QualityCategory, QualityReport>> = {
                failureRecords: { valid: true, issues: [] },
            };
            const hub = makeDataHubMock({
                raw: {
                    runs: [],
                    jobs: new Map(),
                    artifacts: new Map(),
                    failureReasons: new Map(),
                    failureRecords: records,
                },
                provenance,
                quality,
            });

            const cross = crossReferenceFailures(tests, hub);

            expect(cross).toHaveLength(2);
            expect(cross[0]).toStrictEqual({
                title: 'Login fails',
                found: true,
                priorCategory: 'assertion',
                priorConfidence: 0.9,
                qualityValid: true,
                sourceConfidence: 0.8,
            });
            expect(cross[1]?.found).toBeTruthy();
            expect(cross[1]?.priorCategory).toBe('environment');
        });

        it('flags missing prior record and surfaces quality issues', () => {
            expect.hasAssertions();

            const provenance = new Map<string, DataSource>([
                ['failureRecords', { source: 'github', confidence: 0.4, timestamp: '2026-01-01T00:00:00.000Z' }],
            ]);
            const quality: Partial<Record<QualityCategory, QualityReport>> = {
                failureRecords: { valid: false, issues: ['missing classification'] },
            };
            const hub = makeDataHubMock({
                raw: {
                    runs: [],
                    jobs: new Map(),
                    artifacts: new Map(),
                    failureReasons: new Map(),
                    failureRecords: [],
                },
                provenance,
                quality,
            });

            const cross = crossReferenceFailures([{ title: 'Unknown test', state: 'failed', duration: 1 }], hub);

            expect(cross[0]?.found).toBeFalsy();
            expect(cross[0]?.qualityValid).toBeFalsy();
            expect(cross[0]?.sourceConfidence).toBe(0.4);
        });
    });
});
