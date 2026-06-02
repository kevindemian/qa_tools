import { confirmOrCancel } from './import-prep-preview';

const mockConfirm = jest.fn<boolean, [message: string, defaultValue?: boolean]>();
const mockConfigGet = jest.fn<boolean, [key: string, defaultValue?: boolean]>();

jest.mock('../shared/prompt', () => ({
    confirm: (...args: [message: string, defaultValue?: boolean]) => mockConfirm(...args),
    prompt: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    print: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    smartPrompt: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    success: jest.fn(),
}));

jest.mock('../shared/config', () => ({
    get: (...args: [key: string, defaultValue?: boolean]) => mockConfigGet(...args),
}));

jest.mock('../shared/markdown', () => ({
    md: jest.fn((s: string) => s),
    mdToHtml: jest.fn((s: string) => '<html>' + s + '</html>'),
}));

jest.mock('../shared/temp-dir', () => ({
    writeEphemeral: jest.fn((_dir: string, _name: string, _content: string) => '/tmp/' + _name),
}));

jest.mock('../shared/open', () => ({
    openWithOsOrFallback: jest.fn(),
}));

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    },
}));

jest.mock('fs', () => {
    const actual = jest.requireActual<typeof import('fs')>('fs');
    return { ...actual, writeFileSync: jest.fn() };
});

describe('confirmOrCancel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns true when autoConfirm is set', () => {
        mockConfigGet.mockReturnValue(true);
        const result = confirmOrCancel();
        expect(result).toBe(true);
        expect(mockConfirm).not.toHaveBeenCalled();
    });

    it('prompts user when autoConfirm is false and user confirms', () => {
        mockConfigGet.mockReturnValue(false);
        mockConfirm.mockReturnValue(true);
        const result = confirmOrCancel();
        expect(result).toBe(true);
        expect(mockConfirm).toHaveBeenCalledWith('Criar estes testes no Jira?');
    });

    it('prompts user when autoConfirm is false and user declines', () => {
        mockConfigGet.mockReturnValue(false);
        mockConfirm.mockReturnValue(false);
        const result = confirmOrCancel();
        expect(result).toBe(false);
    });
});
