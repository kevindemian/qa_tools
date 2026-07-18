vi.mock('../../shared/ui/prompt.js', () => ({
    warn: vi.fn(),
    info: vi.fn(),
    print: vi.fn(),
    printSummary: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
}));

vi.mock('../../shared/state', () => ({
    update: vi.fn(),
    load: vi.fn().mockReturnValue({}),
}));

vi.mock('../../shared/logger', () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        }),
    },
}));

vi.mock('../import-prep', () => ({
    validateImportBatch: vi.fn(),
    showPreview: vi.fn(),
    filterTests: vi.fn(),
    confirmOrCancel: vi.fn(),
    handleDryRun: vi.fn(),
}));

vi.mock('../mapping-file-generator', () => ({
    default: vi.fn(function () {
        return {
            generate: vi.fn(),
        };
    }),
}));

vi.mock('../import-loop', () => ({
    executeTestCreationLoop: vi.fn(),
    updateFinalState: vi.fn(),
}));

import { createMockLogger } from '../../shared/test-utils.js';
import { createMockLinkManager } from '../../shared/test-utils/factories/index.js';
import type IssueLinker from '../issue-linker.js';
import { prepareTestRun, finalizeTestCreation, postProcessCheckpoint } from '../import-orchestrator.js';
import { validateImportBatch, filterTests, confirmOrCancel, handleDryRun } from '../import-prep.js';
import * as STATE from '../../shared/state.js';
import { updateFinalState } from '../import-loop.js';
const makeTestCases = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        title: `Test ${i + 1}`,
        steps: [{ fields: { Action: 'a' } }],
    }));

const onBusy = vi.fn();
const warn = vi.fn();

function linkerMock(
    overrides: Partial<Pick<IssueLinker, 'associatePrecondition' | 'linkIssues' | 'updateCrossReferences'>> = {},
): IssueLinker {
    return {
        jiraResource: {
            getJiraResource: vi.fn(),
            postJiraResource: vi.fn(),
            putJiraResource: vi.fn(),
            searchJiraIssues: vi.fn(),
            getTransitionsForIssue: vi.fn(),
            transitionIssue: vi.fn(),
        },
        linkManager: createMockLinkManager(),
        associatePrecondition: vi.fn(),
        linkIssues: vi.fn(),
        updateCrossReferences: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('Import Orchestrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(validateImportBatch).mockReturnValue({
            resumeFrom: 0,
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            opLog: createMockLogger(),
        });
        vi.mocked(filterTests).mockImplementation((t: unknown[]) => t as []);
        vi.mocked(confirmOrCancel).mockReturnValue(true);
    });

    describe('PrepareTestRun', () => {
        it('user cancels via confirmOrCancel', async () => {
            expect.hasAssertions();

            vi.mocked(confirmOrCancel).mockReturnValue(false);
            const result = await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
            });

            expect(result).toBeUndefined();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('cancelada'));
        });

        it('filterTests returns null', async () => {
            expect.hasAssertions();

            vi.mocked(filterTests).mockReturnValue(null);
            const result = await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
            });

            expect(result).toBeUndefined();
        });

        it('dry-run returns early', async () => {
            expect.hasAssertions();

            vi.mocked(handleDryRun).mockReturnValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'DRY-RUN simulado',
                status: 'ok',
                sourcePath: '/p.csv',
                failedLinks: [],
            });
            const result = await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
            });

            expect(result).toStrictEqual({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                summary: 'DRY-RUN simulado',
                status: 'ok',
                sourcePath: '/p.csv',
                failedLinks: [],
            });
        });
    });

    describe('FinalizeTestCreation', () => {
        it('with errors', async () => {
            expect.hasAssertions();

            const results = [
                { status: 'ok' as const, label: 'Test 1', message: '' },
                { status: 'error' as const, label: 'Test 2', message: 'fail' },
            ];
            const linker = linkerMock({
                associatePrecondition: vi.fn(),
                linkIssues: vi.fn(),
                updateCrossReferences: vi.fn(),
            });
            const result = await finalizeTestCreation({
                results,
                tests: makeTestCases(2),
                linker,
                inMemoryTasksId: ['T-1'],
                inMemoryTasksText: ['Test 1'],
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                opLog: createMockLogger(),
                onBusy,
                info: vi.fn(),
                printSummary: vi.fn(),
                failedLinks: [],
            });

            expect(result?.status).toBe('error');
            expect(result?.summary).toContain('1/2');
        });
    });

    describe('PostProcessCheckpoint', () => {
        it('deletes checkpoint and updates xrefs', async () => {
            expect.hasAssertions();

            const linker = linkerMock({
                updateCrossReferences: vi.fn().mockResolvedValue(undefined),
            });
            const results = [{ status: 'ok' as const, label: 'Test 1', message: '' }];
            await postProcessCheckpoint({
                results,
                tests: [{ title: 'Test 1', steps: [], group: 'g1' }],
                projectName: 'PROJ',
                inMemoryTasksId: ['T-1'],
                jiraLabels: [],
                sourcePath: '/p.csv',
                sourceType: 'csv',
                linker,
                info: vi.fn(),
            });

            expect(STATE.update).toHaveBeenCalledWith(expect.any(Function));
            expect(updateFinalState).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(String),
                expect.any(String),
                expect.any(Array),
            );
        });
    });
});
