jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    success: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../shared/config', () => ({
    default: {
        jiraProject: 'ECSPOL',
        get(key: string) {
            return (this as Record<string, unknown>)[key] as string;
        },
        set(key: string, value: unknown) {
            (this as Record<string, unknown>)[key] = value;
        },
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

const mockJiraResource = {} as JiraClient;

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleBugCreation', () => {
    it('creates bug successfully when jira env is configured and user confirms', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(true);
        jest.mocked(collectAutomated).mockReturnValue(mockBugReport);
        jest.mocked(fileToJira).mockResolvedValue('ECSPOL-123');

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

    it('prints error when Config.get("jiraProject") is not set', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(true);
        jest.mocked(collectAutomated).mockReturnValue(mockBugReport);
        jest.mocked(fileToJira).mockRejectedValue(new Error('Project key is required'));
        Config.set('jiraProject', '');

        await handleBugCreation(mockParseResult, '99', 'develop', mockAnalysisReport, mockJiraResource);

        expect(printError).toHaveBeenCalledWith('Falha ao criar bug no Jira', expect.any(Error));
        expect(pushHistory).toHaveBeenCalledWith('create-jira-issue', '99', 'error');

        Config.set('jiraProject', 'ECSPOL');
    });

    it('returns early when jira env is not configured', async () => {
        jest.mocked(_jiraEnv).mockReturnValue(null);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(confirm).not.toHaveBeenCalled();
        expect(collectAutomated).not.toHaveBeenCalled();
        expect(fileToJira).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('returns early when user declines confirmation', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(false);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(collectAutomated).not.toHaveBeenCalled();
        expect(fileToJira).not.toHaveBeenCalled();
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('handles jira API failure gracefully', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(true);
        jest.mocked(collectAutomated).mockReturnValue(mockBugReport);
        const apiError = new Error('Network timeout');
        jest.mocked(fileToJira).mockRejectedValue(apiError);

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(printError).toHaveBeenCalledWith('Falha ao criar bug no Jira', apiError);
        expect(pushHistory).toHaveBeenCalledWith('create-jira-issue', '42', 'error');
    });

    it('assigns bugReport description from analysisReport content', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(true);
        jest.mocked(collectAutomated).mockReturnValue({ ...mockBugReport, description: '' });
        jest.mocked(fileToJira).mockResolvedValue('ECSPOL-789');

        await handleBugCreation(mockParseResult, 42, 'main', mockAnalysisReport, mockJiraResource);

        expect(fileToJira).toHaveBeenCalledWith(
            mockJiraResource,
            expect.objectContaining({ description: 'Root cause: assertion mismatch in test foo' }),
            expect.any(String),
        );
    });

    it('passes pipelineId as string regardless of input type', async () => {
        jest.mocked(_jiraEnv).mockReturnValue({ base: 'https://jira.example.com', token: 'tok', xray: 'xray' });
        jest.mocked(confirm).mockReturnValue(true);
        jest.mocked(collectAutomated).mockReturnValue(mockBugReport);
        jest.mocked(fileToJira).mockResolvedValue('ECSPOL-ABC');

        await handleBugCreation(mockParseResult, 7, 'hotfix', mockAnalysisReport, mockJiraResource);

        expect(collectAutomated).toHaveBeenCalledWith(mockParseResult, {
            pipelineId: '7',
            branch: 'hotfix',
            provider: currentProvider,
        });
    });
});
