import os from 'os';
import path from 'path';
import { expect, vi } from 'vitest';

vi.mock('../../../shared/ui/prompt.js');
vi.mock('../../../shared/logger');

vi.mock('../../../shared/result_parser', () => ({
    parseTestResultsFile: vi.fn(),
}));

// F0-T8: `report-generator` e `failure-analysis` NÃO são mockados (mock-theater
// removido). O relatório real roda com `computed` reconciliado do hub; a análise
// real usa a fronteira LLM (reviewWithLlm/snapshotLlmMetrics) como único mock
// (§26 boundary).

vi.mock('../../../shared/llm/llm-review.js', () => ({ reviewWithLlm: vi.fn() }));
vi.mock('../../../shared/llm/llm-metrics.js', () => ({ snapshotLlmMetrics: vi.fn() }));
vi.mock('../../../shared/llm/llm-client.js', () => ({ llmPrompt: vi.fn() }));
vi.mock('../../../shared/ui/spinner.js', () => ({
    withSpinner: vi.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));
vi.mock('child_process', () => ({ execFileSync: vi.fn(() => '') }));

vi.mock('../../../shared/publish', () => ({
    publishReport: vi.fn(),
}));

vi.mock('../../../shared/open', () => ({
    openWithOsOrFallback: vi.fn(),
    openWithFallback: vi.fn(),
}));

vi.mock('../../../shared/infra/temp-dir.js', () => ({
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'qa-test-report.html')),
}));

vi.mock('../../../shared/report/bug-report.js', () => ({
    collectAutomated: vi.fn(),
    interactiveBugReportFlow: vi.fn(),
}));

