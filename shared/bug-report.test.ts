const mockPrompt = vi.hoisted(() => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    info: vi.fn(),
    printError: vi.fn(),
    title: vi.fn(),
    warn: vi.fn(),
}));

vi.mock('./prompt', () => mockPrompt);

const mockFailureAnalysis = vi.hoisted(() => ({
    classifyFailure: vi.fn(),
}));

vi.mock('./failure-analysis', () => mockFailureAnalysis);

vi.mock('./logger');

vi.mock('./config', () => ({
    __esModule: true,
    default: {
        jiraProject: '',
        get(key: string) {
            return Reflect.get(this, key) as string;
        },
    },
}));

import { collectManual, collectAutomated, compose, fileToJira, interactiveBugReportFlow } from './bug-report.js';
import type { Mock } from 'vitest';
import type { ParseResult } from './result_parser.js';
import type { BugReport } from './types.js';
import { nonNull } from './test-utils.js';

describe('BugReport Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('CollectManual', () => {
        it('throws if summary is empty after 3 attempts', async () => {
            expect.hasAssertions();

            mockPrompt.ask.mockResolvedValue('');

            await expect(collectManual()).rejects.toThrow('é obrigatório');
            expect(mockPrompt.warn).toHaveBeenCalledTimes(3);
        });

        it('succeeds on second attempt after empty first', async () => {
            expect.hasAssertions();

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
            expect.hasAssertions();

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

            expect(report).toStrictEqual({
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
            expect.hasAssertions();

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

        it('handles LLM enrichment failure gracefully', async () => {
            expect.hasAssertions();

            mockPrompt.ask
                .mockResolvedValueOnce('Bug title')
                .mockResolvedValueOnce('Description')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('minor')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockFailureAnalysis.classifyFailure.mockRejectedValueOnce(new Error('API timeout'));

            const report = await collectManual();

            expect(report.llmEnrichment).toBeUndefined();
        });

        it('defaults to minor severity when invalid severity entered', async () => {
            expect.hasAssertions();

            mockPrompt.ask
                .mockResolvedValueOnce('Bug title')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('unknown-severity')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockPrompt.askConfirm.mockResolvedValueOnce(false);

            const report = await collectManual();

            expect(report.severity).toBe('minor');
        });

        it('uses fallback message when LLM returns empty rootCause', async () => {
            expect.hasAssertions();

            mockPrompt.ask
                .mockResolvedValueOnce('Bug title')
                .mockResolvedValueOnce('Description')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('minor')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockFailureAnalysis.classifyFailure.mockResolvedValueOnce('');

            const report = await collectManual();

            expect(report.llmEnrichment).toBeDefined();
            expect(nonNull(report.llmEnrichment).rootCause).toBe('');
            expect(mockPrompt.info).toHaveBeenCalledWith(expect.stringContaining('não disponível'));
        });
    });

    describe('CollectAutomated', () => {
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
            expect(report.metadata).toStrictEqual({
                pipelineId: '456',
                branch: 'main',
                commitSha: 'abcdef123',
                provider: 'gitlab',
            });
        });

        it('returns generic description when no tests failed', () => {
            const mockResult: ParseResult = {
                tests: [{ title: 'All pass', state: 'passed', duration: 50 }],
                stats: { passed: 1, failed: 0, skipped: 0, total: 1, duration: 50 },
            };
            const report = collectAutomated(mockResult);

            expect(report.description).toBe('No details available.');
        });

        it('handles empty stats and tests gracefully', () => {
            const report = collectAutomated({
                tests: [],
                stats: { passed: 0, failed: 0, skipped: 0, total: 0, duration: 0 },
            });

            expect(report.summary).toBe('0/0 tests failed');
            expect(report.description).toBe('No details available.');
        });

        it('handles failed test without error field', () => {
            const mockResult: ParseResult = {
                tests: [{ title: 'Fails silently', state: 'failed', duration: 50 }],
                stats: { passed: 0, failed: 1, skipped: 0, total: 1, duration: 50 },
            };
            const report = collectAutomated(mockResult);

            expect(report.description).toContain('*Fails silently*');
            expect(report.description).not.toContain('Error:');
        });
    });

    describe('Compose', () => {
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

            const parts = [
                '**Summary:** Login issue',
                '**Severity:** major',
                '**Description:**\nDescription text',
                '1. Open app',
                '2. Click login',
                '**Expected Result:** Success',
                '**Actual Result:** Failure',
                '**Environment:** Staging',
                '**Component:** Frontend',
                '**AI Analysis:** UI_ELEMENT_MISSING',
            ];

            expect(parts.every((p) => composed.includes(p))).toBeTruthy();
        });

        it('includes pipeline metadata when present', () => {
            const report: BugReport = {
                summary: 'Build failure',
                description: 'Desc',
                source: 'automated',
                severity: 'critical',
                metadata: {
                    pipelineId: '12345',
                    branch: 'develop',
                    commitSha: 'abc123def',
                    provider: 'github',
                },
            };
            const composed = compose(report);

            expect(composed).toContain('**Pipeline:** 12345');
            expect(composed).toContain('**Branch:** develop');
            expect(composed).toContain('**Commit:** abc123def');
        });

        it('does not include metadata fields when absent', () => {
            const report: BugReport = {
                summary: 'Partial metadata',
                description: '',
                source: 'automated',
                severity: 'major',
                metadata: {
                    pipelineId: 'p1',
                },
            };
            const composed = compose(report);

            expect(composed).toContain('**Pipeline:** p1');
            expect(composed).not.toContain('**Branch:**');
            expect(composed).not.toContain('**Commit:**');
        });

        it('omits optional fields when not provided', () => {
            const report: BugReport = {
                summary: 'Minimal',
                description: '',
                source: 'automated',
                severity: 'major',
            };
            const composed = compose(report);

            expect(composed).toContain('**Summary:** Minimal');
            expect(composed).toContain('**Severity:** major');
            expect(composed).not.toContain('**Description:**');
            expect(composed).not.toContain('**Steps to Reproduce:**');
            expect(composed).not.toContain('**AI Analysis:**');
        });
    });

    describe('FileToJira', () => {
        let mockJiraResource: {
            getJiraResource: Mock;
            postJiraResource: Mock;
            putJiraResource: Mock;
            searchJiraIssues: Mock;
            getTransitionsForIssue: Mock;
            transitionIssue: Mock;
        };

        beforeEach(() => {
            mockJiraResource = {
                getJiraResource: vi.fn(),
                postJiraResource: vi.fn(),
                putJiraResource: vi.fn(),
                searchJiraIssues: vi.fn(),
                getTransitionsForIssue: vi.fn(),
                transitionIssue: vi.fn(),
            };
        });

        it('files bug to Jira and returns key', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Login issue',
                description: 'Desc',
                source: 'manual',
                severity: 'critical',
                component: 'API',
            };

            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-101' });

            const key = await fileToJira(mockJiraResource, report, 'PROJ', { confirm: false });

            expect(key).toBe('PROJ-101');
            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: 'PROJ' },
                    summary: 'Login issue',
                    description: expect.any(String) as string,
                    issuetype: { name: 'Bug' },
                    labels: ['bug-report', 'manual'],
                    priority: { name: 'Highest' },
                    components: [{ name: 'API' }],
                },
            });
        });

        it('throws when project key is missing', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Bug',
                description: '',
                source: 'manual',
                severity: 'minor',
            };

            await expect(fileToJira(mockJiraResource, report, undefined, { confirm: false })).rejects.toThrow(
                'Project key is required',
            );
        });
    });

    describe('InteractiveBugReportFlow', () => {
        let mockJiraResource: {
            postJiraResource: Mock;
            getJiraResource: Mock;
            putJiraResource: Mock;
            searchJiraIssues: Mock;
            getTransitionsForIssue: Mock;
            transitionIssue: Mock;
        };
        let mockLinkManager: {
            linkIssues: Mock;
        };

        beforeEach(() => {
            mockJiraResource = {
                postJiraResource: vi.fn(),
                getJiraResource: vi.fn(),
                putJiraResource: vi.fn(),
                searchJiraIssues: vi.fn(),
                getTransitionsForIssue: vi.fn(),
                transitionIssue: vi.fn(),
            };
            mockLinkManager = { linkIssues: vi.fn() };
        });

        it('calls collectManual, creates and links issues if confirmed', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
                linkedIssues: [{ key: 'US-1', linkType: 'Relates' }],
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-202' });

            const result = await interactiveBugReportFlow(mockJiraResource, 'PROJ', report, mockLinkManager);

            expect(result).toStrictEqual({
                status: 'ok',
                label: 'PROJ-202',
                message: 'Manual login failure',
            });
            expect(mockLinkManager.linkIssues).toHaveBeenCalledWith('PROJ-202', report.linkedIssues);
        });

        it('does not link issues when no linkedIssues', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-202' });

            await interactiveBugReportFlow(mockJiraResource, 'PROJ', report, mockLinkManager);

            expect(mockLinkManager.linkIssues).not.toHaveBeenCalled();
        });

        it('returns null if cancelled by user', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Manual login failure',
                description: 'Steps: click button',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(false);

            const result = await interactiveBugReportFlow(mockJiraResource, 'PROJ', report);

            expect(result).toBeNull();
            expect(mockPrompt.info).toHaveBeenCalledWith('Bug report cancelado.');
        });

        it('returns error status when fileToJira throws', async () => {
            expect.hasAssertions();

            const report: BugReport = {
                summary: 'Bug title',
                description: 'Desc',
                source: 'manual',
                severity: 'minor',
            };

            mockPrompt.askConfirm.mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockRejectedValueOnce(new Error('Jira API error'));

            const result = await interactiveBugReportFlow(mockJiraResource, 'PROJ', report);

            expect(result).toStrictEqual({
                status: 'error',
                label: '',
                message: 'Jira API error',
            });
            expect(mockPrompt.printError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
        });

        it('calls collectManual when preFilled is not provided', async () => {
            expect.hasAssertions();

            mockPrompt.ask
                .mockResolvedValueOnce('Auto summary')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('minor')
                .mockResolvedValueOnce('')
                .mockResolvedValueOnce('');
            mockPrompt.askConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
            mockJiraResource.postJiraResource.mockResolvedValueOnce({ key: 'PROJ-303' });

            const result = await interactiveBugReportFlow(mockJiraResource, 'PROJ', undefined, mockLinkManager);

            expect(result).toStrictEqual({
                status: 'ok',
                label: 'PROJ-303',
                message: 'Auto summary',
            });
        });
    });
});

