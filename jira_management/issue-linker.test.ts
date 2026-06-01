const mockPrompt = {
    print: jest.fn(),
    success: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    onError: jest.fn(),
};
const mockLogger = {
    rootLogger: {
        child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
    },
};
const mockHttpClient = {
    sleep: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../shared/prompt', () => mockPrompt);
jest.mock('../shared/logger', () => mockLogger);
jest.mock('../shared/http-client', () => mockHttpClient);

import type { TestCase, JiraResourceLike } from '../shared/types';
import IssueLinker from './issue-linker';
import { createMockJiraResource, createMockLinkManager } from '../shared/test-utils/factories';
import type JiraLinkManager from './jira_link_manager';

describe('IssueLinker', () => {
    let linker: IssueLinker;
    let mockJiraResource: jest.Mocked<JiraResourceLike>;
    let mockLinkManager: jest.Mocked<JiraLinkManager>;

    beforeEach(() => {
        mockJiraResource = createMockJiraResource();
        mockLinkManager = createMockLinkManager();
        linker = new IssueLinker(mockJiraResource, mockLinkManager);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('associatePrecondition', () => {
        const opLog = { info: jest.fn() };

        it('returns null when no precondition', async () => {
            const result = await linker.associatePrecondition({ title: 'Test', steps: [] }, 'TEST-1', opLog);
            expect(result).toBeNull();
            expect(mockLinkManager.associatePrecondition).not.toHaveBeenCalled();
        });

        it('returns null on success', async () => {
            mockLinkManager.associatePrecondition.mockResolvedValue(null);
            const test: TestCase = { title: 'Test', steps: [], precondition: { type: 'reference', value: 'PREC-001' } };
            const result = await linker.associatePrecondition(test, 'TEST-1', opLog);
            expect(result).toBeNull();
            expect(mockLinkManager.associatePrecondition).toHaveBeenCalledWith('TEST-1', 'PREC-001');
        });

        it('calls success when not quiet', async () => {
            mockLinkManager.associatePrecondition.mockResolvedValue(null);
            mockPrompt.isQuiet.mockReturnValue(false);
            const test: TestCase = { title: 'Test', steps: [], precondition: { type: 'reference', value: 'PREC-001' } };
            await linker.associatePrecondition(test, 'TEST-1', opLog);
            expect(mockPrompt.success).toHaveBeenCalledWith('  Pre-condition PREC-001 associada');
        });

        it('returns abort action on error', async () => {
            mockLinkManager.associatePrecondition.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('abort');
            const test: TestCase = { title: 'Test', steps: [], precondition: { type: 'reference', value: 'PREC-001' } };
            const result = await linker.associatePrecondition(test, 'TEST-1', opLog);
            expect(result).toEqual({ action: 'abort' });
        });
    });

    describe('linkIssues', () => {
        it('returns null when no linkedIssues', async () => {
            const result = await linker.linkIssues('TEST-1', { title: 'Test', steps: [] });
            expect(result).toBeNull();
            expect(mockLinkManager.linkIssues).not.toHaveBeenCalled();
        });

        it('returns null when linkedIssues is empty array', async () => {
            const result = await linker.linkIssues('TEST-1', { title: 'Test', steps: [], linkedIssues: [] });
            expect(result).toBeNull();
        });

        it('returns null on success', async () => {
            mockLinkManager.linkIssues.mockResolvedValue(undefined);
            const test: TestCase = {
                title: 'Test',
                steps: [],
                linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }],
            };
            const result = await linker.linkIssues('TEST-1', test);
            expect(result).toBeNull();
            expect(mockLinkManager.linkIssues).toHaveBeenCalledWith('TEST-1', test.linkedIssues);
        });

        it('calls success when not quiet', async () => {
            mockLinkManager.linkIssues.mockResolvedValue(undefined);
            mockPrompt.isQuiet.mockReturnValue(false);
            const test: TestCase = {
                title: 'Test',
                steps: [],
                linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }],
            };
            await linker.linkIssues('TEST-1', test);
            expect(mockPrompt.success).toHaveBeenCalledWith('  1 linked issue(s) criados');
        });

        it('returns action on error', async () => {
            mockLinkManager.linkIssues.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('retry');
            const test: TestCase = {
                title: 'Test',
                steps: [],
                linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }],
            };
            const result = await linker.linkIssues('TEST-1', test);
            expect(result).toEqual({ action: 'retry' });
        });
    });

    describe('updateCrossReferences', () => {
        it('does nothing when tests array is empty', async () => {
            await linker.updateCrossReferences([], []);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('skips tests without id or group', async () => {
            const tests: TestCase[] = [{ title: 'Test', steps: [], group: '' }];
            await linker.updateCrossReferences(tests, ['']);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('skips groups with fewer than 2 members', async () => {
            const tests: TestCase[] = [{ title: 'Test', steps: [], group: 'G1' }];
            await linker.updateCrossReferences(tests, ['TEST-1']);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('updates descriptions for all group members', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old desc' } })
                .mockResolvedValueOnce({ fields: { description: '' } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', description: 'First', steps: [] },
                { title: 'Test2', group: 'G1', description: 'Second', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(2);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledTimes(2);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', expect.any(Object));
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-2', expect.any(Object));
        });

        it('skips already updated issues', async () => {
            mockJiraResource.getJiraResource.mockResolvedValue({
                fields: { description: 'This test case is part of the set Grupo X: TEST-2' },
            });
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', steps: [] },
                { title: 'Test2', group: 'G1', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).not.toHaveBeenCalled();
        });

        it('handles getJiraResource error', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue({ response: { status: 404 } });
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', steps: [] },
                { title: 'Test2', group: 'G1', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).not.toHaveBeenCalled();
        });

        it('handles putJiraResource error', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockRejectedValue({ response: { status: 403 } });
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', steps: [] },
                { title: 'Test2', group: 'G1', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledTimes(2);
        });

        it('writes green char on success when not quiet', async () => {
            mockPrompt.isQuiet.mockReturnValue(false);
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', steps: [] },
                { title: 'Test2', group: 'G1', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockPrompt.print).toHaveBeenCalledWith(expect.stringContaining('+'));
        });

        it('writes red char on error when not quiet', async () => {
            mockPrompt.isQuiet.mockReturnValue(false);
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockRejectedValue({ response: { status: 500 } });
            const tests: TestCase[] = [
                { title: 'Test1', group: 'G1', steps: [] },
                { title: 'Test2', group: 'G1', steps: [] },
            ];
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockPrompt.print).toHaveBeenCalledWith(expect.stringContaining('x'));
        });
    });
});
