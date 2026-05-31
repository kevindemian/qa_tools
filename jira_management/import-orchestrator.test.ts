jest.mock('../shared/prompt', () => ({
    warn: jest.fn(),
    info: jest.fn(),
    print: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
}));

jest.mock('../shared/state', () => ({
    update: jest.fn(),
    load: jest.fn().mockReturnValue({}),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
}));

jest.mock('./import-prep', () => ({
    validateImportBatch: jest.fn(),
    showPreview: jest.fn(),
    filterTests: jest.fn(),
    confirmOrCancel: jest.fn(),
    handleDryRun: jest.fn(),
}));

jest.mock('./mapping-file-generator', () => {
    return jest.fn().mockImplementation(() => ({
        generate: jest.fn(),
    }));
});

jest.mock('./import-loop', () => ({
    executeTestCreationLoop: jest.fn(),
    updateFinalState: jest.fn(),
}));

import { prepareTestRun, finalizeTestCreation, postProcessCheckpoint } from './import-orchestrator';
import { validateImportBatch, filterTests, confirmOrCancel, handleDryRun } from './import-prep';
import * as STATE from '../shared/state';
import { updateFinalState } from './import-loop';

const makeTestCases = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        title: `Test ${i + 1}`,
        steps: [{ fields: { Action: 'a' } }],
    }));

const onBusy = jest.fn();
const warn = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(validateImportBatch).mockReturnValue({
        resumeFrom: 0,
        inMemoryTasksId: [],
        inMemoryTasksText: [],
        opLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
    });
    jest.mocked(filterTests).mockImplementation((t: unknown[]) => t as []);
    jest.mocked(confirmOrCancel).mockReturnValue(true);
});

describe('prepareTestRun', () => {
    it('user cancels via confirmOrCancel', async () => {
        jest.mocked(confirmOrCancel).mockReturnValue(false);
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
        jest.mocked(filterTests).mockReturnValue(null);
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
        jest.mocked(handleDryRun).mockReturnValue({
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            summary: 'DRY-RUN simulado',
            status: 'ok',
            sourcePath: '/p.csv',
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
        expect(result).toEqual({
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            summary: 'DRY-RUN simulado',
            status: 'ok',
            sourcePath: '/p.csv',
        });
    });
});

describe('finalizeTestCreation', () => {
    it('with errors', async () => {
        const results = [
            { status: 'ok' as const, label: 'Test 1', message: '' },
            { status: 'error' as const, label: 'Test 2', message: 'fail' },
        ];
        const result = await finalizeTestCreation({
            results,
            tests: makeTestCases(2),
            linker: {} as never,
            inMemoryTasksId: ['T-1'],
            inMemoryTasksText: ['Test 1'],
            sourcePath: '/p.csv',
            sourceType: 'csv',
            project_name: 'PROJ',
            jiraLabels: [],
            opLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as never,
            onBusy,
            info: jest.fn(),
            printSummary: jest.fn(),
        });
        expect(result).toBeDefined();
        expect(result!.status).toBe('error');
        expect(result!.summary).toContain('1/2');
    });
});

describe('postProcessCheckpoint', () => {
    it('deletes checkpoint and updates xrefs', async () => {
        const linker = {
            updateCrossReferences: jest.fn().mockResolvedValue(undefined),
        } as never;
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
            info: jest.fn(),
        });
        expect(STATE.update).toHaveBeenCalledWith(expect.any(Function));
        expect(updateFinalState).toHaveBeenCalled();
    });
});
