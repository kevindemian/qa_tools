import { createMockLinkManager } from '../link-manager-factory.js';

describe('CreateMockLinkManager', () => {
    it('returns a mock with all methods as vi.fn()', () => {
        const mock = createMockLinkManager();

        const methods = [
            'getIssueLinkTypes',
            'resolveLinkTypeId',
            'linkTestsToRequirement',
            'linkTestToTestExecution',
            'linkRelated',
            'linkPreCondition',
            'linkSourceToTargets',
            'createLink',
            'getIssueLinks',
            'getIssueLinksByType',
            'removeIssueLink',
            'clearIssueLinksByType',
            '_getPreconditionFieldId',
            'associatePrecondition',
            '_resolvePreconditionIssueTypeId',
            'listPreconditions',
            'createPrecondition',
            'listTestExecutions',
            'validateTestExecutionKey',
            'getTestCaseSummaries',
        ] as const;

        expect(methods.every((m) => m in mock)).toBeTruthy();
        expect('jiraResource' in mock).toBeTruthy();
        expect('linkTypeManager' in mock).toBeTruthy();
        expect('issueLinkService' in mock).toBeTruthy();
        expect('preconditionHandler' in mock).toBeTruthy();
    });

    it('returns null for cache properties by default', () => {
        const mock = createMockLinkManager();

        expect(mock.linkTypesCache).toBeNull();
        expect(mock.cacheFilePath).toBeNull();
    });

    it('merges overrides correctly', () => {
        const customLink = vi.fn();
        const mock = createMockLinkManager({ linkSourceToTargets: customLink });

        expect(mock['linkSourceToTargets']).toBe(customLink);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockLinkManager();
        const b = createMockLinkManager();

        expect(a['linkSourceToTargets']).not.toBe(b['linkSourceToTargets']);
    });
});
