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

import IssueLinker from './issue-linker';

describe('IssueLinker', () => {
    let linker: IssueLinker;
    let mockJiraResource: { getJiraResource: jest.Mock; putJiraResource: jest.Mock };
    let mockLinkManager: { associatePrecondition: jest.Mock; linkIssues: jest.Mock };

    beforeEach(() => {
        mockJiraResource = { getJiraResource: jest.fn(), putJiraResource: jest.fn() };
        mockLinkManager = { associatePrecondition: jest.fn(), linkIssues: jest.fn() };
        linker = new IssueLinker(mockJiraResource as never, mockLinkManager as never);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('associatePrecondition', () => {
        const opLog = { info: jest.fn() };

        it('returns null when no precondition', async () => {
            const result = await linker.associatePrecondition({ title: 'Test' } as never, 'TEST-1', opLog);
            expect(result).toBeNull();
            expect(mockLinkManager.associatePrecondition).not.toHaveBeenCalled();
        });

        it('returns null on success', async () => {
            mockLinkManager.associatePrecondition.mockResolvedValue(undefined);
            const test = { title: 'Test', precondition: { value: 'PREC-001' } };
            const result = await linker.associatePrecondition(test as never, 'TEST-1', opLog);
            expect(result).toBeNull();
            expect(mockLinkManager.associatePrecondition).toHaveBeenCalledWith('TEST-1', 'PREC-001');
        });

        it('calls success when not quiet', async () => {
            mockLinkManager.associatePrecondition.mockResolvedValue(undefined);
            mockPrompt.isQuiet.mockReturnValue(false);
            const test = { title: 'Test', precondition: { value: 'PREC-001' } };
            await linker.associatePrecondition(test as never, 'TEST-1', opLog);
            expect(mockPrompt.success).toHaveBeenCalledWith('  Pre-condition PREC-001 associada');
        });

        it('returns abort action on error', async () => {
            mockLinkManager.associatePrecondition.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('abort');
            const test = { title: 'Test', precondition: { value: 'PREC-001' } };
            const result = await linker.associatePrecondition(test as never, 'TEST-1', opLog);
            expect(result).toEqual({ action: 'abort' });
        });
    });

    describe('linkIssues', () => {
        it('returns null when no linkedIssues', async () => {
            const result = await linker.linkIssues('TEST-1', { title: 'Test' } as never);
            expect(result).toBeNull();
            expect(mockLinkManager.linkIssues).not.toHaveBeenCalled();
        });

        it('returns null when linkedIssues is empty array', async () => {
            const result = await linker.linkIssues('TEST-1', { title: 'Test', linkedIssues: [] } as never);
            expect(result).toBeNull();
        });

        it('returns null on success', async () => {
            mockLinkManager.linkIssues.mockResolvedValue(undefined);
            const test = { title: 'Test', linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }] };
            const result = await linker.linkIssues('TEST-1', test as never);
            expect(result).toBeNull();
            expect(mockLinkManager.linkIssues).toHaveBeenCalledWith('TEST-1', test.linkedIssues);
        });

        it('calls success when not quiet', async () => {
            mockLinkManager.linkIssues.mockResolvedValue(undefined);
            mockPrompt.isQuiet.mockReturnValue(false);
            const test = { title: 'Test', linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }] };
            await linker.linkIssues('TEST-1', test as never);
            expect(mockPrompt.success).toHaveBeenCalledWith('  1 linked issue(s) criados');
        });

        it('returns action on error', async () => {
            mockLinkManager.linkIssues.mockRejectedValue(new Error('API error'));
            mockPrompt.onError.mockReturnValue('retry');
            const test = { title: 'Test', linkedIssues: [{ key: 'BUG-1', linkType: 'is tested by' }] };
            const result = await linker.linkIssues('TEST-1', test as never);
            expect(result).toEqual({ action: 'retry' });
        });
    });

    describe('updateCrossReferences', () => {
        it('does nothing when tests array is empty', async () => {
            await linker.updateCrossReferences([], []);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('skips tests without id or group', async () => {
            const tests = [{ title: 'Test', group: '' }] as never;
            await linker.updateCrossReferences(tests, ['']);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('skips groups with fewer than 2 members', async () => {
            const tests = [{ title: 'Test', group: 'G1' }] as never;
            await linker.updateCrossReferences(tests, ['TEST-1']);
            expect(mockJiraResource.getJiraResource).not.toHaveBeenCalled();
        });

        it('updates descriptions for all group members', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old desc' } })
                .mockResolvedValueOnce({ fields: { description: '' } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            const tests = [
                { title: 'Test1', group: 'G1', description: 'First' },
                { title: 'Test2', group: 'G1', description: 'Second' },
            ] as never;
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
            const tests = [
                { title: 'Test1', group: 'G1' },
                { title: 'Test2', group: 'G1' },
            ] as never;
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).not.toHaveBeenCalled();
        });

        it('handles getJiraResource error', async () => {
            mockJiraResource.getJiraResource.mockRejectedValue({ response: { status: 404 } });
            const tests = [
                { title: 'Test1', group: 'G1' },
                { title: 'Test2', group: 'G1' },
            ] as never;
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).not.toHaveBeenCalled();
        });

        it('handles putJiraResource error', async () => {
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockRejectedValue({ response: { status: 403 } });
            const tests = [
                { title: 'Test1', group: 'G1' },
                { title: 'Test2', group: 'G1' },
            ] as never;
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockJiraResource.putJiraResource).toHaveBeenCalledTimes(2);
        });

        it('writes green char on success when not quiet', async () => {
            mockPrompt.isQuiet.mockReturnValue(false);
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            const tests = [
                { title: 'Test1', group: 'G1' },
                { title: 'Test2', group: 'G1' },
            ] as never;
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockPrompt.print).toHaveBeenCalledWith(expect.stringContaining('+'));
        });

        it('writes red char on error when not quiet', async () => {
            mockPrompt.isQuiet.mockReturnValue(false);
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce({ fields: { description: 'Old' } })
                .mockResolvedValueOnce({ fields: { description: 'Old' } });
            mockJiraResource.putJiraResource.mockRejectedValue({ response: { status: 500 } });
            const tests = [
                { title: 'Test1', group: 'G1' },
                { title: 'Test2', group: 'G1' },
            ] as never;
            await linker.updateCrossReferences(tests, ['TEST-1', 'TEST-2']);
            expect(mockPrompt.print).toHaveBeenCalledWith(expect.stringContaining('x'));
        });
    });
});
