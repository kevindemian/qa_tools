import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockContext } from '../../shared/test-utils/factories/context-factory.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../shared/prompt.js', () => ({
    ask: vi.fn(),
    askConfirm: vi.fn(),
    askFilePath: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    title: vi.fn(),
    print: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    printError: vi.fn(),
    printSummary: vi.fn(),
    withSpinner: vi.fn((_msg: string, fn: () => unknown) => fn()),
    showSelect: vi.fn(),
}));
vi.mock('../../shared/logger.js', () => ({
    rootLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn().mockReturnThis(),
    })),
}));
vi.mock('../../shared/jira-helper.js', () => ({
    safeJiraCall: vi.fn(async (c: unknown, op: string, label: string, fn: () => Promise<unknown>) => {
        try {
            await fn();
            (c as { pushHistory: (op: string, label: string, status: string) => void }).pushHistory(op, label, 'ok');
        } catch {
            (c as { pushHistory: (op: string, label: string, status: string) => void }).pushHistory(op, label, 'error');
        }
    }),
}));
vi.mock('../../shared/state.js', () => ({
    update: vi.fn(),
    load: vi.fn(() => ({ lastProject: 'TEST', lastCypressPath: '', lastJsonPath: '' })),
    loadTypedState: vi.fn(() => ({ lastProject: 'TEST', lastCsvPath: '', lastLabels: '' })),
}));
vi.mock('../../shared/open.js', () => ({
    openWithFallback: vi.fn(),
}));
vi.mock('../../shared/temp-dir.js', () => ({
    writeReport: vi.fn(() => '/tmp/report.html'),
    reportsDir: vi.fn(() => '/tmp/reports'),
}));
vi.mock('../../shared/first-run.js', () => ({
    maybeRunFirstRunWizard: vi.fn(),
}));
vi.mock('../create_tests.js', () => ({
    default: {
        createTestsFromCsv: vi.fn().mockResolvedValue({
            inMemoryTasksId: ['TEST-1', 'TEST-2'],
            inMemoryTasksText: ['Test 1', 'Test 2'],
            summary: '2 testes importados',
            status: 'ok',
        }),
    },
}));
vi.mock('../commands/test-execution-flow.js', () => ({
    offerTestExecutionAssociation: vi.fn().mockResolvedValue({ associated: false }),
    showResults: vi.fn().mockResolvedValue(undefined),
}));

describe('case01 — Import CSV', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls createTestsFromCsv with correct args', async () => {
        const { askFilePath, ask } = await import('../../shared/prompt.js');
        vi.mocked(askFilePath).mockResolvedValueOnce('/tmp/test.csv');
        vi.mocked(ask).mockResolvedValueOnce('label1,label2');
        const ctx = createMockContext();
        const { default: case01 } = await import('../commands/case01.js');
        await case01.handler(ctx);
        const createTests = (await import('../create_tests.js')).default;

        expect(vi.mocked(createTests.createTestsFromCsv)).toHaveBeenCalledWith(
            expect.objectContaining({
                csvPath: '/tmp/test.csv',
                jiraLabels: ['label1', 'label2'],
                project_name: 'TEST',
            }),
        );
    });

    it('stores results in ctx.inMemoryTasksId', async () => {
        const { askFilePath, ask } = await import('../../shared/prompt.js');
        vi.mocked(askFilePath).mockResolvedValueOnce('/tmp/test.csv');
        vi.mocked(ask).mockResolvedValueOnce('');
        const ctx = createMockContext();
        const { default: case01 } = await import('../commands/case01.js');
        await case01.handler(ctx);

        expect(ctx.ctx.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
    });

    it('pushes history on success', async () => {
        const { askFilePath, ask } = await import('../../shared/prompt.js');
        vi.mocked(askFilePath).mockResolvedValueOnce('/tmp/test.csv');
        vi.mocked(ask).mockResolvedValueOnce('');
        const ctx = createMockContext();
        const { default: case01 } = await import('../commands/case01.js');
        await case01.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('csv-import', '2 testes importados', 'ok');
    });
});

describe('case03 — Create Version', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls jiraResource.createVersion with correct args', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('v3.0.0').mockResolvedValueOnce('release notes');
        const ctx = createMockContext();
        const spy = vi.spyOn(ctx.jiraResource, 'createVersion');
        const { default: case03 } = await import('../commands/case03.js');
        await case03.handler(ctx);

        expect(spy).toHaveBeenCalledWith('TEST', 'v3.0.0', 'release notes');
    });

    it('warns if version name is empty', async () => {
        const { ask, warn } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('   ');
        const ctx = createMockContext();
        const { default: case03 } = await import('../commands/case03.js');
        await case03.handler(ctx);

        expect(vi.mocked(warn)).toHaveBeenCalledWith('Nome da versão não pode ser vazio.');
    });

    it('calls safeJiraCall wrapping createVersion', async () => {
        const { ask } = await import('../../shared/prompt.js');
        const { safeJiraCall } = await import('../../shared/jira-helper.js');
        vi.mocked(ask).mockResolvedValueOnce('v1.0').mockResolvedValueOnce('');
        const ctx = createMockContext();
        const { default: case03 } = await import('../commands/case03.js');
        await case03.handler(ctx);

        expect(safeJiraCall).toHaveBeenCalled();
    });
});

