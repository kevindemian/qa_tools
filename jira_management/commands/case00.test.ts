jest.mock('../../shared/prompt', () => ({
    info: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    printError: jest.fn(),
}));

jest.mock('../../shared/logger', () => ({
    rootLogger: {
        error: jest.fn(),
        child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
    },
}));

jest.mock('../../setup/main', () => {
    const mainFn = jest.fn().mockResolvedValue(undefined);
    return { default: { main: mainFn } };
});

import { info, title, printError } from '../../shared/prompt';

const mockSetupMain = jest.requireMock('../../setup/main');

function makeContext(overrides?: Record<string, unknown>) {
    return {
        jiraResource: {},
        jiraResourceXray: {},
        linkManager: {},
        linkManagerXray: {},
        csvResource: {},
        ctx: {
            project_name: 'TEST',
            inMemoryTasksId: [],
            inMemoryTasksText: [],
            sessionCounters: [],
            isBusy: false,
            results: [],
        },
        pushHistory: jest.fn(),
        printSessionSummary: jest.fn(),
        base_url: 'https://jira.test.com',
        sessionLog: { child: jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn() }) },
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('case00 — Init Wizard', () => {
    it('calls setup main and records history on success', async () => {
        mockSetupMain.default.main.mockResolvedValue(undefined);

        const mod = require('./case00').default;
        const context = makeContext();
        await mod.handler(context);
        expect(title).toHaveBeenCalledWith('Setup Wizard');
        expect(info).toHaveBeenCalledWith('Iniciando wizard de configuração de CI/CD...');
        expect(mockSetupMain.default.main).toHaveBeenCalled();
        expect(context.pushHistory).toHaveBeenCalledWith('setup-wizard', 'wizard concluído', 'ok');
    });

    it('handles setup failure gracefully', async () => {
        mockSetupMain.default.main.mockRejectedValue(new Error('Setup error'));

        const mod = require('./case00').default;
        const context = makeContext();
        const result = await mod.handler(context);
        expect(result).toBe(false);
        expect(printError).toHaveBeenCalledWith('Erro ao executar setup wizard', expect.any(Error));
    });
});
