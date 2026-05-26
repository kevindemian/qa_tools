const mockPrompt = {
    ask: jest.fn(),
    askConfirm: jest.fn(),
    info: jest.fn(),
    printError: jest.fn(),
    title: jest.fn(),
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
        it('throws if summary is empty', async () => {
            mockPrompt.ask.mockResolvedValueOnce('');
            await expect(collectManual()).rejects.toThrow('Sumário obrigatório');
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
                .mockResolvedValueOnce('Auth'); // component

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
                .mockResolvedValueOnce(''); // component

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

        beforeEach(() => {
            mockJiraResource = { postJiraResource: jest.fn() };
        });

        it('calls collectManual, displays preview and files if confirmed', async () => {
            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true); // User confirms preview
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-202' });

            const result = await interactiveBugReportFlow(mockJiraResource as never, 'PROJ', report);

            expect(result).toEqual({
                status: 'ok',
                label: 'PROJ-202',
                message: 'Manual login failure',
            });
            expect(mockPrompt.info).toHaveBeenCalledWith(expect.stringContaining('Manual login failure'));
        });

        it('returns null if cancelled by user', async () => {
            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(false); // User cancels preview

            const result = await interactiveBugReportFlow(mockJiraResource as never, 'PROJ', report);

            expect(result).toBeNull();
            expect(mockPrompt.info).toHaveBeenCalledWith('Bug report cancelado.');
        });
    });
});