describe('case04 — Add Sprint Tasks', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses in-memory tasks when confirmed and calls updateFixVersions', async () => {
        const { askConfirm, ask } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        vi.mocked(ask).mockResolvedValue('v2.0');
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = ['TASK-1', 'TASK-2'];
        ctx.ctx.inMemoryTasksText = ['test1', 'test2'];
        ctx.ctx.withBusy = vi.fn(async (fn: () => Promise<void>) => {
            await fn();
        }) as never;
        const spy = vi.spyOn(ctx.jiraResource, 'updateFixVersions');
        const { default: case04 } = await import('../commands/case04.js');
        await case04.handler(ctx);

        expect(spy).toHaveBeenCalled();
    });

    it('prompts for manual input when no in-memory tasks', async () => {
        const { askConfirm, ask } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        vi.mocked(ask).mockResolvedValue('KEY-1 KEY-2');
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = [];
        ctx.ctx.withBusy = vi.fn(async (fn: () => Promise<void>) => {
            await fn();
        }) as never;
        const spy = vi.spyOn(ctx.jiraResource, 'updateFixVersions');
        const { default: case04 } = await import('../commands/case04.js');
        await case04.handler(ctx);

        expect(spy).toHaveBeenCalled();
    });

    it('pushes history with operation result', async () => {
        const { askConfirm, ask } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        vi.mocked(ask).mockResolvedValue('v1.0');
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = ['T-1'];
        ctx.ctx.inMemoryTasksText = ['t1'];
        const { default: case04 } = await import('../commands/case04.js');
        await case04.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith(
            'atribuir-fixversion',
            expect.any(String),
            expect.stringMatching(/^(ok|error)$/),
        );
    });

    it('returns false after processing', async () => {
        const { askConfirm, ask } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        vi.mocked(ask).mockResolvedValue('v1.0');
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = ['T-1'];
        ctx.ctx.inMemoryTasksText = ['t1'];
        const { default: case04 } = await import('../commands/case04.js');
        const result = await case04.handler(ctx);

        expect(result).toBeFalsy();
    });
});

describe('case05 — Update Package Version', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls getReleaseTasks with correct project and version', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/tmp/repo').mockResolvedValueOnce('v2.7.0');
        const ctx = createMockContext();
        ctx.ctx.createPackageManager = vi.fn().mockReturnValue({
            updateVersion: vi.fn(),
            updateReleaseNotes: vi.fn(),
        }) as never;
        const spy = vi.spyOn(ctx.jiraResource, 'getReleaseTasks');
        const { default: case05 } = await import('../commands/case05.js');
        await case05.handler(ctx);

        expect(spy).toHaveBeenCalledWith('TEST', 'v2.7.0', true);
    });

    it('calls packageManager.updateVersion and updateReleaseNotes', async () => {
        const { ask } = await import('../../shared/prompt.js');
        const mockPm = { updateVersion: vi.fn(), updateReleaseNotes: vi.fn() };
        vi.mocked(ask).mockResolvedValueOnce('/tmp/repo').mockResolvedValueOnce('v2.7.0');
        const ctx = createMockContext();
        ctx.ctx.createPackageManager = vi.fn().mockReturnValue(mockPm) as never;
        vi.spyOn(ctx.jiraResource, 'getReleaseTasks').mockResolvedValue(['[TASK-1] desc']);
        const { default: case05 } = await import('../commands/case05.js');
        await case05.handler(ctx);

        expect(mockPm.updateReleaseNotes).toHaveBeenCalled();
        expect(mockPm.updateVersion).toHaveBeenCalled();
    });

    it('pushes history on success', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/tmp/repo').mockResolvedValueOnce('v2.7.0');
        const ctx = createMockContext();
        ctx.ctx.createPackageManager = vi.fn().mockReturnValue({
            updateVersion: vi.fn(),
            updateReleaseNotes: vi.fn(),
        }) as never;
        vi.spyOn(ctx.jiraResource, 'getReleaseTasks').mockResolvedValue(['[TASK-1] desc']);
        const { default: case05 } = await import('../commands/case05.js');
        await case05.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('atualizar-package', expect.stringContaining('v'), 'ok');
    });
});

