import { confirmOrCancel } from './import-prep-preview.js';

const mockConfirm = vi.fn<(...args: [message: string, defaultValue?: boolean]) => boolean>();
const mockConfigGet = vi.fn<(...args: [key: string, defaultValue?: boolean]) => boolean>();

vi.mock('../shared/prompt', async () => ({
    confirm: (...args: [message: string, defaultValue?: boolean]) => mockConfirm(...args),
    prompt: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    print: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    smartPrompt: vi.fn(),
    printSummary: vi.fn(),
    isQuiet: vi.fn().mockReturnValue(true),
    success: vi.fn(),
}));

vi.mock('../shared/config', async () => ({
    default: { get: (...args: [key: string, defaultValue?: boolean]) => mockConfigGet(...args) },
}));

vi.mock('../shared/markdown', async () => ({
    md: vi.fn((s: string) => s),
    mdToHtml: vi.fn((s: string) => '<html>' + s + '</html>'),
}));

vi.mock('../shared/temp-dir', async () => ({
    writeEphemeral: vi.fn((_dir: string, _name: string, _content: string) => '/tmp/' + _name),
}));

vi.mock('../shared/open', async () => ({
    openWithOsOrFallback: vi.fn(),
}));

vi.mock('../shared/state', async () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

vi.mock('../shared/logger', async () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return { ...actual, writeFileSync: vi.fn() };
});

describe('confirmOrCancel', async () => {
    beforeEach(async () => {
        vi.clearAllMocks();
    });

    it('returns true when autoConfirm is set', async () => {
        mockConfigGet.mockReturnValue(true);
        const result = confirmOrCancel();
        expect(result).toBe(true);
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('prompts user when autoConfirm is false and user confirms', async () => {
        mockConfigGet.mockReturnValue(false);
        mockConfirm.mockReturnValue(true);
        const result = confirmOrCancel();
        expect(result).toBe(true);
        expect(mockConfirm).toHaveBeenCalledWith('Criar estes testes no Jira?');
    });

    it('prompts user when autoConfirm is false and user declines', async () => {
        mockConfigGet.mockReturnValue(false);
        mockConfirm.mockReturnValue(false);
        const result = confirmOrCancel();
        expect(result).toBe(false);
    });
});
