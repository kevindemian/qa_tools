import { createMockLinkManager } from './link-manager-factory.js';

describe('createMockLinkManager', () => {
    it('returns a mock with all methods as vi.fn()', () => {
        const mock = createMockLinkManager();
        expect(typeof mock.getIssueLinkTypes).toBe('function');
        expect(typeof mock.resolveLinkTypeId).toBe('function');
        expect(typeof mock.linkIssues).toBe('function');
        expect(typeof mock.createIssueLink).toBe('function');
        expect(typeof mock.associatePrecondition).toBe('function');
        expect(typeof mock.listPreconditions).toBe('function');
        expect(typeof mock.createPrecondition).toBe('function');
        expect(typeof mock.listTestExecutions).toBe('function');
        expect(typeof mock.validateTestExecutionKey).toBe('function');
        expect(typeof mock.getTestCaseSummaries).toBe('function');
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
