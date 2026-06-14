import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handlePrReportReconfig } from '../pr-report-setup-handler.js';

const mockGetPrReportConfig = vi.fn();
const mockSetPrReportConfig = vi.fn();
const mockPromptConfirm = vi.fn();
const mockAsk = vi.fn();
const mockInfo = vi.fn();
const mockSuccess = vi.fn();
const mockTitle = vi.fn();
const mockDivider = vi.fn();
const mockPushHistory = vi.fn();

let mockCurrentProjectName = 'test-project';

vi.mock('../../shared/feature-config.js', () => ({
    getPrReportConfig: mockGetPrReportConfig,
    setPrReportConfig: mockSetPrReportConfig,
}));

vi.mock('../../shared/prompt.js', () => ({
    confirm: mockPromptConfirm,
    prompt: mockAsk,
    info: mockInfo,
    success: mockSuccess,
    title: mockTitle,
    divider: mockDivider,
}));

vi.mock('../session-state.js', () => ({
    pushHistory: mockPushHistory,
    get currentProjectName() {
        return mockCurrentProjectName;
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentProjectName = 'test-project';
});

describe('handlePrReportReconfig', () => {
    it('shows warning when no project is selected', () => {
        mockCurrentProjectName = '';

        handlePrReportReconfig();

        expect(mockInfo).toHaveBeenCalledWith('Nenhum projeto selecionado. Use "Trocar de projeto" primeiro.');
        expect(mockSetPrReportConfig).not.toHaveBeenCalled();
    });

    it('displays current configuration', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });

        handlePrReportReconfig();

        expect(mockTitle).toHaveBeenCalledWith('Configuração do PR Report');
        expect(mockInfo).toHaveBeenCalledWith('  Habilitado: Não');
        expect(mockInfo).toHaveBeenCalledWith('  Target:     github-actions');
        expect(mockDivider).toHaveBeenCalled();
    });

    it('disables PR Report when user declines', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
        });
        mockPromptConfirm.mockReturnValueOnce(false);

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: false,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
        expect(mockSuccess).toHaveBeenCalledWith('Configuração do PR Report salva em config/features.json.');
        expect(mockPushHistory).toHaveBeenCalledWith(
            'pr-report-reconfig',
            'PR Report: desativado, target: github-actions',
            'ok',
        );
    });

    it('enables PR Report and asks for target and sub-features', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mockAsk.mockReturnValue('gitlab-ci');

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'gitlab-ci',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
    });

    it('enables PR Report with all sub-features skipped', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: false,
            publishTarget: 'github-actions',
        });
        mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true);
        mockAsk.mockReturnValue('github-actions');

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: true,
            skipFlaky: true,
        });
    });

    it('validates publish target: invalid input falls back to github-actions', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'gitlab-ci',
        });
        mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mockAsk.mockReturnValue('invalid-target');

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
    });

    it('preserves current config when sub-feature prompts not asked (disabled)', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: false,
            skipFlaky: true,
        });
        mockPromptConfirm.mockReturnValueOnce(false);

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: false,
            publishTarget: 'github-actions',
            skipAi: true,
            skipQuality: false,
            skipFlaky: true,
        });
    });

    it('uses defaults for sub-features when current config is undefined', () => {
        mockGetPrReportConfig.mockReturnValue({
            enabled: true,
            publishTarget: 'github-actions',
        });
        mockPromptConfirm
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false)
            .mockReturnValueOnce(false);
        mockAsk.mockReturnValue('github-actions');

        handlePrReportReconfig();

        expect(mockSetPrReportConfig).toHaveBeenCalledWith('test-project', {
            enabled: true,
            publishTarget: 'github-actions',
            skipAi: false,
            skipQuality: false,
            skipFlaky: false,
        });
    });
});