vi.mock('./llm-client', () => ({ llmPrompt: vi.fn() }));
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        readFileSync: vi.fn((p: string): string => {
            if (p.includes('bug-report-from-description.md')) return 'mock prompt content';
            return actual.readFileSync(p, 'utf8');
        }),
    };
});

import { generateBugReportFromDescription } from './bug-report.js';

let mockLlmPrompt: Mock;

describe('GenerateBugReportFromDescription', () => {
    beforeAll(async () => {
        const llmClient = await vi.importMock<typeof import('./llm-client.js')>('./llm-client');
        mockLlmPrompt = vi.spyOn(llmClient, 'llmPrompt');
    });

    beforeEach(() => {
        mockLlmPrompt.mockReset();
    });

    it('returns BugReport when LLM succeeds with valid schema', async () => {
        expect.hasAssertions();

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
        expect(nonNull(result).summary).toBe('Login fails on Firefox');
        expect(nonNull(result).severity).toBe('major');
        expect(nonNull(result).source).toBe('manual');
        expect(nonNull(result).llmEnrichment).toBeDefined();
        expect(nonNull(nonNull(result).llmEnrichment).model).toBe('fast');
    });

    it('returns BugReport without optional fields when LLM omits them', async () => {
        expect.hasAssertions();

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
        expect(nonNull(result).environment).toBeUndefined();
        expect(nonNull(result).component).toBeUndefined();
    });

    it('returns null when LLM throws', async () => {
        expect.hasAssertions();

        mockLlmPrompt.mockRejectedValue(new Error('LLM API error'));
        const result = await generateBugReportFromDescription('something broke');

        expect(result).toBeNull();
    });

    it('returns null when prompt template file cannot be read', async () => {
        expect.hasAssertions();

        const fs = await import('fs');
        const readMock = vi.spyOn(fs, 'readFileSync');
        readMock.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });

        const result = await generateBugReportFromDescription('test');

        expect(result).toBeNull();
    });
});
