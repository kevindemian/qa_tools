import { jest } from '@jest/globals';
import { createMockContext } from './context-factory';

describe('createMockContext', () => {
    it('returns a mock with all required fields', () => {
        const ctx = createMockContext();
        expect(ctx.jiraResource).toBeDefined();
        expect(ctx.jiraResourceXray).toBeDefined();
        expect(ctx.linkManager).toBeDefined();
        expect(ctx.linkManagerXray).toBeDefined();
        expect(ctx.csvResource).toBeDefined();
        expect(typeof ctx.pushHistory).toBe('function');
        expect(typeof ctx.printSessionSummary).toBe('function');
        expect(ctx.base_url).toBe('https://jira.test.com');
        expect(ctx.sessionLog).toBeDefined();
    });

    it('sub-resources are mocked with jest.fn()', () => {
        const ctx = createMockContext();
        expect(typeof ctx.jiraResource.getJiraResource).toBe('function');
        expect(typeof ctx.linkManager.linkIssues).toBe('function');
        expect(typeof ctx.csvResource.readCsvFromString).toBe('function');
    });

    it('SessionContext has default values', () => {
        const ctx = createMockContext();
        expect(ctx.ctx.project_name).toBe('TEST');
        expect(ctx.ctx.isBusy).toBe(false);
        expect(ctx.ctx.results).toEqual([]);
        expect(typeof ctx.ctx.pushHistory).toBe('function');
    });

    it('packageManager is undefined by default', () => {
        const ctx = createMockContext();
        expect(ctx.packageManager).toBeUndefined();
    });

    it('merges overrides correctly', () => {
        const customPush = jest.fn();
        const ctx = createMockContext({ pushHistory: customPush });
        expect(ctx.pushHistory).toBe(customPush);
    });

    it('nested overrides merge correctly', () => {
        const ctx = createMockContext({
            ctx: {
                isBusy: false,
                lastOperation: '',
                sessionCounters: [],
                packageManager: undefined,
                git_directory: 'no_dir_selected',
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                project_name: 'OVERRIDE',
                results: [],
                resetResults: jest.fn(),
                withBusy: jest.fn(),
                pushHistory: jest.fn(),
                buildContextLine: jest.fn(),
            },
        });
        expect(ctx.ctx.project_name).toBe('OVERRIDE');
    });
});
