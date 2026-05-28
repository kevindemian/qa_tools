const mockPrompt = {
    ask: jest.fn(),
    askConfirm: jest.fn(),
    info: jest.fn(),
    printError: jest.fn(),
    title: jest.fn(),
    warn: jest.fn(),
};
jest.mock('./prompt', () => mockPrompt);

const mockFailureAnalysis = {
    classifyFailure: jest.fn(),
};
jest.mock('./failure-analysis', () => mockFailureAnalysis);

import { collectManual, collectAutomated, compose, fileToJira, interactiveBugReportFlow } from './bug-report';
import type { ParseResult } from './result_parser';
import type { BugReport } from './types';

describe('BugReport Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('collectManual', () => {
        it('throws if summary is empty after 3 attempts', async () => {
            mockPrompt.ask.mockResolvedValue('');
            await expect(collectManual()).rejects.toThrow('Sumário obrigatório');
            expect(mockPrompt.warn).toHaveBeenCalledTimes(3);
        });

        it('succeeds on second attempt after empty first', async () => {
            mockPrompt.ask
                .mockResolvedValueOnce('') // 1st try
                .mockResolvedValueOnce('Bug title') // 2nd try
                .mockResolvedValue(''); // remaining fields
            mockPrompt.askConfirm.mockResolvedValue(false); // skip LLM
            const report = await collectManual();
            expect(report.summary).toBe('Bug title');
            expect(mockPrompt.warn).toHaveBeenCalledTimes(1);
        });

        it('collects fields and returns BugReport without LLM', async () => {
            mockPrompt.ask
                .mockResolvedValueOnce('Bug in login') // summary
                .mockResolvedValueOnce('Cannot log in with valid credentials') // description
                .mockResolvedValueOnce('step 1, step 2') // steps
                .mockResolvedValueOnce('Dashboard displayed') // expected
                .mockResolvedValueOnce('Error 500 displayed') // actual
                .mockResolvedValueOnce('production') // env
                .mockResolvedValueOnce('critical') // severity
                .mockResolvedValueOnce('Auth') // component
                .mockResolvedValueOnce('BUG-1, BUG-2'); // linked issues

            mockPrompt.askConfirm.mockResolvedValueOnce(false); // LLM classification opt-out

            const report = await collectManual();

            expect(report).toEqual({
                summary: 'Bug in login',
                description: 'Cannot log in with valid credentials',
                source: 'manual',
                stepsToReproduce: ['step 1', 'step 2'],
                expectedResult: 'Dashboard displayed',
                actualResult: 'Error 500 displayed',
                environment: 'production',
                severity: 'critical',
                component: 'Auth',
                linkedIssues: [
                    { key: 'BUG-1', linkType: 'Relates' },
                    { key: 'BUG-2', linkType: 'Relates' },
                ],
                llmEnrichment: undefined,
            });
        });

        it('collects fields and enriches with LLM classification if approved', async () => {
            mockPrompt.ask
                .mockResolvedValueOnce('Bug in login') // summary
                .mockResolvedValueOnce('Cannot log in') // description
                .mockResolvedValueOnce('') // steps
                .mockResolvedValueOnce('') // expected
                .mockResolvedValueOnce('') // actual
                .mockResolvedValueOnce('') // env
                .mockResolvedValueOnce('minor') // severity
                .mockResolvedValueOnce('') // component
                .mockResolvedValueOnce(''); // linked issues (empty)

            mockPrompt.askConfirm.mockResolvedValueOnce(true); // LLM classification opt-in
            mockFailureAnalysis.classifyFailure.mockResolvedValueOnce('AUTHENTICATION_ERROR');

            const report = await collectManual();

            expect(report.llmEnrichment).toBeDefined();
            expect(report.llmEnrichment?.rootCause).toBe('AUTHENTICATION_ERROR');
            expect(mockPrompt.info).toHaveBeenCalledWith(expect.stringContaining('AUTHENTICATION_ERROR'));
        });
    });

    describe('collectAutomated', () => {
        it('builds BugReport from ParseResult', () => {
            const mockResult: ParseResult = {
                tests: [
                    { title: 'Login fails', state: 'failed', duration: 100, error: 'Expected 200 got 500' },
                    { title: 'Logout succeeds', state: 'passed', duration: 50 },
                ],
                stats: { passed: 1, failed: 1, skipped: 0, total: 2, duration: 150 },
            };

            const report = collectAutomated(mockResult, {
                pipelineId: '456',
                branch: 'main',
                commitSha: 'abcdef123',
                provider: 'gitlab',
            });

            expect(report.summary).toBe('1/2 tests failed');
            expect(report.source).toBe('automated');
            expect(report.description).toContain('*Login fails*');
            expect(report.description).toContain('Error: Expected 200 got 500');
            expect(report.metadata).toEqual({
                pipelineId: '456',
                branch: 'main',
                commitSha: 'abcdef123',
                provider: 'gitlab',
            });
        });
    });

    describe('compose', () => {
        it('composes beautiful markdown text for manual bug', () => {
            const report: BugReport = {
                summary: 'Login issue',
                description: 'Description text',
                source: 'manual',
                stepsToReproduce: ['Open app', 'Click login'],
                expectedResult: 'Success',
                actualResult: 'Failure',
                environment: 'Staging',
                severity: 'major',
                component: 'Frontend',
                llmEnrichment: {
                    enrichedAt: '2026-05-26',
                    model: 'fast',
                    rootCause: 'UI_ELEMENT_MISSING',
                },
            };

            const composed = compose(report);
            expect(composed).toContain('**Summary:** Login issue');
            expect(composed).toContain('**Severity:** major');
            expect(composed).toContain('**Description:**\nDescription text');
            expect(composed).toContain('1. Open app');
            expect(composed).toContain('2. Click login');
            expect(composed).toContain('**Expected Result:** Success');
            expect(composed).toContain('**Actual Result:** Failure');
            expect(composed).toContain('**Environment:** Staging');
            expect(composed).toContain('**Component:** Frontend');
            expect(composed).toContain('**AI Analysis:** UI_ELEMENT_MISSING');
        });
    });

    describe('fileToJira', () => {
        let mockJiraResource: { postJiraResource: jest.Mock };

        beforeEach(() => {
            mockJiraResource = { postJiraResource: jest.fn() };
        });

        it('files bug to Jira and returns key', async () => {
            const report: BugReport = {
                summary: 'Login issue',
                description: 'Desc',
                source: 'manual',
                severity: 'critical',
                component: 'API',
            };

            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-101' });

            const key = await fileToJira(mockJiraResource as never, report, 'PROJ');

            expect(key).toBe('PROJ-101');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: 'PROJ' },
                    summary: 'Login issue',
                    description: expect.any(String),
                    issuetype: { name: 'Bug' },
                    labels: ['bug-report', 'manual'],
                    priority: { name: 'Highest' },
                    components: [{ name: 'API' }],
                },
            });
        });
    });

    describe('interactiveBugReportFlow', () => {
        let mockJiraResource: { postJiraResource: jest.Mock };
        let mockLinkManager: { linkIssues: jest.Mock };

        beforeEach(() => {
            mockJiraResource = { postJiraResource: jest.fn() };
            mockLinkManager = { linkIssues: jest.fn() };
        });

        it('calls collectManual, creates and links issues if confirmed', async () => {
            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
                linkedIssues: [{ key: 'US-1', linkType: 'Relates' }],
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-202' });

            const result = await interactiveBugReportFlow(
                mockJiraResource as never,
                'PROJ',
                report,
                mockLinkManager as never,
            );

            expect(result).toEqual({
                status: 'ok',
                label: 'PROJ-202',
                message: 'Manual login failure',
            });
            expect(mockLinkManager.linkIssues).toHaveBeenCalledWith('PROJ-202', report.linkedIssues);
        });

        it('does not link issues when no linkedIssues', async () => {
            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-202' });

            await interactiveBugReportFlow(mockJiraResource as never, 'PROJ', report, mockLinkManager as never);

            expect(mockLinkManager.linkIssues).not.toHaveBeenCalled();
        });

        it('returns null if cancelled by user', async () => {
            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(false);

            const result = await interactiveBugReportFlow(mockJiraResource as never, 'PROJ', report);

            expect(result).toBeNull();
            expect(mockPrompt.info).toHaveBeenCalledWith('Bug report cancelado.');
        });
    });
});

