vi.mock('../../shared/ui/prompt.js', () => ({
    warn: vi.fn(),
    info: vi.fn(),
    print: vi.fn(),
    printSummary: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
    prompt: vi.fn().mockReturnValue(''),
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

import { createMockLogger, nonNull } from '../../shared/test-utils.js';
import { createMockLinkManager } from '../../shared/test-utils/factories/index.js';
import IssueLinker from '../issue-linker.js';
import type { JiraResourceLike } from '../../shared/types.js';
import { prepareTestRun, finalizeTestCreation, postProcessCheckpoint } from '../import-orchestrator.js';
import { validateImportBatch, confirmOrCancel, handleDryRun } from '../import-prep.js';
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
    const jiraResource: JiraResourceLike = {
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn(),
        putJiraResource: vi.fn(),
        deleteJiraResource: vi.fn(),
        searchJiraIssues: vi.fn(),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
    };
    const linker = vi.mocked(new IssueLinker(jiraResource, createMockLinkManager()));
    linker.associatePrecondition = vi.fn();
    linker.linkIssues = vi.fn();
    linker.updateCrossReferences = vi.fn().mockResolvedValue(undefined);
    Object.assign(linker, overrides);
    return linker;
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
        vi.mocked(confirmOrCancel).mockReturnValue(true);
    });

    describe('PrepareTestRun', () => {
        it('does not reuse manually-entered target keys from a previous run (state leak)', async () => {
            expect.hasAssertions();

            const jiraResource: JiraResourceLike = {
                getJiraResource: vi.fn(),
                postJiraResource: vi.fn(),
                putJiraResource: vi.fn(),
                deleteJiraResource: vi.fn(),
                searchJiraIssues: vi.fn(),
                getTransitionsForIssue: vi.fn(),
                transitionIssue: vi.fn(),
            };

            const promptMock = (await import('../../shared/ui/prompt.js')).prompt as ReturnType<typeof vi.fn>;

            promptMock.mockReset();
            promptMock.mockReturnValue('ECSPOL-1835');

            await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
                jiraResource,
            });

            const Config = (await import('../../shared/config-accessor.js')).default;
            expect(Config.get('targetKeys')).toBe('');
        });

        it('parses a single target key as one element, not per-character', async () => {
            expect.hasAssertions();

            const jiraResource: JiraResourceLike = {
                getJiraResource: vi.fn(),
                postJiraResource: vi.fn(),
                putJiraResource: vi.fn(),
                deleteJiraResource: vi.fn(),
                searchJiraIssues: vi.fn(),
                getTransitionsForIssue: vi.fn(),
                transitionIssue: vi.fn(),
            };

            const promptMock = (await import('../../shared/ui/prompt.js')).prompt as ReturnType<typeof vi.fn>;
            promptMock.mockReset();
            promptMock.mockReturnValue('ECSPOL-1835');

            await prepareTestRun({
                tests: makeTestCases(1),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
                jiraResource,
            });

            const info = (await import('../../shared/ui/prompt.js')).info as ReturnType<typeof vi.fn>;
            const orderedLine = info.mock.calls.find((c) => String(c[0]).includes('CSV[1]'));
            expect(orderedLine).toBeDefined();
            expect(String(nonNull(orderedLine)[0])).toBe('  CSV[1] → ECSPOL-1835');
        });

        it('uses explicit targetKeys param and never prompts nor reads Config', async () => {
            expect.hasAssertions();

            const jiraResource: JiraResourceLike = {
                getJiraResource: vi.fn(),
                postJiraResource: vi.fn(),
                putJiraResource: vi.fn(),
                deleteJiraResource: vi.fn(),
                searchJiraIssues: vi.fn(),
                getTransitionsForIssue: vi.fn(),
                transitionIssue: vi.fn(),
            };

            const promptMock = (await import('../../shared/ui/prompt.js')).prompt as ReturnType<typeof vi.fn>;
            promptMock.mockReset();
            promptMock.mockReturnValue('ECSPOL-9999');

            const Config = (await import('../../shared/config-accessor.js')).default;
            Config.set('targetKeys', 'ECSPOL-8888');

            await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
                jiraResource,
                targetKeys: ['ECSPOL-1001', 'ECSPOL-1002'],
            });

            expect(promptMock).not.toHaveBeenCalled();
            const info = (await import('../../shared/ui/prompt.js')).info as ReturnType<typeof vi.fn>;
            const orderedLine = info.mock.calls.find((c) => String(c[0]).includes('CSV[1]'));
            expect(orderedLine).toBeDefined();
            expect(String(nonNull(orderedLine)[0])).toBe('  CSV[1] → ECSPOL-1001');
            Config.set('targetKeys', '');
        });

        it('user cancels via confirmOrCancel', async () => {
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

        it('filterTests removed: pipeline uses the full CSV test set without a filtering prompt', async () => {
            const result = await prepareTestRun({
                tests: makeTestCases(2),
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                onBusy,
                warn,
            });
            expect(result).toBeDefined();
            if (result && 'tests' in result) {
                expect(result.tests).toHaveLength(2);
            }
        });

        it('dry-run returns early', async () => {
            expect.hasAssertions();

            vi.mocked(handleDryRun).mockResolvedValue({
                inMemoryTasksId: [],
                inMemoryTasksText: [],
                parentIssues: [],
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
                parentIssues: [],
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
                failedLinks: [],
                inMemoryTasksId: ['T-1'],
                inMemoryTasksText: ['Test 1'],
                parentIssues: [],
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                opLog: createMockLogger(),
                onBusy,
                info: vi.fn(),
                printSummary: vi.fn(),
            });

            expect(result?.status).toBe('error');
            expect(result?.summary).toContain('1/2');
        });

        it('failedLinks only appear in summary when errored is true', async () => {
            expect.hasAssertions();

            const results = [
                { status: 'ok' as const, label: 'Test 1', message: '' },
                { status: 'ok' as const, label: 'Test 2', message: '' },
            ];
            const linker = linkerMock();
            const result = await finalizeTestCreation({
                results,
                tests: makeTestCases(2),
                linker,
                failedLinks: ['cross-ref:TEST-1'],
                inMemoryTasksId: ['T-1'],
                inMemoryTasksText: ['Test 1'],
                parentIssues: [],
                sourcePath: '/p.csv',
                sourceType: 'csv',
                project_name: 'PROJ',
                jiraLabels: [],
                opLog: createMockLogger(),
                onBusy,
                info: vi.fn(),
                printSummary: vi.fn(),
            });

            expect(result?.status).toBe('ok');
            expect(result?.summary).toBe('2/2 testes criados');
        });
    });

    describe('PostProcessCheckpoint', () => {
        it('deletes checkpoint and updates xrefs', async () => {
            expect.hasAssertions();

            const linker = linkerMock({
                updateCrossReferences: vi.fn().mockResolvedValue([]),
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
