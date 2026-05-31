jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    success: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../shared/config', () => ({
    default: {
        jiraProject: 'ECSPOL',
    },
    __esModule: true,
}));

jest.mock('./test-results', () => ({
    _jiraEnv: jest.fn(),
}));

jest.mock('./session-state', () => ({
    currentProvider: 'gitlab',
    pushHistory: jest.fn(),
}));

jest.mock('../shared/bug-report', () => ({
    collectAutomated: jest.fn(),
    fileToJira: jest.fn(),
}));

import { confirm, success, printError } from '../shared/prompt';
import Config from '../shared/config';
import { _jiraEnv } from './test-results';
import { currentProvider, pushHistory } from './session-state';
import { collectAutomated, fileToJira } from '../shared/bug-report';
import { handleBugCreation } from './pipeline-jira';
import type { ParseResult } from '../shared/result_parser';
import type { AnalysisReport } from '../shared/failure-analysis';
import type JiraClient from '../shared/jira-client';

const mockParseResult: ParseResult = {
    tests: [
        { title: 'test foo', state: 'failed', duration: 100, error: 'AssertionError' },
        { title: 'test bar', state: 'passed', duration: 50 },
    ],
    stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
};

const mockAnalysisReport: AnalysisReport = {
    content: 'Root cause: assertion mismatch in test foo',
    confidence: 'high',
    fallbackUsed: false,
};

const mockBugReport = {
    summary: '1/2 tests failed',
    description: '',
    source: 'automated' as const,
    severity: 'major' as const,
    metadata: { pipelineId: '42', branch: 'main', provider: 'gitlab' },
};

const mockJiraResource = {} as unknown as JiraClient;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleBugCreation', () => {
    it('creates bug successfully when jira env is configured and user confirms', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(true);
        (collectAutomated as jest.Mock).mockReturnValue(mockBugReport);
        (fileToJira as jest.Mock).mockResolvedValue('ECSPOL-123');

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(collectAutomated).toHaveBeenCalledWith(mockParseResult, {
            pipelineId: '42',
            branch: 'main',
            provider: currentProvider,
        });
        expect(fileToJira).toHaveBeenCalledWith(
            mockJiraResource,
            { ...mockBugReport, description: mockAnalysisReport.content },
            'ECSPOL',
        );
        expect(success).toHaveBeenCalledWith('Bug criado: https://jira.example.com/browse/ECSPOL-123');
        expect(pushHistory).toHaveBeenCalledWith('create-jira-issue', 'ECSPOL-123', 'ok');
    });

    it('uses default project key when Config.jiraProject is not set', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(true);
        (collectAutomated as jest.Mock).mockReturnValue(mockBugReport);
        (fileToJira as jest.Mock).mockResolvedValue('ECSPOL-456');
        (Config as { jiraProject: string }).jiraProject = '';

        await handleBugCreation(mockParseResult, '99', 'develop', mockAnalysisReport, mockJiraResource);

        expect(fileToJira).toHaveBeenCalledWith(mockJiraResource, expect.anything(), 'ECSPOL');
        expect(success).toHaveBeenCalledWith('Bug criado: https://jira.example.com/browse/ECSPOL-456');
        expect(pushHistory).toHaveBeenCalledWith('create-jira-issue', 'ECSPOL-456', 'ok');

        (Config as { jiraProject: string }).jiraProject = 'ECSPOL';
    });

    it('returns early when jira env is not configured', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue(null);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(confirm).not.toHaveBeenCalled();
        expect(collectAutomated).not.toHaveBeenCalled();
        expect(fileToJira).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('returns early when user declines confirmation', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(false);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(collectAutomated).not.toHaveBeenCalled();
        expect(fileToJira).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('handles jira API failure gracefully', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(true);
        (collectAutomated as jest.Mock).mockReturnValue(mockBugReport);
        const apiError = new Error('Network timeout');
        (fileToJira as jest.Mock).mockRejectedValue(apiError);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(printError).toHaveBeenCalledWith('Falha ao criar bug no Jira', apiError);
        expect(pushHistory).toHaveBeenCalledWith('create-jira-issue', '42', 'error');
    });

    it('assigns bugReport description from analysisReport content', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(true);
        (collectAutomated as jest.Mock).mockReturnValue({ ...mockBugReport, description: '' });
        (fileToJira as jest.Mock).mockResolvedValue('ECSPOL-789');

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(fileToJira).toHaveBeenCalledWith(
            mockJiraResource,
            expect.objectContaining({ description: 'Root cause: assertion mismatch in test foo' }),
            expect.any(String),
        );
    });

    it('passes pipelineId as string regardless of input type', async () => {
        (_jiraEnv as jest.Mock).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        (confirm as jest.Mock).mockReturnValue(true);
        (collectAutomated as jest.Mock).mockReturnValue(mockBugReport);
        (fileToJira as jest.Mock).mockResolvedValue('ECSPOL-ABC');

        await handleBugCreation(mockParseResult, 7, 'hotfix', mockAnalysisReport, mockJiraResource);

        expect(collectAutomated).toHaveBeenCalledWith(mockParseResult, {
            pipelineId: '7',
            branch: 'hotfix',
            provider: currentProvider,
        });
    });
});