describe('case06 — Check Release Task Status', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls checkReleaseTasksStatus via safeJiraCall', async () => {
        const { ask } = await import('../../shared/prompt.js');
        const { safeJiraCall } = await import('../../shared/jira-helper.js');
        vi.mocked(ask).mockResolvedValueOnce('v2.8.0');
        const ctx = createMockContext();
        const { default: case06 } = await import('../commands/case06.js');
        await case06.handler(ctx);

        expect(safeJiraCall).toHaveBeenCalled();
    });

    it('pushes history with version name', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('v2.8.0');
        const ctx = createMockContext();
        const { default: case06 } = await import('../commands/case06.js');
        await case06.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith(
            'verificar-status',
            'v2.8.0',
            expect.stringMatching(/^(ok|error)$/),
        );
    });
});

describe('case07 — Close Tasks', () => {
    beforeEach(() => vi.clearAllMocks());

    it('fetches release tasks and calls moveCardsToDone', async () => {
        const { ask, askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v2.0');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        const getSpy = vi
            .spyOn(ctx.jiraResource, 'getReleaseTasks')
            .mockResolvedValue(['[TASK-1] desc', '[TASK-2] desc']);
        const doneSpy = vi.spyOn(ctx.jiraResource, 'moveCardsToDone');
        ctx.ctx.withBusy = vi.fn(async (fn: () => Promise<void>) => {
            await fn();
        }) as never;
        const { default: case07 } = await import('../commands/case07.js');
        await case07.handler(ctx);

        expect(getSpy).toHaveBeenCalledWith('TEST', 'v2.0');
        expect(doneSpy).toHaveBeenCalledWith(['TASK-1', 'TASK-2']);
    });

    it('warns if no tasks found', async () => {
        const { ask, askConfirm, warn } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v2.0');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        vi.spyOn(ctx.jiraResource, 'getReleaseTasks').mockResolvedValue([]);
        const doneSpy = vi.spyOn(ctx.jiraResource, 'moveCardsToDone');
        const { default: case07 } = await import('../commands/case07.js');
        await case07.handler(ctx);

        expect(vi.mocked(warn)).toHaveBeenCalled();
        expect(doneSpy).not.toHaveBeenCalled();
    });

    it('returns true when user cancels', async () => {
        const { ask, askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v2.0');
        vi.mocked(askConfirm).mockResolvedValue(false);
        const ctx = createMockContext();
        const doneSpy = vi.spyOn(ctx.jiraResource, 'moveCardsToDone');
        const { default: case07 } = await import('../commands/case07.js');
        const result = await case07.handler(ctx);

        expect(result).toBeTruthy();
        expect(doneSpy).not.toHaveBeenCalled();
    });
});

describe('case08 — Publish Version', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls releaseVersion with correct version', async () => {
        const { ask, askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v3.0');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        const spy = vi.spyOn(ctx.jiraResource, 'releaseVersion');
        const { default: case08 } = await import('../commands/case08.js');
        await case08.handler(ctx);

        expect(spy).toHaveBeenCalledWith('TEST', 'v3.0');
    });

    it('pushes history on success', async () => {
        const { ask, askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v3.0');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        const { default: case08 } = await import('../commands/case08.js');
        await case08.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('publicar-versão', 'v3.0', 'ok');
    });

    it('returns false after publishing', async () => {
        const { ask, askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValue('v3.0');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        const { default: case08 } = await import('../commands/case08.js');
        const result = await case08.handler(ctx);

        expect(result).toBeFalsy();
    });
});

describe('case09 — Change Project', () => {
    beforeEach(() => vi.clearAllMocks());

    it('updates project name in context', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('NEW_PROJECT');
        const ctx = createMockContext();
        const { default: case09 } = await import('../commands/case09.js');
        await case09.handler(ctx);

        expect(ctx.ctx.project_name).toBe('NEW_PROJECT');
    });

    it('calls updateState to persist', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('NEW_PROJECT');
        const { update } = await import('../../shared/state.js');
        const ctx = createMockContext();
        const { default: case09 } = await import('../commands/case09.js');
        await case09.handler(ctx);

        expect(vi.mocked(update)).toHaveBeenCalled();
    });

    it('pushes history', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('PROJ');
        const ctx = createMockContext();
        const { default: case09 } = await import('../commands/case09.js');
        await case09.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('trocar-projeto', 'PROJ', 'ok');
    });
});

