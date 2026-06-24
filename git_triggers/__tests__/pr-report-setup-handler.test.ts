import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    mockGetPrReportConfig: vi.fn(),
    mockSetPrReportConfig: vi.fn(),
    mockPromptConfirm: vi.fn(),
    mockAsk: vi.fn(),
    mockInfo: vi.fn(),
    mockSuccess: vi.fn(),
    mockWarn: vi.fn(),
    mockTitle: vi.fn(),
    mockDivider: vi.fn(),
    mockPushHistory: vi.fn(),
    mockCurrentProjectName: 'test-project',
    mockExistsSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockGenerateYaml: vi.fn(() => 'name: QA Post-Process\n'),
    mockInjectJob: vi.fn((content: string) => content + '\n  post-process: injected\n'),
}));

vi.mock('../../shared/feature-config.js', () => ({
    getPrReportConfig: mocks.mockGetPrReportConfig,
    setPrReportConfig: mocks.mockSetPrReportConfig,
}));

vi.mock('../../shared/prompt.js', () => ({
    confirm: mocks.mockPromptConfirm,
    prompt: mocks.mockAsk,
    info: mocks.mockInfo,
    success: mocks.mockSuccess,
    warn: mocks.mockWarn,
    title: mocks.mockTitle,
    divider: mocks.mockDivider,
}));

vi.mock('../session-state.js', () => ({
    pushHistory: mocks.mockPushHistory,
    get currentProjectName() {
        return mocks.mockCurrentProjectName;
    },
}));

vi.mock('node:fs', () => ({
    default: {
        existsSync: mocks.mockExistsSync,
        readFileSync: mocks.mockReadFileSync,
        writeFileSync: mocks.mockWriteFileSync,
        mkdirSync: mocks.mockMkdirSync,
    },
    existsSync: mocks.mockExistsSync,
    readFileSync: mocks.mockReadFileSync,
    writeFileSync: mocks.mockWriteFileSync,
    mkdirSync: mocks.mockMkdirSync,
}));

vi.mock('../../shared/ci-injector.js', () => ({
    generatePostProcessWorkflowYaml: mocks.mockGenerateYaml,
    injectPostProcessJob: mocks.mockInjectJob,
}));

import { handlePrReportReconfig } from '../pr-report-setup-handler.js';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockCurrentProjectName = 'test-project';
});

describe('HandlePrReportReconfig', () => {
    it('shows warning when no project is selected', () => {
        mocks.mockCurrentProjectName = '';

        handlePrReportReconfig();

        expect(mocks.mockInfo).toHaveBeenCalledWith('Nenhum projeto selecionado. Use "Trocar de projeto" primeiro.');
        expect(mocks.mockSetPrReportConfig).not.toHaveBeenCalled();
    });

    it('displays current configuration', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });

        handlePrReportReconfig();

        expect(mocks.mockTitle).toHaveBeenCalledWith('Configuração do PR Report');
        expect(mocks.mockInfo).toHaveBeenCalledWith('  Habilitado: Não');
        expect(mocks.mockInfo).toHaveBeenCalledWith('  Target:     github-actions');
        expect(mocks.mockDivider).toHaveBeenCalledWith();
    });

    it('disables PR Report when user declines — no CI files generated', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm.mockReturnValueOnce(false);

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: false,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        expect(mocks.mockSuccess).toHaveBeenCalledWith('Configuração do PR Report salva em config/features.json.');
        expect(mocks.mockPushHistory).toHaveBeenCalledWith(
            'pr-report-reconfig',
            'PR Report: desativado, target: github-actions',
            'ok',
        );
        // Must NOT call CI file generation when disabled
        expect(mocks.mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('enables PR Report with gitlab-ci target — no CI files generated', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mocks.mockAsk.mockReturnValue('gitlab-ci');

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'gitlab-ci',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        // Must NOT call CI file generation for gitlab-ci
        expect(mocks.mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('enables PR Report with github-actions + ci.yml exists — generates files and injects', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mocks.mockAsk.mockReturnValue('github-actions');
        mocks.mockExistsSync.mockReturnValue(true);
        mocks.mockReadFileSync.mockReturnValue('name: CI\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n');

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        // CI file generation: workflow + injection
        expect(mocks.mockWriteFileSync).toHaveBeenCalledTimes(2);
        expect(mocks.mockSuccess).toHaveBeenCalledWith('Workflow gerado: .github/workflows/qa-post-process.yml');
        expect(mocks.mockSuccess).toHaveBeenCalledWith(
            'Job post-process injetado em ci.yml (conteúdo existente preservado).',
        );
    });

    it('enables with github-actions but ci.yml missing — warns user', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mocks.mockAsk.mockReturnValue('github-actions');
        mocks.mockExistsSync.mockReturnValue(false);

        handlePrReportReconfig();

        // Workflow file still generated
        expect(mocks.mockWriteFileSync).toHaveBeenCalledTimes(1);
        expect(mocks.mockWarn).toHaveBeenCalledWith(
            'ci.yml não encontrado em .github/workflows/. Execute o Setup Wizard completo ou crie o workflow manualmente.',
        );
    });

    it('enables with all sub-features skipped and github-actions — generates files', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true);
        mocks.mockAsk.mockReturnValue('github-actions');
        mocks.mockExistsSync.mockReturnValue(true);
        mocks.mockReadFileSync.mockReturnValue('name: CI\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n');

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: true,
            skipFlaky: true,
        });
        expect(mocks.mockWriteFileSync).toHaveBeenCalledTimes(2);
    });

    it('validates publish target: invalid input falls back to github-actions', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'gitlab-ci',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mocks.mockAsk.mockReturnValue('invalid-target');

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
    });

    it('preserves current config when sub-feature prompts not asked (disabled)', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: false,
            skipFlaky: true,
        });
        mocks.mockPromptConfirm.mockReturnValueOnce(false);

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: false,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: false,
            skipFlaky: true,
        });
    });

    it('uses defaults for sub-features when current config is undefined', () => {
        mocks.mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
        });
        mocks.mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mocks.mockAsk.mockReturnValue('github-actions');

        handlePrReportReconfig();

        expect(mocks.mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
    });
});