vi.mock('../../../shared/ci/git-sha.js', () => ({
    detectGitDir: vi.fn().mockReturnValue(null),
    getHeadSha: vi.fn().mockReturnValue(null),
    getCurrentBranch: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../shared/infra/store-backend.js', () => ({
    detectStoreBackend: vi.fn().mockReturnValue({
        init: vi.fn(),
        read: vi.fn().mockReturnValue(null),
        write: vi.fn(),
    }),
    detectProjectGitDir: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../shared/session-context', () => {
    // F0-T8 (SSOT): `store` é o hub. `saveParseResult` reconcilia `computed`
    // (reflete o run salvo) — mesmo contrato do DataHubImpl real.
    const store = {
        loadReport: vi.fn().mockReturnValue(null),
        loadMetrics: vi.fn(() => loadMetricsValue),
        saveMetrics: vi.fn(),
        saveParseResult: vi.fn(),
        computed: undefined as unknown,
    };
    store.saveParseResult.mockImplementation((_project: string, _result: { tests: unknown[] }) => {
        store.computed = {
            passRate: 100,
            metricsRuns: [{ tests: _result.tests }],
        };
        return {
            timestamp: '',
            project: '',
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            tests: _result.tests,
        };
    });
    return {
        resolveTestDataSource: vi.fn().mockResolvedValue(null),
        resolveSessionContext: vi.fn().mockReturnValue({
            sha: null,
            branch: null,
            store,
        }),
    };
});

const { hubState } = vi.hoisted(() => {
    const state: { hub: unknown } = { hub: undefined };
    return { hubState: state };
});

vi.mock('../../../shared/data-hub/global-hub', () => ({
    isDataHubInitialized: () => hubState.hub !== undefined,
    getDataHub: () => hubState.hub,
    setDataHub: (hub: unknown) => {
        hubState.hub = hub;
    },
}));

let loadMetricsValue: unknown = null;

vi.mock('../../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

vi.mock('fs');

vi.mock('../../../shared/infra/http-client.js', () => ({
    createHttpClient: vi.fn(),
    createThrottledClient: vi.fn(),
    setTestSleep: vi.fn(),
}));

import * as promptModule from '../../../shared/ui/prompt.js';
import * as parserModule from '../../../shared/result_parser.js';
import * as reportGenModule from '../../../shared/report/report-generator.js';
import { reviewWithLlm } from '../../../shared/llm/llm-review.js';
import { snapshotLlmMetrics } from '../../../shared/llm/llm-metrics.js';
import { createDataHubFromParseResult } from '../../../shared/data-hub/factory.js';
import type { ParseResult } from '../../../shared/result_parser.js';
import * as publishModule from '../../../shared/publish.js';
import * as openModule from '../../../shared/open.js';
import fs from 'fs';
import case17Module from '../case17.js';
import { createMockContext } from '../../../shared/test-utils/factories/context-factory.js';
import { resolveTestDataSource } from '../../../shared/session-context.js';
import * as case17Helpers from '../case17-helpers.js';

const baseContext = createMockContext();

describe('Case17', () => {
    beforeAll(() => {
        if (!vi.isMockFunction(openModule.openWithFallback)) {
            throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
        }
    });

    beforeEach(() => {
        vi.clearAllMocks();
        loadMetricsValue = null;
        hubState.hub = undefined;
        // Isolamento de teste (§19): `vi.clearAllMocks()` não reseta implementações —
        // sem estes resets, o mockReturnValue de readFileSync/existsSync de um teste
        // anterior vaza para o seguinte (ex: análise IA lê o prompt real e invoca o LLM).
        vi.mocked(fs).readFileSync.mockReset();
        vi.mocked(fs).existsSync.mockReset();
        // Ensure withSpinner invokes the callback (auto-mock returns undefined otherwise)
        vi.mocked(promptModule).withSpinner.mockImplementation(async (_label: string, fn: () => Promise<unknown>) =>
            fn(),
        );
    });

    describe('Case17 — HTML report generator', () => {
        it('generates report successfully', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                issues: [{ key: 'BUG-1', fields: { summary: 'Login fails', status: { name: 'Open' } } }],
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'fail' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('passes computed (SSOT F0-T8) to generateHtmlReport — o hub reconcilia o run atual', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const genSpy = vi.spyOn(reportGenModule, 'generateHtmlReport');

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'fail' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(genSpy).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({
                    computed: expect.objectContaining({ passRate: expect.any(Number) as number }) as object,
                }),
            );

            // O gerador REAL rodou (spy sem mockReturnValue) e não produziu error page.
            expect(String(genSpy.mock.results[0]?.value ?? '')).not.toContain('Error generating report');
        });

        it('computes diff against last run and logs info', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);

            vi.mocked(resolveTestDataSource).mockResolvedValueOnce({
                result: {
                    tests: [
                        { title: 'Test A', state: 'passed', duration: 100, fullTitle: 'Test A' },
                        { title: 'Test B', state: 'failed', duration: 50, fullTitle: 'Test B', error: 'fail' },
                    ],
                    stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
                },
                source: 'cache',
            });

            prompt.ask.mockResolvedValueOnce('');

            loadMetricsValue = {
                tests: [
                    { title: 'Test A', state: 'failed' },
                    { title: 'Test B', state: 'passed' },
                ],
            };

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Diff:'));
        });

        it('skips AI analysis and prompts bug report when failures and user accepts', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);

            process.env['QA_AUTO_BUG'] = 'true';

            vi.mocked(resolveTestDataSource).mockResolvedValueOnce({
                result: {
                    tests: [
                        { title: 'Pass', state: 'passed', duration: 100, fullTitle: 'Pass' },
                        { title: 'Fail', state: 'failed', duration: 50, fullTitle: 'Fail', error: 'Timeout' },
                    ],
                    stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
                },
                source: 'cache',
            });

            prompt.ask.mockResolvedValueOnce('');

            const mockPostJira = vi.spyOn(baseContext.jiraResource, 'postJiraResource');
            mockPostJira.mockResolvedValue({ key: 'BUG-42' });

            loadMetricsValue = {
                tests: [{ title: 'Fail', state: 'passed' }],
            };

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Jira bug auto-criado: BUG-42'));
        });

        it('resolves mapping file and test history', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const genSpy = vi.spyOn(reportGenModule, 'generateHtmlReport');

            process.env['QA_MAPPING_PATH'] = path.join(os.tmpdir(), 'qa-mapping.json');

            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(
                JSON.stringify({
                    tests: [
                        { title: 'Test 1', key: 'TEST-123' },
                        { title: 'Test 2', key: 'TEST-456' },
                    ],
                }),
            );

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [
                    { title: 'Test 1', state: 'passed', duration: 100 },
                    { title: 'Test 2', state: 'passed', duration: 200 },
                ],
                stats: { passed: 2, failed: 0, skipped: 0, total: 2, duration: 300 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(genSpy).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({
                    computed: expect.objectContaining({ passRate: expect.any(Number) as number }) as object,
                }),
            );
            // O gerador REAL rodou (spy sem mockReturnValue) e não produziu error page.
            expect(String(genSpy.mock.results[0]?.value ?? '')).not.toContain('Error generating report');
        });

        it('handles AI analysis with empty content returning html unchanged', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            const parseResult: ParseResult = {
                tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            };
            // F0-T8: o hub global é a fonte da análise real. Hub dedicado reflete o parse.
            hubState.hub = createDataHubFromParseResult(parseResult, 'proj');

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce(parseResult);

            prompt.askConfirm.mockResolvedValue(true);

            const mod = case17Module;
            await mod.handler(baseContext);

            // Template ausente (fs mock) → analyze retorna vazio SEM chamar o LLM
            // (caminho real, sem mock-teater de analyzeFailuresWithReport).
            expect(reviewWithLlm).not.toHaveBeenCalled();
            expect(snapshotLlmMetrics).not.toHaveBeenCalled();
            expect(prompt.printError).not.toHaveBeenCalledWith('Falha ao analisar falhas com IA', expect.any(Error));
        });

        it('handles _fetchJiraContext when issues list is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                issues: [],
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles fetchJiraContext with missing issues field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                // no issues field at all
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
        });

        it('handles computeDiff with missing tests field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            vi.mocked(fs).existsSync.mockReturnValueOnce(true);
            vi.mocked(fs).readFileSync.mockReturnValueOnce(
                JSON.stringify({
                    results: {
                        // no tests field
                    },
                }),
            );

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('resolves mapping with missing tests field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            process.env['QA_MAPPING_PATH'] = path.join(os.tmpdir(), 'qa-missing-tests.json');

            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles parseCliExtra with invalid flags', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--unknown-flag', '--publish', '', '--run', 'nofile'];

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);

            process.argv = origArgv;
        });

        it('builds diff summary with failure that has no error message', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            // Previous run had one test that was passing
            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(
                JSON.stringify({
                    results: { tests: [{ name: 'Only Fail', status: 'passed' }] },
                }),
            );

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [
                    { title: 'Only Fail', state: 'failed', duration: 50 },
                    { title: 'No Prior', state: 'passed', duration: 10 },
                ],
                stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 60 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            // Verify handler runs to completion
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles parseCliExtra with --run edge cases', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--run', '=onlyfile', '--run', 'name='];

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);

            process.argv = origArgv;
        });

        it('injects AI analysis into html without bodyEnd', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            const parseResult: ParseResult = {
                tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            };
            hubState.hub = createDataHubFromParseResult(parseResult, 'proj');

            // Template disponível (fs mock → retorna o prompt p/ failure-analysis.md) e
            // LLM real via fronteira reviewWithLlm (único mock, §26).
            vi.mocked(fs).readFileSync.mockImplementationOnce((filePath: unknown) =>
                String(filePath).endsWith('failure-analysis.md') ? 'Analyze failures: {failed}' : '',
            );
            vi.mocked(reviewWithLlm).mockResolvedValue({
                content: 'Analysis text',
                confidence: 'high',
                fallbackUsed: false,
            } as never);

            prompt.askConfirm.mockResolvedValue(true);

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce(parseResult);

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(reviewWithLlm).toHaveBeenCalledTimes(1);
            expect(snapshotLlmMetrics).toHaveBeenCalledWith();
        });

        it('handles empty filepath early return (line 166-167)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);

            prompt.ask.mockResolvedValueOnce('');

            const mod = case17Module;
            const result = await mod.handler(baseContext);

            expect(result).toBeUndefined();
            expect(prompt.printError).toHaveBeenCalledTimes(1);
        });

        it('handles parse error in report file (line 175-176)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            prompt.ask.mockResolvedValueOnce('/report.json');

            parser.parseTestResultsFile.mockReturnValueOnce({
                error: 'File not found',
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            });

            const mod = case17Module;
            const result = await mod.handler(baseContext);

            expect(result).toBeUndefined();
            expect(prompt.printError).toHaveBeenCalledWith('Erro ao ler relatório', expect.any(Error));
        });

        it('handles extra runs via --run flag', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const genSpy = vi.spyOn(reportGenModule, 'generateHtmlReport');

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--run', 'extra=extra-report.json'];

            parser.parseTestResultsFile
                .mockReturnValueOnce({
                    tests: [{ title: 'Primary', state: 'passed', duration: 100 }],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                })
                .mockReturnValueOnce({
                    tests: [{ title: 'Extra', state: 'passed', duration: 50 }],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 50 },
                });

            prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(genSpy).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({
                    runs: expect.arrayContaining([expect.objectContaining({ name: 'Primary' })]) as Array<{
                        name: string;
                    }>,
                }),
            );

            process.argv = origArgv;
        });

        it('handles quality gate and publish target (lines 208-209, 263-264)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const publish = vi.mocked(publishModule);

            process.env['QA_FAIL_ON'] = '80';
            process.env['QA_PUBLISH'] = 's3';

            prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Pass', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(publish.publishReport).toHaveBeenCalledWith(expect.objectContaining({ target: 's3' }));

            process.env['QA_FAIL_ON'] = undefined;
            process.env['QA_PUBLISH'] = undefined;
        });

        it('fails quality gate when pass rate below threshold (lines 283-284)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            process.env['QA_FAIL_ON'] = '90';

            prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');
            prompt.askConfirm.mockResolvedValueOnce(false);

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [
                    { title: 'Pass', state: 'passed', duration: 100 },
                    { title: 'Fail', state: 'failed', duration: 50, error: 'err' },
                ],
                stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
            });

            const mod = case17Module;
            const result = await mod.handler(baseContext);

            expect(result).toBeFalsy();
            expect(prompt.printError).toHaveBeenCalledWith('Quality Gate', expect.any(Error));

            process.env['QA_FAIL_ON'] = undefined;
        });

        it('writes to custom output path when user provides non-empty path (lines 84-87)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ results: { tests: [] } }));

            prompt.ask
                .mockResolvedValueOnce('/path/to/report.json')
                .mockResolvedValueOnce('/custom/output/report.html');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(vi.mocked(fs).mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('/custom/output'),
                expect.objectContaining({ recursive: true }),
            );
            expect(vi.mocked(fs).writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('/custom/output'),
                expect.any(String),
                'utf8',
            );
        });

        it('handles extra run parse error (lines 190-191)', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--run', 'extra=bad-file.json'];

            parser.parseTestResultsFile
                .mockReturnValueOnce({
                    tests: [{ title: 'Main', state: 'passed', duration: 100 }],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
                })
                .mockReturnValueOnce({
                    error: 'Bad file format',
                    tests: [],
                    stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
                });

            prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledWith(
                expect.stringContaining('Erro ao ler run adicional'),
                expect.any(Error),
            );

            process.argv = origArgv;
        });
    });

    describe('Case17 — commitLog wiring', () => {
        it('threads hub.raw.commitLog into buildGitTrendHtml', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const spy = vi.spyOn(case17Helpers, 'buildGitTrendHtml');

            hubState.hub = {
                raw: { commitLog: 'KNOWN_COMMIT_LOG' },
                computed: { metricsRuns: [] },
            };

            vi.mocked(resolveTestDataSource).mockResolvedValueOnce({
                result: {
                    tests: [{ title: 'T', state: 'passed', duration: 10, fullTitle: 'T' }],
                    stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 10 },
                },
                source: 'cache',
            });

            prompt.ask.mockResolvedValueOnce('');

            await case17Module.handler(baseContext);

            expect(spy).toHaveBeenCalledWith('KNOWN_COMMIT_LOG', expect.any(Array));

            spy.mockRestore();
        });
    });
});