describe('case10 — Set Git Directory', () => {
    beforeEach(() => vi.clearAllMocks());

    it('sets ctx.git_directory to provided path', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/path/to/repo');
        const ctx = createMockContext();
        const { default: case10 } = await import('../commands/case10.js');
        await case10.handler(ctx);

        expect(ctx.ctx.git_directory).toBe('/path/to/repo');
    });

    it('calls createPackageManager', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/path/to/repo');
        const ctx = createMockContext();
        ctx.ctx.createPackageManager = vi.fn().mockReturnValue({}) as never;
        const { default: case10 } = await import('../commands/case10.js');
        await case10.handler(ctx);

        expect(ctx.ctx.createPackageManager).toHaveBeenCalledWith('/path/to/repo');
    });

    it('pushes history on success', async () => {
        const { ask, success } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/path/to/repo');
        const ctx = createMockContext();
        const { default: case10 } = await import('../commands/case10.js');
        await case10.handler(ctx);

        expect(vi.mocked(success)).toHaveBeenCalledWith('Diretório alterado para: /path/to/repo');
    });
});

describe('case11 — Generate Template', () => {
    let tmpDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('copies CSV template when format is csv', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('csv').mockResolvedValueOnce(path.join(tmpDir, 'output.csv'));
        const ctx = createMockContext();
        const { default: case11 } = await import('../commands/case11.js');
        await case11.handler(ctx);

        expect(fs.existsSync(path.join(tmpDir, 'output.csv'))).toBeTruthy();
    });

    it('pushes history after generating template', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('csv').mockResolvedValueOnce(path.join(tmpDir, 'out.csv'));
        const ctx = createMockContext();
        const { default: case11 } = await import('../commands/case11.js');
        await case11.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('gerar-template', expect.any(String), 'ok');
    });
});

describe('case13 — Create Test Execution', () => {
    beforeEach(() => vi.clearAllMocks());

    it('uses inMemoryTasksId when available', async () => {
        const { askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = ['TASK-1', 'TASK-2'];
        const { default: case13 } = await import('../commands/case13.js');
        await case13.handler(ctx);
        const { offerTestExecutionAssociation } = await import('../commands/test-execution-flow.js');

        expect(vi.mocked(offerTestExecutionAssociation)).toHaveBeenCalledWith(
            ctx,
            ['TASK-1', 'TASK-2'],
            expect.any(String),
        );
    });

    it('calls offerTestExecutionAssociation', async () => {
        const { askConfirm, ask } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(false);
        vi.mocked(ask).mockResolvedValue('KEY-1 KEY-2');
        const ctx = createMockContext();
        const { default: case13 } = await import('../commands/case13.js');
        await case13.handler(ctx);
        const { offerTestExecutionAssociation } = await import('../commands/test-execution-flow.js');

        expect(vi.mocked(offerTestExecutionAssociation)).toHaveBeenCalled();
    });

    it('calls showResults', async () => {
        const { askConfirm } = await import('../../shared/prompt.js');
        vi.mocked(askConfirm).mockResolvedValue(true);
        const ctx = createMockContext();
        ctx.ctx.inMemoryTasksId = ['TASK-1'];
        const { default: case13 } = await import('../commands/case13.js');
        await case13.handler(ctx);
        const { showResults } = await import('../commands/test-execution-flow.js');

        expect(vi.mocked(showResults)).toHaveBeenCalled();
    });
});

describe('case14 — Set Cypress Directory', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pushes history with config-tests', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/tmp/cypress-results');
        const ctx = createMockContext();
        const { default: case14 } = await import('../commands/case14.js');
        await case14.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('config-tests', '/tmp/cypress-results', 'ok');
    });
});

describe('case16 — Set JSON Directory', () => {
    beforeEach(() => vi.clearAllMocks());

    it('pushes history with config-json-dir', async () => {
        const { ask } = await import('../../shared/prompt.js');
        vi.mocked(ask).mockResolvedValueOnce('/tmp/json-results');
        const ctx = createMockContext();
        const { default: case16 } = await import('../commands/case16.js');
        await case16.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('config-json-dir', '/tmp/json-results', 'ok');
    });
});

describe('case24 — Setup Wizard', () => {
    beforeEach(() => vi.clearAllMocks());

    it('calls maybeRunFirstRunWizard', async () => {
        const { maybeRunFirstRunWizard } = await import('../../shared/first-run.js');
        const ctx = createMockContext();
        const { default: case24 } = await import('../commands/case24.js');
        await case24.handler(ctx);

        expect(vi.mocked(maybeRunFirstRunWizard)).toHaveBeenCalled();
    });

    it('pushes history on success', async () => {
        const ctx = createMockContext();
        const { default: case24 } = await import('../commands/case24.js');
        await case24.handler(ctx);

        expect(ctx.pushHistory).toHaveBeenCalledWith('setup-wizard', 'wizard concluído', 'ok');
    });
});
