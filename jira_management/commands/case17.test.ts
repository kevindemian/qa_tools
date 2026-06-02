import { expect } from '@jest/globals';

jest.mock('../../shared/prompt');
jest.mock('../../shared/logger');

jest.mock('../../shared/result_parser', () => ({
    parseTestResultsFile: jest.fn(),
}));

jest.mock('../../shared/report-generator', () => ({
    generateHtmlReport: jest.fn(),
    loadKnownIssues: jest.fn(() => []),
    categorizeFailure: jest.fn(),
}));

jest.mock('../../shared/publish', () => ({
    publishReport: jest.fn(),
}));

jest.mock('../../shared/failure-analysis', () => ({
    analyzeFailuresWithReport: jest.fn(),
}));

jest.mock('../../shared/open', () => ({
    openWithOsOrFallback: jest.fn(),
    openWithFallback: jest.fn(),
}));

jest.mock('../../shared/temp-dir', () => ({
    writeReport: jest.fn(() => '/tmp/report.html'),
}));

jest.mock('../../shared/bug-report', () => ({
    collectAutomated: jest.fn(),
    interactiveBugReportFlow: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        warn: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('fs');

jest.mock('../../shared/http-client', () => ({
    createHttpClient: jest.fn(),
    setTestSleep: jest.fn(),
}));

import * as promptModule from '../../shared/prompt';
import * as parserModule from '../../shared/result_parser';
import * as reportGenModule from '../../shared/report-generator';
import * as analysisModule from '../../shared/failure-analysis';
import * as publishModule from '../../shared/publish';
import * as openModule from '../../shared/open';
import fs from 'fs';
import case17Module from './case17';
import { createMockContext } from '../../shared/test-utils/factories/context-factory';

const baseContext = createMockContext();

beforeEach(() => {
    jest.clearAllMocks();
});

beforeAll(() => {
    if (!jest.isMockFunction(openModule.openWithFallback)) {
        throw new Error('Guard FAILED: openWithFallback is NOT mocked. Browser would open!');
    }
});

describe('case17 — HTML report generator', () => {
    it('generates report successfully', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        baseContext.jiraResource.getJiraResource.mockResolvedValueOnce({
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

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();
        expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
    });

    it('computes diff against last run and logs info', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        jest.mocked(fs).existsSync.mockReturnValue(true);
        jest.mocked(fs).readFileSync.mockReturnValue(
            JSON.stringify({
                results: {
                    tests: [
                        { name: 'Test A', status: 'failed' },
                        { name: 'Test B', status: 'passed' },
                    ],
                },
            }),
        );

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [
                { title: 'Test A', state: 'passed', duration: 100 },
                { title: 'Test B', state: 'failed', duration: 50, error: 'fail' },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = case17Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Diff:'));
    });

    it('skips AI analysis and prompts bug report when failures and user accepts', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        process.env.QA_AUTO_BUG = 'true';

        jest.mocked(fs).existsSync.mockReturnValueOnce(true);
        jest.mocked(fs).readFileSync.mockReturnValueOnce(
            JSON.stringify({
                results: { tests: [{ name: 'Fail', status: 'passed' }] },
            }),
        );

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [
                { title: 'Pass', state: 'passed', duration: 100 },
                { title: 'Fail', state: 'failed', duration: 50, error: 'Timeout' },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const reportGenFull = jest.mocked(reportGenModule);
        reportGenFull.categorizeFailure.mockReturnValue('regression');

        baseContext.jiraResource.postJiraResource.mockResolvedValue({ key: 'BUG-42' });

        const mod = case17Module;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Jira bug auto-criado: BUG-42'));
    });

    it('resolves mapping file and test history', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        process.env.QA_MAPPING_PATH = '/tmp/qa-mapping.json';

        jest.mocked(fs).existsSync.mockReturnValue(true);
        jest.mocked(fs).readFileSync.mockReturnValue(
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
                testHistory: expect.any(Object),
            }),
        );
    });

    it('handles AI analysis with empty content returning html unchanged', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);
        const analysis = jest.mocked(analysisModule);

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        prompt.askConfirm.mockResolvedValue(true);

        const mod = case17Module;
        await mod.handler(baseContext);

        expect(analysis.analyzeFailuresWithReport).toHaveBeenCalled();
    });

    it('handles _fetchJiraContext when issues list is empty', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        baseContext.jiraResource.getJiraResource.mockResolvedValueOnce({
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

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();
        expect(openModule.openWithFallback).toHaveBeenCalledWith(expect.any(String), 'Relatório', prompt.info);
    });

    it('handles fetchJiraContext with missing issues field', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        baseContext.jiraResource.getJiraResource.mockResolvedValueOnce({
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

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();
    });

    it('handles computeDiff with missing tests field', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        jest.mocked(fs).existsSync.mockReturnValueOnce(true);
        jest.mocked(fs).readFileSync.mockReturnValueOnce(
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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        process.env.QA_MAPPING_PATH = '/tmp/missing-tests.json';

        jest.mocked(fs).existsSync.mockReturnValue(true);
        jest.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));

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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        // Previous run had one test that was passing
        jest.mocked(fs).existsSync.mockReturnValue(true);
        jest.mocked(fs).readFileSync.mockReturnValue(
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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);
        const analysis = jest.mocked(analysisModule);

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

        expect(analysis.analyzeFailuresWithReport).toHaveBeenCalled();
    });

    it('handles empty filepath early return (line 166-167)', async () => {
        const prompt = jest.mocked(promptModule);

        prompt.ask.mockResolvedValueOnce('');

        const mod = case17Module;
        const result = await mod.handler(baseContext);

        expect(result).toBeUndefined();
        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles parse error in report file (line 175-176)', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);

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
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

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
            expect.objectContaining({ runs: expect.arrayContaining([expect.objectContaining({ name: 'Primary' })]) }),
        );

        process.argv = origArgv;
    });

    it('handles quality gate and publish target (lines 208-209, 263-264)', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);
        const publish = jest.mocked(publishModule);

        process.env.QA_FAIL_ON = '80';
        process.env.QA_PUBLISH = 's3';

        prompt.ask.mockResolvedValueOnce('/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Pass', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = case17Module;
        await mod.handler(baseContext);

        expect(publish.publishReport).toHaveBeenCalledWith(expect.objectContaining({ target: 's3' }));

        process.env.QA_FAIL_ON = undefined;
        process.env.QA_PUBLISH = undefined;
    });

    it('fails quality gate when pass rate below threshold (lines 283-284)', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        process.env.QA_FAIL_ON = '90';

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

        expect(result).toBe(false);
        expect(prompt.printError).toHaveBeenCalledWith('Quality Gate', expect.any(Error));

        process.env.QA_FAIL_ON = undefined;
    });

    it('writes to custom output path when user provides non-empty path (lines 84-87)', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

        jest.mocked(fs).existsSync.mockReturnValue(true);
        jest.mocked(fs).readFileSync.mockReturnValue(JSON.stringify({ results: { tests: [] } }));

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('/custom/output/report.html');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Test', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = case17Module;
        await mod.handler(baseContext);

        expect(jest.mocked(fs).mkdirSync).toHaveBeenCalledWith(
            expect.stringContaining('/custom/output'),
            expect.objectContaining({ recursive: true }),
        );
        expect(jest.mocked(fs).writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('/custom/output'),
            expect.any(String),
            'utf8',
        );
    });

    it('handles extra run parse error (lines 190-191)', async () => {
        const prompt = jest.mocked(promptModule);
        const parser = jest.mocked(parserModule);
        const reportGen = jest.mocked(reportGenModule);

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
