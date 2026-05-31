const mockShowSelect = jest.fn().mockResolvedValue('skip');
const mockTitle = jest.fn();
const mockInfo = jest.fn();
const mockDivider = jest.fn();
const mockWarn = jest.fn();
const mockLoadTypedState = jest.fn();
const mockUpdateState = jest.fn();

jest.mock('./prompt', () => ({
    title: mockTitle,
    info: mockInfo,
    divider: mockDivider,
    warn: mockWarn,
    showSelect: mockShowSelect,
}));

jest.mock('./state', () => ({
    loadTypedState: mockLoadTypedState,
    update: mockUpdateState,
}));

const OLD_ENV = { ...process.env };
const OLD_ARGV = [...process.argv];

function loadModule() {
    return require('./first-run') as typeof import('./first-run');
}

beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    process.argv = [...OLD_ARGV];
    delete process.env.CI;
    delete process.env.AUTO_CONFIRM;
    delete process.env.SKIP_FIRST_RUN;
});

afterEach(() => {
    process.env = { ...OLD_ENV };
    process.argv = [...OLD_ARGV];
});

describe('isFirstRun', () => {
    it('returns false when CI=true', async () => {
        process.env.CI = 'true';
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when AUTO_CONFIRM=true', async () => {
        process.env.AUTO_CONFIRM = 'true';
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when SKIP_FIRST_RUN=true', async () => {
        process.env.SKIP_FIRST_RUN = 'true';
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when --batch is in argv', async () => {
        process.argv.push('--batch');
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when --auto is in argv', async () => {
        process.argv.push('--auto');
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when firstRunDone flag exists in state', async () => {
        mockLoadTypedState.mockReturnValue({ _firstRunDone: true });
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns false when state has history', async () => {
        mockLoadTypedState.mockReturnValue({ history: [{ ts: '1', op: 'test', detail: '', status: 'ok' }] });
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(false);
    });

    it('returns true for fresh state with no flags', async () => {
        mockLoadTypedState.mockReturnValue({});
        const { isFirstRun } = loadModule();
        expect(isFirstRun()).toBe(true);
    });
});

describe('_markFirstRunDone', () => {
    it('calls updateState with callback that sets _firstRunDone', async () => {
        const { _markFirstRunDone } = loadModule();
        _markFirstRunDone();
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
        const cb = mockUpdateState.mock.calls[0]?.[0] as unknown as (s: Record<string, unknown>) => void;
        expect(typeof cb).toBe('function');
        const state: Record<string, unknown> = {};
        cb(state);
        expect(state._firstRunDone).toBe(true);
    });
});

describe('maybeRunFirstRunWizard', () => {
    it('returns immediately when not first run', async () => {
        mockLoadTypedState.mockReturnValue({ _firstRunDone: true });
        const { maybeRunFirstRunWizard: f } = loadModule();
        await f();
        expect(mockTitle).not.toHaveBeenCalled();
        expect(mockShowSelect).not.toHaveBeenCalled();
    });

    it('shows welcome and skips when user picks skip', async () => {
        mockLoadTypedState.mockReturnValue({});
        mockShowSelect.mockResolvedValue('skip');
        const { maybeRunFirstRunWizard: f } = loadModule();
        await f();
        expect(mockTitle).toHaveBeenCalledWith(expect.stringContaining('Bem-vindo'));
        expect(mockInfo).toHaveBeenCalled();
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
    });

    it('tries to launch setup when user picks setup', async () => {
        mockLoadTypedState.mockReturnValue({});
        mockShowSelect.mockResolvedValue('setup');
        const { maybeRunFirstRunWizard: f } = loadModule();
        await expect(f()).resolves.not.toThrow();
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
    });

    it('tries to open docs when user picks docs', async () => {
        mockLoadTypedState.mockReturnValue({});
        mockShowSelect.mockResolvedValue('docs');
        const { maybeRunFirstRunWizard: f } = loadModule();
        await expect(f()).resolves.not.toThrow();
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
    });

    it('does not crash when setup module fails to load', async () => {
        mockLoadTypedState.mockReturnValue({});
        mockShowSelect.mockResolvedValue('setup');
        const { maybeRunFirstRunWizard: f } = loadModule();
        await expect(f()).resolves.not.toThrow();
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Não foi possível iniciar'));
        expect(mockUpdateState).toHaveBeenCalledTimes(1);
    });
});
