/**
 * GREEN tests for clean-slate update: _doUpdate passes TestCase data
 * (steps, preconditions, linkedIssues) to cleanSlateUpdate.
 *
 * Root cause was: buildTestData() produces a Jira API payload WITHOUT steps/preconditions/linkedIssues.
 * _doUpdate extracted these from the payload → all default to [] → cleanSlateUpdate received empty arrays.
 *
 * Fix: _doUpdate now receives the TestCase object and extracts steps/preconditions/linkedIssues from it.
 */
import { describe, it, expect, vi } from 'vitest';
import type { JiraResourceLike } from '../../shared/types.js';

vi.mock('../../shared/ui/prompt.js', () => ({
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    isQuiet: vi.fn(() => true),
    onError: vi.fn(() => 'skip'),
    print: vi.fn(),
    confirm: vi.fn(() => true),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
    },
}));

const mockCleanSlateUpdate = vi.fn().mockResolvedValue({ success: true, restored: false });

vi.mock('../issue-snapshot.js', () => ({
    cleanSlateUpdate: (...args: unknown[]) => mockCleanSlateUpdate(...args),
    snapshotIssueState: vi.fn(),
    clearIssueFields: vi.fn(),
    rebuildIssueFields: vi.fn(),
    restoreIssueState: vi.fn(),
}));

describe('clean-slate: _doUpdate passes TestCase data to cleanSlateUpdate', () => {
    it('green: cleanSlateUpdate receives steps from test.steps, not testData.steps', async () => {
        vi.clearAllMocks();
        mockCleanSlateUpdate.mockResolvedValue({ success: true, restored: false });

        const { default: TestCaseFactory } = await import('../test-case-factory.js');

        const mockResource = {
            getJiraResource: vi.fn().mockResolvedValue({ key: 'PROJ-1' }),
            putJiraResource: vi.fn().mockResolvedValue({}),
            postJiraResource: vi.fn(),
            searchJiraIssues: vi.fn().mockResolvedValue({
                issues: [{ key: 'PROJ-1', fields: { summary: 'Test with steps' } }],
            }),
        } as unknown as JiraResourceLike;

        const mockStepImporter = { importStep: vi.fn(), setSteps: vi.fn() } as never;
        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        // Enable clean-slate path
        (factory as unknown as { _snapshotCtx: object })._snapshotCtx = {};

        // testData has NO steps (simulates buildTestData output)
        const testData = {
            fields: { summary: 'Test with steps', project: 'TEST' },
        };

        // test object HAS steps
        const test = {
            title: 'Test with steps',
            steps: [{ fields: { Action: 'Click button', Data: 'none', 'Expected Result': 'Success' } }],
        };

        await factory.createIssue({
            testData,
            testTitle: 'Test with steps',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            importMode: 'hybrid',
            test,
        });

        expect(mockCleanSlateUpdate).toHaveBeenCalled();
        const rebuildData = (mockCleanSlateUpdate.mock.calls[0] ?? [])[3];

        // GREEN: steps should come from test.steps
        expect(rebuildData.steps).toHaveLength(1);
        expect(rebuildData.steps[0].fields.Action).toBe('Click button');
    });

    it('green: cleanSlateUpdate receives preconditions from test.precondition, not testData.preconditions', async () => {
        vi.clearAllMocks();
        mockCleanSlateUpdate.mockResolvedValue({ success: true, restored: false });

        const { default: TestCaseFactory } = await import('../test-case-factory.js');

        const mockResource = {
            getJiraResource: vi.fn().mockResolvedValue({ key: 'PROJ-1' }),
            putJiraResource: vi.fn().mockResolvedValue({}),
            postJiraResource: vi.fn(),
            searchJiraIssues: vi.fn().mockResolvedValue({
                issues: [{ key: 'PROJ-1', fields: { summary: 'Test with preconditions' } }],
            }),
        } as unknown as JiraResourceLike;

        const mockStepImporter = { importStep: vi.fn(), setSteps: vi.fn() } as never;
        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        (factory as unknown as { _snapshotCtx: object })._snapshotCtx = {};

        const testData = { fields: { summary: 'Test with preconditions', project: 'TEST' } };

        const test = {
            title: 'Test with preconditions',
            steps: [],
            precondition: [
                { type: 'reference' as const, value: 'PREC-1' },
                { type: 'reference' as const, value: 'PREC-2' },
            ],
        };

        await factory.createIssue({
            testData,
            testTitle: 'Test with preconditions',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            importMode: 'hybrid',
            test,
        });

        expect(mockCleanSlateUpdate).toHaveBeenCalled();
        const rebuildData = (mockCleanSlateUpdate.mock.calls[0] ?? [])[3];

        // GREEN: preconditions should be ['PREC-1', 'PREC-2'] from test.precondition
        expect(rebuildData.preconditions).toEqual(['PREC-1', 'PREC-2']);
    });

    it('green: cleanSlateUpdate receives linkedIssues from test.linkedIssues, not testData.linkedIssues', async () => {
        vi.clearAllMocks();
        mockCleanSlateUpdate.mockResolvedValue({ success: true, restored: false });

        const { default: TestCaseFactory } = await import('../test-case-factory.js');

        const mockResource = {
            getJiraResource: vi.fn().mockResolvedValue({ key: 'PROJ-1' }),
            putJiraResource: vi.fn().mockResolvedValue({}),
            postJiraResource: vi.fn(),
            searchJiraIssues: vi.fn().mockResolvedValue({
                issues: [{ key: 'PROJ-1', fields: { summary: 'Test with links' } }],
            }),
        } as unknown as JiraResourceLike;

        const mockStepImporter = { importStep: vi.fn(), setSteps: vi.fn() } as never;
        const factory = new TestCaseFactory(mockResource, mockStepImporter);

        (factory as unknown as { _snapshotCtx: object })._snapshotCtx = {};

        const testData = { fields: { summary: 'Test with links', project: 'TEST' } };

        const test = {
            title: 'Test with links',
            steps: [],
            linkedIssues: [{ key: 'STORY-1', linkType: 'Relates' }],
        };

        await factory.createIssue({
            testData,
            testTitle: 'Test with links',
            testIdx: 0,
            totalTests: 1,
            opLog: { info: vi.fn() },
            importMode: 'hybrid',
            test,
        });

        expect(mockCleanSlateUpdate).toHaveBeenCalled();
        const rebuildData = (mockCleanSlateUpdate.mock.calls[0] ?? [])[3];

        // GREEN: linkedIssues should come from test.linkedIssues
        expect(rebuildData.linkedIssues).toHaveLength(1);
        expect(rebuildData.linkedIssues[0].inwardKey).toBe('STORY-1');
        expect(rebuildData.linkedIssues[0].outwardKey).toBe('PROJ-1');
        expect(rebuildData.linkedIssues[0].linkType).toBe('Relates');
    });
});
