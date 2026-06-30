import { createMockContext } from './context-factory.js';

describe('CreateMockContext', () => {
    it('returns a mock with all required fields', () => {
        const ctx = createMockContext();

        const fields = ['jiraResource', 'jiraResourceXray', 'linkManager', 'linkManagerXray', 'csvResource'] as const;

        expect(fields.every((f) => f in ctx)).toBeTruthy();

        const fns = ['pushHistory', 'printSessionSummary'] as const;

        expect(fns.every((f) => typeof Reflect.get(ctx, f) === 'function')).toBeTruthy();
        expect(ctx.base_url).toBe('https://jira.test.com');
        expect(ctx.sessionLog).toBeDefined();
    });

    it('sub-resources are mocked with vi.fn()', () => {
        const ctx = createMockContext();

        expect(typeof ctx.jiraResource.getJiraResource).toBe('function');
        expect(typeof ctx.linkManager.linkIssues).toBe('function');
        expect(typeof ctx.csvResource.readCsvFromString).toBe('function');
    });

    it('sessionContext has default values', () => {
        const ctx = createMockContext();

        expect(ctx.ctx.project_name).toBe('TEST');
        expect(ctx.ctx.isBusy).toBeFalsy();
        expect(ctx.ctx.results).toStrictEqual([]);
        expect(typeof ctx.ctx.pushHistory).toBe('function');
    });

    it('packageManager is undefined by default', () => {
        const ctx = createMockContext();

        expect(ctx.packageManager).toBeUndefined();
    });

    it('merges overrides correctly', () => {
        const customPush = vi.fn();
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
                sha: null,
                branch: null,
                store: null,
                resetResults: vi.fn(),
                withBusy: vi.fn(),
                pushHistory: vi.fn(),
                buildContextLine: vi.fn(),
            },
        });

        expect(ctx.ctx.project_name).toBe('OVERRIDE');
    });
});
