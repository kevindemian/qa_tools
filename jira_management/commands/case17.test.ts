import os from 'os';
import path from 'path';
import { expect, vi } from 'vitest';

vi.mock('../../shared/prompt');
vi.mock('../../shared/logger');

vi.mock('../../shared/result_parser', () => ({
    parseTestResultsFile: vi.fn(),
}));

vi.mock('../../shared/report-generator', () => ({
    generateHtmlReport: vi.fn(),

    categorizeFailure: vi.fn(),
}));

vi.mock('../../shared/publish', () => ({
    publishReport: vi.fn(),
}));

vi.mock('../../shared/failure-analysis', () => ({
    analyzeFailuresWithReport: vi.fn(),
}));

vi.mock('../../shared/open', () => ({
    openWithOsOrFallback: vi.fn(),
    openWithFallback: vi.fn(),
}));

vi.mock('../../shared/temp-dir', () => ({
    writeReport: vi.fn(() => path.join(os.tmpdir(), 'qa-test-report.html')),
}));

vi.mock('../../shared/bug-report', () => ({
    collectAutomated: vi.fn(),
    interactiveBugReportFlow: vi.fn(),
}));

vi.mock('../../shared/git-sha', () => ({
    detectGitDir: vi.fn().mockReturnValue(null),
    getHeadSha: vi.fn().mockReturnValue(null),
    getCurrentBranch: vi.fn().mockReturnValue(null),
}));

vi.mock('../../shared/store-backend', () => ({
    detectStoreBackend: vi.fn().mockReturnValue({
        init: vi.fn(),
        read: vi.fn().mockReturnValue(null),
        write: vi.fn(),
    }),
    detectProjectGitDir: vi.fn().mockReturnValue(null),
}));

vi.mock('../../shared/session-context', () => ({
    resolveTestDataSource: vi.fn().mockResolvedValue(null),
    resolveSessionContext: vi.fn().mockReturnValue({
        sha: null,
        branch: null,
        store: {
            loadReport: vi.fn().mockReturnValue(null),
            loadMetrics: vi.fn(() => loadMetricsValue),
            saveMetrics: vi.fn(),
        },
    }),
}));

let loadMetricsValue: unknown = null;

vi.mock('../../shared/store', () => {
    function makeMockStore() {
        const store = {
            lookup: vi.fn(),
            put: vi.fn(),
            listByProject: vi.fn().mockReturnValue([]),
            saveReport: vi.fn(),
            loadReport: vi.fn().mockReturnValue(null),
            loadMetrics: vi.fn(() => loadMetricsValue),
            saveMetrics: vi.fn(),
            appendBranch: vi.fn(),
            getBranch: vi.fn().mockReturnValue([]),
            flush: vi.fn(),
        };
        return store;
    }
    return {
        Store: vi.fn(function () {
            return makeMockStore();
        }),
    };
});

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        error: vi.fn(),
        warn: vi.fn(),
        child: vi.fn().mockReturnValue({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }),
    },
}));

vi.mock('fs');

vi.mock('../../shared/http-client', () => ({
    createHttpClient: vi.fn(),
    setTestSleep: vi.fn(),
}));

import * as promptModule from '../../shared/prompt.js';
import * as parserModule from '../../shared/result_parser.js';
import * as reportGenModule from '../../shared/report-generator.js';
import * as analysisModule from '../../shared/failure-analysis.js';
import * as publishModule from '../../shared/publish.js';
import * as openModule from '../../shared/open.js';
import fs from 'fs';
import case17Module from './case17.js';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';
import { resolveTestDataSource } from '../../shared/session-context.js';

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
            const reportGen = vi.mocked(reportGenModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                issues: [{ key: 'BUG-1', fields: { summary: 'Login fails', status: { name: 'Open' } } }],
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'fail' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('computes diff against last run and logs info', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

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
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const reportGenFull = vi.mocked(reportGenModule);
            reportGenFull.categorizeFailure.mockReturnValue('regression');

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
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(reportGen.generateHtmlReport).toHaveBeenCalledWith(
                expect.any(Array),
                expect.objectContaining({
                    testHistory: expect.any(Object) as object,
                }),
            );
        });

        it('handles AI analysis with empty content returning html unchanged', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);
            const analysis = vi.mocked(analysisModule);

            analysis.analyzeFailuresWithReport.mockResolvedValue({
                content: '',
                confidence: 'low',
                fallbackUsed: false,
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            prompt.askConfirm.mockResolvedValue(true);

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(analysis.analyzeFailuresWithReport).toHaveBeenCalledTimes(1);
        });

        it('handles _fetchJiraContext when issues list is empty', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                issues: [],
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles fetchJiraContext with missing issues field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);
            const mockGetJira = vi.spyOn(baseContext.jiraResource, 'getJiraResource');

            mockGetJira.mockResolvedValueOnce({
                // no issues field at all
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(mockGetJira).toHaveBeenCalledTimes(1);
        });

        it('handles computeDiff with missing tests field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('resolves mapping with missing tests field', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);

            process.env['QA_MAPPING_PATH'] = path.join(os.tmpdir(), 'qa-missing-tests.json');

            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles parseCliExtra with invalid flags', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--unknown-flag', '--publish', '', '--run', 'nofile'];

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);

            process.argv = origArgv;
        });

        it('builds diff summary with failure that has no error message', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            // Verify handler runs to completion
            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
        });

        it('handles parseCliExtra with --run edge cases', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);

            const origArgv = process.argv;
            process.argv = ['node', 'script', '--run', '=onlyfile', '--run', 'name='];

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);

            process.argv = origArgv;
        });

        it('injects AI analysis into html without bodyEnd', async () => {
            expect.hasAssertions();

            const prompt = vi.mocked(promptModule);
            const parser = vi.mocked(parserModule);
            const reportGen = vi.mocked(reportGenModule);
            const analysis = vi.mocked(analysisModule);

            prompt.askConfirm.mockResolvedValue(true);
            analysis.analyzeFailuresWithReport.mockResolvedValue({
                content: 'Analysis text',
                confidence: 'high',
                fallbackUsed: false,
            });

            prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
            });

            // HTML without </body> to cover the bodyEnd === -1 branch
            reportGen.generateHtmlReport.mockReturnValueOnce('<html><head></head><div>no body tag</div></html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(analysis.analyzeFailuresWithReport).toHaveBeenCalledTimes(1);
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
            const reportGen = vi.mocked(reportGenModule);

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
            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(reportGen.generateHtmlReport).toHaveBeenCalledWith(
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
            const reportGen = vi.mocked(reportGenModule);
            const publish = vi.mocked(publishModule);

            process.env['QA_FAIL_ON'] = '80';
            process.env['QA_PUBLISH'] = 's3';

            prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Pass', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

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
            const reportGen = vi.mocked(reportGenModule);

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

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

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
            const reportGen = vi.mocked(reportGenModule);

            vi.mocked(fs).existsSync.mockReturnValue(true);
            vi.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ results: { tests: [] } }));

            prompt.ask
                .mockResolvedValueOnce('/path/to/report.json')
                .mockResolvedValueOnce('/custom/output/report.html');

            parser.parseTestResultsFile.mockReturnValueOnce({
                tests: [{ title: 'Test', state: 'passed', duration: 100 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
            });

            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

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
            const reportGen = vi.mocked(reportGenModule);

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
            reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

            const mod = case17Module;
            await mod.handler(baseContext);

            expect(prompt.printError).toHaveBeenCalledWith(
                expect.stringContaining('Erro ao ler run adicional'),
                expect.any(Error),
            );

            process.argv = origArgv;
        });
    });
});