jest.mock('./llm-client', () => ({ llmPrompt: jest.fn() }));
jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        readFileSync: jest.fn((p: string) => {
            if (p.includes('bug-report-from-description.md')) return 'mock prompt content';
            return actual.readFileSync(p);
        }),
    };
});

import { generateBugReportFromDescription } from './bug-report';

const mockLlmPrompt = jest.requireMock('./llm-client').llmPrompt as jest.Mock;

describe('generateBugReportFromDescription', () => {
    beforeEach(() => {
        mockLlmPrompt.mockReset();
    });

    it('returns BugReport when LLM succeeds with valid schema', async () => {
        mockLlmPrompt.mockResolvedValue({
            summary: 'Login fails on Firefox',
            description: 'Request times out after 30s',
            stepsToReproduce: ['Open Firefox', 'Navigate to /login'],
            expectedResult: 'User redirected to dashboard',
            actualResult: '504 Gateway Timeout',
            environment: 'Firefox 120',
            severity: 'major',
            component: 'auth-service',
        });

        const result = await generateBugReportFromDescription('login fails on firefox');
        expect(result).not.toBeNull();
        expect(result!.summary).toBe('Login fails on Firefox');
        expect(result!.severity).toBe('major');
        expect(result!.source).toBe('manual');
        expect(result!.llmEnrichment).toBeDefined();
        expect(result!.llmEnrichment!.model).toBe('fast');
    });

    it('returns BugReport without optional fields when LLM omits them', async () => {
        mockLlmPrompt.mockResolvedValue({
            summary: 'Button not visible',
            description: 'Submit button hidden on mobile viewport',
            stepsToReproduce: ['Open on iPhone 12', 'Go to /checkout'],
            expectedResult: 'Submit button is visible',
            actualResult: 'Submit button is hidden behind footer',
            severity: 'minor',
        });

        const result = await generateBugReportFromDescription('button not visible');
        expect(result).not.toBeNull();
        expect(result!.environment).toBeUndefined();
        expect(result!.component).toBeUndefined();
    });

    it('returns null when LLM throws', async () => {
        mockLlmPrompt.mockRejectedValue(new Error('LLM API error'));
        const result = await generateBugReportFromDescription('something broke');
        expect(result).toBeNull();
    });
});
