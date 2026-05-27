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
    jiraResource: {},
    jiraResourceXray: {},
    linkManager: {},
    linkManagerXray: {},
    csvResource: {},
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
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('/out/report.html');

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [{ title: 'Test 1', state: 'passed', duration: 100 }],
            stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 100 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');
        fs.writeFileSync.mockImplementationOnce(jest.fn());

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(parser.parseTestResultsFile).toHaveBeenCalledWith('/path/to/report.json');
        expect(reportGen.generateHtmlReport).toHaveBeenCalled();
        expect(fs.writeFileSync).toHaveBeenCalledWith('/out/report.html', '<html>report</html>', 'utf8');
        expect(baseContext.pushHistory).toHaveBeenCalledWith('html-report', expect.stringContaining('1 testes'), 'ok');
    });

    it('includes failure analysis when there are failures and user confirms', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const analysis = require('../../shared/failure-analysis');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('/path/to/report.json').mockResolvedValueOnce('/out/report.html');
        prompt.askConfirm.mockResolvedValueOnce(true);

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [
                { title: 'Pass', state: 'passed', duration: 100 },
                { title: 'Fail', state: 'failed', duration: 50 },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</body></html>');
        analysis.analyzeFailuresWithReport.mockResolvedValueOnce({
            content: 'Root cause analysis',
            confidence: 'high',
            fallbackUsed: false,
        });
        fs.writeFileSync.mockImplementationOnce(jest.fn());

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.askConfirm).toHaveBeenCalled();
        expect(analysis.analyzeFailuresWithReport).toHaveBeenCalled();
    });

    it('handles parse error gracefully', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');

        prompt.ask.mockResolvedValueOnce('/path/to/bad.json');
        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [],
            stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            error: 'Arquivo não encontrado',
        });

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('handles empty file path', async () => {
        const prompt = require('../../shared/prompt');
        prompt.ask.mockResolvedValueOnce('');

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.printError).toHaveBeenCalled();
    });

    it('prompts bug report creation when there are failures and user confirms', async () => {
        const prompt = require('../../shared/prompt');
        const parser = require('../../shared/result_parser');
        const reportGen = require('../../shared/report-generator');
        const bugReport = require('../../shared/bug-report');
        const fs = require('fs');

        prompt.ask.mockResolvedValueOnce('/path/to/report.json');
        prompt.ask.mockResolvedValueOnce('/out/report.html');
        prompt.askConfirm.mockResolvedValueOnce(false); // no AI analysis
        prompt.askConfirm.mockResolvedValueOnce(true); // yes bug report

        parser.parseTestResultsFile.mockReturnValueOnce({
            tests: [
                { title: 'Pass', state: 'passed', duration: 100 },
                { title: 'Fail', state: 'failed', duration: 50 },
            ],
            stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
        });

        reportGen.generateHtmlReport.mockReturnValueOnce('<html>report</html>');
        fs.writeFileSync.mockImplementationOnce(jest.fn());
        bugReport.collectAutomated.mockReturnValueOnce({ title: 'Bug Report', description: 'Falhas detectadas' });

        const mod = require('./case17').default;
        await mod.handler(baseContext);

        expect(prompt.askConfirm).toHaveBeenCalledWith(
            'Deseja criar um relatório de bug (Bug Report) no Jira para as falhas?',
            false,
        );
        expect(bugReport.collectAutomated).toHaveBeenCalled();
        expect(bugReport.interactiveBugReportFlow).toHaveBeenCalled();
    });
});
