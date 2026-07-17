vi.mock('../shared/prompt', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    extractErrorMessage: vi.fn((err: unknown) => String(err)),
}));

vi.mock('../shared/logger', () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockConfigGet = vi.fn<(key: string) => string | undefined>();
vi.mock('../shared/config-accessor.js', () => ({
    default: { getDefault: () => ({ get: (key: string) => mockConfigGet(key) }) },
}));

const hoistedXray = vi.hoisted(() => ({
    addPreconditionsToTest: vi.fn().mockResolvedValue(undefined),
    graphql: vi.fn().mockResolvedValue(null),
    graphqlMutation: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue('tok'),
}));
vi.mock('../shared/xray-cloud-client', () => {
    class XrayCloudClientMock {
        addPreconditionsToTest(...args: unknown[]) {
            return (hoistedXray.addPreconditionsToTest as unknown as (...a: unknown[]) => unknown)(...args);
        }
        graphql(...args: unknown[]) {
            return (hoistedXray.graphql as unknown as (...a: unknown[]) => unknown)(...args);
        }
        graphqlMutation(...args: unknown[]) {
            return (hoistedXray.graphqlMutation as unknown as (...a: unknown[]) => unknown)(...args);
        }
        authenticate(...args: unknown[]) {
            return (hoistedXray.authenticate as unknown as (...a: unknown[]) => unknown)(...args);
        }
    }
    return { XrayCloudClient: XrayCloudClientMock };
});

import { PreconditionHandler } from './precondition-importer.js';
import type { Mock } from 'vitest';

describe('PreconditionHandler', () => {
    let mockJiraResource: {
        getJiraResource: Mock;
        postJiraResource: Mock;
        putJiraResource: Mock;
        searchJiraIssues: Mock;
        getTransitionsForIssue: Mock;
        transitionIssue: Mock;
    };
    let handler: PreconditionHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConfigGet.mockReturnValue(undefined);
        mockJiraResource = {
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            searchJiraIssues: vi.fn(),
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
        };
        handler = new PreconditionHandler(mockJiraResource);
    });

    describe('GetPreconditionFieldId', () => {
        it('returns cached value on second call', async () => {
            expect.hasAssertions();

            const fields = [
                { id: 'custom_123', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource.mockResolvedValue(fields);
            const first = await handler._getPreconditionFieldId();
            const second = await handler._getPreconditionFieldId();

            expect(first).toBe('custom_123');
            expect(second).toBe('custom_123');
            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('falls back to customfield_13708 when API fails', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockRejectedValue(new Error('API error'));
            const result = await handler._getPreconditionFieldId();

            expect(result).toBe('customfield_13708');
        });

        it('falls back to customfield_13708 when no matching field', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue([{ id: 'other', schema: { custom: 'other' } }]);
            const result = await handler._getPreconditionFieldId();

            expect(result).toBe('customfield_13708');
        });
    });

    describe('AssociatePrecondition', () => {
        it('adds precondition to test issue fields', async () => {
            expect.hasAssertions();

            const fields = [
                { id: 'custom_99', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(fields)
                .mockResolvedValueOnce({ key: 'TEST-1', fields: { custom_99: ['PRE-1'] } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            await handler.associatePrecondition('TEST-1', 'PRE-2');

            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
                fields: { custom_99: ['PRE-1', 'PRE-2'] },
            });
        });

        it('does not duplicate existing precondition', async () => {
            expect.hasAssertions();

            const fields = [
                { id: 'custom_99', schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' } },
            ];
            mockJiraResource.getJiraResource
                .mockResolvedValueOnce(fields)
                .mockResolvedValueOnce({ key: 'TEST-1', fields: { custom_99: ['PRE-1', 'PRE-2'] } });
            mockJiraResource.putJiraResource.mockResolvedValue({});
            await handler.associatePrecondition('TEST-1', 'PRE-2');

            expect(mockJiraResource.putJiraResource).toHaveBeenCalledWith('issue/TEST-1', {
                fields: { custom_99: ['PRE-1', 'PRE-2'] },
            });
        });
    });

    describe('ResolvePreconditionIssueTypeId', () => {
        it('returns the issue type id for Pre-condition', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue([
                { id: '11801', name: 'Pre-condition' },
                { id: '11802', name: 'Test Execution' },
            ]);
            const result = await handler._resolvePreconditionIssueTypeId();

            expect(result).toBe('11801');
        });

        it('caches the result on second call', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            await handler._resolvePreconditionIssueTypeId();
            await handler._resolvePreconditionIssueTypeId();

            expect(mockJiraResource.getJiraResource).toHaveBeenCalledTimes(1);
        });

        it('throws when no Pre-condition issue type exists', async () => {
            expect.hasAssertions();

            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '100', name: 'Bug' }]);

            await expect(handler._resolvePreconditionIssueTypeId()).rejects.toThrow(
                'Issue type "Pre-condition" não encontrado no Jira',
            );
        });
    });

    describe('ListPreconditions', () => {
        it('returns mapped preconditions from JQL search', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [
                    { key: 'PREC-1', fields: { summary: 'User must be logged in' } },
                    { key: 'PREC-2', fields: { summary: 'Database must be seeded' } },
                ],
                total: 2,
                startAt: 0,
                maxResults: 200,
            });
            const result = await handler.listPreconditions('ECSPOL');

            expect(result).toHaveLength(2);
            expect(result[0]).toStrictEqual({ key: 'PREC-1', summary: 'User must be logged in' });
            expect(result[1]).toStrictEqual({ key: 'PREC-2', summary: 'Database must be seeded' });
        });

        it('returns empty array when no preconditions found', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 200 });
            const result = await handler.listPreconditions('EMPTY');

            expect(result).toStrictEqual([]);
        });
    });

    describe('FindExistingPrecondition', () => {
        it('returns key when exact summary match found via JQL', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-1', fields: { summary: 'User must be logged in' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.findExistingPrecondition('ECSPOL', 'User must be logged in');

            expect(key).toBe('PREC-1');
        });

        it('returns null when no JQL match', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            const key = await handler.findExistingPrecondition('ECSPOL', 'Nonexistent');

            expect(key).toBeNull();
        });

        it('returns null when JQL matches but summaries differ case-sensitively', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-1', fields: { summary: 'Different summary' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.findExistingPrecondition('ECSPOL', 'User must be logged in');

            expect(key).toBeNull();
        });

        it('escapes single quotes in summary for JQL safety', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            await handler.findExistingPrecondition('PROJ', "user's precondition");

            expect(mockJiraResource.searchJiraIssues).toHaveBeenCalledWith(
                expect.stringContaining("user\\\\'s"),
                expect.any(Number),
            );
        });
    });

    describe('CreatePrecondition', () => {
        it('creates a new precondition and returns its key', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 5 });
            mockJiraResource.getJiraResource.mockResolvedValue([{ id: '11801', name: 'Pre-condition' }]);
            mockJiraResource.postJiraResource.mockResolvedValue({ key: 'ECSPOL-NEW-1' });
            const key = await handler.createPrecondition('ECSPOL', 'User must be admin');

            expect(mockJiraResource.postJiraResource).toHaveBeenCalledWith('issue', {
                fields: {
                    project: { key: 'ECSPOL' },
                    summary: 'User must be admin',
                    issuetype: { id: '11801' },
                },
            });
            expect(key).toBe('ECSPOL-NEW-1');
        });

        it('reuses existing precondition when found', async () => {
            expect.hasAssertions();

            mockJiraResource.searchJiraIssues.mockResolvedValue({
                issues: [{ key: 'PREC-EXISTING', fields: { summary: 'User must be admin' } }],
                total: 1,
                startAt: 0,
                maxResults: 5,
            });
            const key = await handler.createPrecondition('ECSPOL', 'User must be admin');

            expect(key).toBe('PREC-EXISTING');
            expect(mockJiraResource.postJiraResource).not.toHaveBeenCalled();
        });
    });

    describe('AssociatePrecondition (cloud)', () => {
        it('associates via Xray Cloud GraphQL addPreconditionsToTest using numeric ids', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'jiraMode') return 'cloud';
                if (key === 'xrayClientId') return 'cid';
                if (key === 'xrayClientSecret') return 'csecret';
                return undefined;
            });
            mockJiraResource.getJiraResource.mockImplementation((url: string) => {
                if (url.includes('ECSPOL-809')) return { id: '809id' };
                if (url.includes('ECSPOL-810')) return { id: '810id' };
                if (url.includes('TEST-1')) return { id: 'test1id' };
                return { id: 'x' };
            });

            await expect(handler.associatePrecondition('TEST-1', 'ECSPOL-809')).resolves.toBeNull();

            expect(hoistedXray.addPreconditionsToTest).toHaveBeenCalledWith('test1id', ['809id'], 'cid', 'csecret');
        });

        it('associates multiple pre-conditions via a single GraphQL call', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => {
                if (key === 'jiraMode') return 'cloud';
                if (key === 'xrayClientId') return 'cid';
                if (key === 'xrayClientSecret') return 'csecret';
                return undefined;
            });
            mockJiraResource.getJiraResource.mockImplementation((url: string) => {
                if (url.includes('ECSPOL-809')) return { id: '809id' };
                if (url.includes('ECSPOL-810')) return { id: '810id' };
                if (url.includes('TEST-1')) return { id: 'test1id' };
                return { id: 'x' };
            });

            await expect(handler.associatePrecondition('TEST-1', ['ECSPOL-809', 'ECSPOL-810'])).resolves.toBeNull();

            expect(hoistedXray.addPreconditionsToTest).toHaveBeenCalledWith(
                'test1id',
                ['809id', '810id'],
                'cid',
                'csecret',
            );
        });

        it('throws when Xray credentials are missing', async () => {
            expect.hasAssertions();

            mockConfigGet.mockImplementation((key: string) => (key === 'jiraMode' ? 'cloud' : undefined));

            await expect(handler.associatePrecondition('TEST-1', 'ECSPOL-809')).rejects.toThrow(
                'XRAY_CLIENT_ID and XRAY_CLIENT_SECRET must be set',
            );
        });
    });
});
