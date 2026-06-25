vi.mock('../shared/prompt');
vi.mock('../shared/logger');
vi.mock('./session-state', () => ({
    pushHistory: vi.fn(),
}));

vi.mock('../setup/main', () => {
    const mainFn = vi.fn().mockResolvedValue(undefined);
    return { main: mainFn };
});

import { title, info, divider, printError } from '../shared/prompt.js';
import type { Mocked } from 'vitest';
import { pushHistory } from './session-state.js';
import { handleSetupWizard } from './case00-handler.js';

let mockSetupModule: Mocked<typeof import('../setup/main.js')>;

describe('Case00 Handler', () => {
    beforeAll(async () => {
        mockSetupModule = await vi.importMock<typeof import('../setup/main.js')>('../setup/main');
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('HandleSetupWizard', () => {
        it('calls setup main and records history on success', async () => {expect.hasAssertions();

            mockSetupModule.main.mockResolvedValue(undefined);

            const result = await handleSetupWizard();

            expect(title).toHaveBeenCalledWith('Setup Wizard');
            expect(info).toHaveBeenCalledWith('Iniciando wizard de configuração de CI/CD...');
            expect(divider).toHaveBeenCalledWith();
            expect(mockSetupModule.main).toHaveBeenCalledWith();
            expect(pushHistory).toHaveBeenCalledWith('setup-wizard', 'wizard concluído', 'ok');
            expect(result).toBeFalsy();
        });

        it('handles setup failure gracefully', async () => {expect.hasAssertions();

            mockSetupModule.main.mockRejectedValue(new Error('Setup error'));

            const result = await handleSetupWizard();

            expect(result).toBeFalsy();
            expect(printError).toHaveBeenCalledWith('Erro ao executar setup wizard', expect.any(Error));
            expect(pushHistory).not.toHaveBeenCalled();
        });
    });

});
