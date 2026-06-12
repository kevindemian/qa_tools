import { createMockTestExecutionCreator } from './test-execution-creator-factory.js';

describe('createMockTestExecutionCreator', () => {
    it('returns a mock with all required fields', () => {
        const mock = createMockTestExecutionCreator();
        expect(mock.jiraResource).toBeDefined();
        expect(mock.linkManager).toBeDefined();
        expect(typeof mock._linkTestsToExecution).toBe('function');
        expect(typeof mock.addTestsToExistingExecution).toBe('function');
        expect(typeof mock.createWithLinks).toBe('function');
        expect(typeof mock.create).toBe('function');
    });

    it('default methods return expected mock shapes', () => {
        const mock = createMockTestExecutionCreator();
        const linkResult = mock._linkTestsToExecution('TE-1', ['T-1']);
        expect(linkResult).toEqual({ linked: 0, failed: 0 });

        const addResult = mock.addTestsToExistingExecution('TE-1', ['T-1']);
        expect(addResult).toEqual({ key: 'MOCK-TE', summary: 'Mock Test Execution' });

        const createResult = mock.create('PROJ', ['T-1'], 'test.csv');
        expect(createResult).toEqual({ key: 'MOCK-TE', summary: 'Mock Test Execution' });

        const createWithLinksResult = mock.createWithLinks('PROJ', ['T-1'], 'test.csv');
        expect(createWithLinksResult).toEqual({ key: 'MOCK-TE', summary: 'Mock Test Execution' });
    });

    it('merges overrides correctly', () => {
        const customCreate = vi.fn(() => ({ key: 'CUSTOM', summary: 'Custom' }));
        const mock = createMockTestExecutionCreator({ create: customCreate });
        expect(mock['create']).toBe(customCreate);
        const result = mock.create('PROJ', ['T-1'], 'test.csv');
        expect(result).toEqual({ key: 'CUSTOM', summary: 'Custom' });
    });

    it('each call produces independent mock instances', () => {
        const a = createMockTestExecutionCreator();
        const b = createMockTestExecutionCreator();
        expect(a['create']).not.toBe(b['create']);
    });
});
