import { createMockLinkManager } from './link-manager-factory.js';

describe('CreateMockLinkManager', () => {
    it('returns a mock with all methods as vi.fn()', () => {
        const mock = createMockLinkManager();

        const methods = [
            'getIssueLinkTypes',
            'resolveLinkTypeId',
            'linkIssues',
            'createIssueLink',
            'associatePrecondition',
            'listPreconditions',
            'createPrecondition',
            'listTestExecutions',
            'validateTestExecutionKey',
            'getTestCaseSummaries',
        ] as const;

        expect(methods.every((m) => m in mock)).toBeTruthy();
    });

    it('returns null for cache properties by default', () => {
        const mock = createMockLinkManager();

        expect(mock.linkTypesCache).toBeNull();
        expect(mock.cacheFilePath).toBeNull();
    });

    it('merges overrides correctly', () => {
        const customLink = vi.fn();
        const mock = createMockLinkManager({ linkIssues: customLink });

        expect(mock['linkIssues']).toBe(customLink);
    });

    it('each call produces independent vi.fn() instances', () => {
        const a = createMockLinkManager();
        const b = createMockLinkManager();

        expect(a['linkIssues']).not.toBe(b['linkIssues']);
    });
});
