jest.mock('../shared/prompt');
jest.mock('../shared/logger');
jest.mock('./session-state', () => ({
    pushHistory: jest.fn(),
}));

jest.mock('../setup/main', () => {
    const mainFn = jest.fn().mockResolvedValue(undefined);
    return { main: mainFn };
});

import { title, info, divider, printError } from '../shared/prompt';
import { pushHistory } from './session-state';

const mockSetupModule = jest.requireMock('../setup/main');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('handleSetupWizard', () => {
    it('calls setup main and records history on success', async () => {
        mockSetupModule.main.mockResolvedValue(undefined);

        const { handleSetupWizard } = require('./case00-handler');
        const result = await handleSetupWizard();

        expect(title).toHaveBeenCalledWith('Setup Wizard');
        expect(info).toHaveBeenCalledWith('Iniciando wizard de configuração de CI/CD...');
        expect(divider).toHaveBeenCalled();
        expect(mockSetupModule.main).toHaveBeenCalled();
        expect(pushHistory).toHaveBeenCalledWith('setup-wizard', 'wizard concluído', 'ok');
        expect(result).toBe(false);
    });

    it('handles setup failure gracefully', async () => {
        mockSetupModule.main.mockRejectedValue(new Error('Setup error'));

        const { handleSetupWizard } = require('./case00-handler');
        const result = await handleSetupWizard();

        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Erro ao executar setup wizard', expect.any(Error));
        expect(pushHistory).not.toHaveBeenCalled();
    });
});
