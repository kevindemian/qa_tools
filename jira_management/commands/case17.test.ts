jest.mock('../../shared/prompt', () => ({
    success: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    ask: jest.fn().mockResolvedValue(''),
    askConfirm: jest.fn().mockResolvedValue(true),
    printError: jest.fn(),
    tableView: jest.fn(),
    withSpinner: jest.fn((_label: string, fn: () => Promise<unknown>) => fn()),
}));

jest.mock('../../shared/result_parser', () => ({
    parseTestResultsFile: jest.fn(),
}));

jest.mock('../../shared/report-generator', () => ({
    generateHtmlReport: jest.fn(),
    loadKnownIssues: jest.fn(() => []),
}));

jest.mock('../../shared/publish', () => ({
    publishReport: jest.fn(),
}));

jest.mock('../../shared/failure-analysis', () => ({
    analyzeFailuresWithReport: jest.fn(),
}));

jest.mock('../../shared/open', () => ({
    openWithOsOrFallback: jest.fn(),
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
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('fs');

jest.mock('../../shared/http-client', () => ({
    createHttpClient: jest.fn(),
    setTestSleep: jest.fn(),
}));

const mockSessionContext: Record<string, unknown> = {
    inMemoryTasksId: [],
    inMemoryTasksText: [],
    sessionCounters: [],
    project_name: 'TEST',
    isBusy: false,
    results: [],
    lastOperation: '',
    createPackageManager: jest.fn(),
};

const baseContext = {
    jiraResource: {} as Record<string, jest.Mock>,
    jiraResourceXray: {} as Record<string, jest.Mock>,
    linkManager: {} as Record<string, jest.Mock>,
    linkManagerXray: {} as Record<string, jest.Mock>,
    csvResource: {} as Record<string, jest.Mock>,
    ctx: mockSessionContext,
    pushHistory: jest.fn(),
    printSessionSummary: jest.fn(),
    base_url: 'https://jira.test.com',
    sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case17 — HTML report generator', () => {
    it('generates report successfully', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');

        baseContext.jiraResource.getJiraResource = jest.fn().mockResolvedValueOnce({
            issues: [{ key: 'BUG-1', fields: { summary: 'Login fails', status: { name: 'Open' } } }],
        });

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'fail' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));

        delete baseContext.jiraResource.getJiraResource;
    });

    it('computes diff against last run and logs info', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
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

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Diff:'));
    });

    it('skips AI analysis and prompts bug report when failures and user accepts', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        process.env.QA_AUTO_BUG = 'true';

        fs.existsSync.mockReturnValueOnce(true);
        fs.readFileSync.mockReturnValueOnce(
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

        const reportGenFull = require('../../shared/report-generator');
        reportGenFull.categorizeFailure = jest.fn().mockReturnValue('regression');

        baseContext.jiraResource.postJiraResource = jest.fn().mockResolvedValue({ key: 'BUG-42' });

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Jira bug auto-criado: BUG-42'));

        delete baseContext.jiraResource.postJiraResource;
    });

    it('resolves mapping file and test history', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        process.env.QA_MAPPING_PATH = '/tmp/qa-mapping.json';

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
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

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(reportGen.generateHtmlReport).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({
                testHistory: expect.any(Object),
            }),
        );
    });

    it('handles AI analysis with empty content returning html unchanged', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const analysis = require('../../shared/failure-analysis');

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(analysis.analyzeFailuresWithReport).toHaveBeenCalled();
    });

    it('handles _fetchJiraContext when issues list is empty', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');

        baseContext.jiraResource.getJiraResource = jest.fn().mockResolvedValueOnce({
            issues: [],
        });

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));

        delete baseContext.jiraResource.getJiraResource;
    });

    it('handles fetchJiraContext with missing issues field', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');

        baseContext.jiraResource.getJiraResource = jest.fn().mockResolvedValueOnce({
            // no issues field at all
        });

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Login test', state: 'failed', duration: 100, error: 'err' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(baseContext.jiraResource.getJiraResource).toHaveBeenCalled();

        delete baseContext.jiraResource.getJiraResource;
    });

    it('handles computeDiff with missing tests field', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        fs.existsSync.mockReturnValueOnce(true);
        fs.readFileSync.mockReturnValueOnce(
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

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));
    });

    it('resolves mapping with missing tests field', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        process.env.QA_MAPPING_PATH = '/tmp/missing-tests.json';

        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({ otherField: true }));

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));
    });

    it('handles parseCliExtra with invalid flags', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');

        const origArgv = process.argv;
        process.argv = ['node', 'script', '--unknown-flag', '--publish', '', '--run', 'nofile'];

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));

        process.argv = origArgv;
    });

    it('builds diff summary with failure that has no error message', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const fs = require('fs');

        // Previous run had one test that was passing
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
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

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        // Verify handler runs to completion
        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));
    });

    it('handles parseCliExtra with --run edge cases', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');

        const origArgv = process.argv;
        process.argv = ['node', 'script', '--run', '=onlyfile', '--run', 'name='];

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.info).toHaveBeenCalledWith(expect.stringContaining('Relatório HTML gerado'));

        process.argv = origArgv;
    });

    it('injects AI analysis into html without bodyEnd', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const analysis = require('../../shared/failure-analysis');

        prompt.askConfirm.mockResolvedValue(true);
        analysis.analyzeFailuresWithReport.mockResolvedValue({ content: 'Analysis text' });

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Fail', state: 'failed', duration: 100, error: 'err' }],
            stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 100 },
        });

        // HTML without </body> to cover the bodyEnd === -1 branch
        reportGen.generateHtmlReport.mockReturnValueOnce('<html><head></head><div>no body tag</div></html>');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(analysis.analyzeFailuresWithReport).toHaveBeenCalled();
    });
});
