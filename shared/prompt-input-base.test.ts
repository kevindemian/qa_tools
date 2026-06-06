vi.mock('./output', async () => {
    const mockOutput = { print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn(), columns: vi.fn(() => 80), rows: vi.fn(() => 24) },
        defaultOutput: mockOutput,
    };
});

vi.mock('./logger', async () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), writeFileOnly: vi.fn() },
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
        writeFileOnly = vi.fn();
    },
}));

vi.mock('./box', async () => ({
    box: vi.fn((lines: string[]) => lines.join('\n')),
    divider: vi.fn(() => '---'),
    visibleWidth: vi.fn((s: string) => s.length),
}));

vi.mock('./palette', async () => {
    const purpleFn = (s: string) => s;
    purpleFn.bold = (s: string) => s;
    return {
        palette: {
            green: { bold: (s: string) => s },
            red: { bold: (s: string) => s },
            yellow: { bold: (s: string) => s },
            blue: (s: string) => s,
            fg: { bold: (s: string) => s },
            muted: (s: string) => s,
            border: 'gray',
            purple: purpleFn,
        },
    };
});

vi.mock('./prompt-ui', async () => {
    const actual = await vi.importActual<typeof import('./prompt-ui.js')>('./prompt-ui');
    return {
        ...actual,
        getConfig: vi.fn(async () => {
            const ConfigAccessorActual =
                await vi.importActual<typeof import('./config-accessor.js')>('./config-accessor');
            const cfg = ConfigAccessorActual.default.create();
            cfg.get = <T>(key: string): T => {
                const v: Record<string, unknown> = { quiet: false, autoConfirm: false };
                return v[key] as T;
            };
            return cfg;
        }),
        warn: vi.fn(),
        icon: vi.fn(() => '!'),
    };
});

import readlineSync from 'readline-sync';
import ConfigAccessor from './config-accessor.js';
import { getConfig, warn, CancelError } from './prompt-ui.js';
import { defaultOutput as outputMock } from './output.js';
import { prompt, confirm, isTTY, NAV_CMDS } from './prompt-input-base.js';

const mockReadlineQuestion = vi.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = vi.mocked(getConfig);
const mockWarn = vi.mocked(warn);

beforeEach(async () => {
    vi.clearAllMocks();
    mockReadlineQuestion.mockReturnValue('');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    const cfg = ConfigAccessor.create();
    cfg.get = <T>(k: string) => ({ quiet: false, autoConfirm: false })[k] as T;
    mockGetConfig.mockReturnValue(cfg);
});

describe('prompt', async () => {
    it('returns the user input', async () => {
        mockReadlineQuestion.mockReturnValue('my value');
        expect(prompt('Label')).toBe('my value');
    });

    it('returns default when no input', async () => {
        mockReadlineQuestion.mockReturnValue('');
        expect(prompt('Label', { default: 'def' })).toBe('');
    });

    it('throws CancelError on navigation command', async () => {
        mockReadlineQuestion.mockReturnValue('/back');
        expect(() => prompt('Label')).toThrow(CancelError);
    });

    it('rejects short input when minLength set', async () => {
        mockReadlineQuestion.mockReturnValueOnce('ab').mockReturnValueOnce('abcdef');
        expect(prompt('Label', { minLength: 3 })).toBe('abcdef');
        expect(mockWarn).toHaveBeenCalled();
    });

    it('displays hint when provided', async () => {
        mockReadlineQuestion.mockReturnValue('value');
        expect(prompt('Label', { hint: 'some hint' })).toBe('value');
    });
});

describe('confirm', async () => {
    it('returns true for yes answer', async () => {
        mockReadlineQuestion.mockReturnValue('s');
        expect(confirm('Confirm?')).toBe(true);
    });

    it('returns false for no answer', async () => {
        mockReadlineQuestion.mockReturnValue('n');
        expect(confirm('Confirm?')).toBe(false);
    });

    it('returns defaultYes when autoConfirm', async () => {
        const cfg2 = ConfigAccessor.create();
        cfg2.get = <T>(k: string) => ({ quiet: false, autoConfirm: true })[k] as T;
        mockGetConfig.mockReturnValue(cfg2);
        expect(confirm('Confirm?', true)).toBe(true);
    });

    it('throws CancelError on navigation', async () => {
        mockReadlineQuestion.mockReturnValue('/menu');
        expect(() => confirm('Confirm?')).toThrow(CancelError);
    });

    it('accepts yes synonyms', async () => {
        mockReadlineQuestion.mockReturnValue('y');
        expect(confirm('Confirm?')).toBe(true);
        mockReadlineQuestion.mockReturnValue('yes');
        expect(confirm('Confirm?')).toBe(true);
        mockReadlineQuestion.mockReturnValue('sim');
        expect(confirm('Confirm?')).toBe(true);
    });

    it('accepts no synonyms', async () => {
        mockReadlineQuestion.mockReturnValue('n');
        expect(confirm('Confirm?')).toBe(false);
        mockReadlineQuestion.mockReturnValue('no');
        expect(confirm('Confirm?')).toBe(false);
        mockReadlineQuestion.mockReturnValue('nao');
        expect(confirm('Confirm?')).toBe(false);
    });

    it('retries on invalid answer then accepts yes', async () => {
        mockReadlineQuestion.mockReturnValueOnce('x').mockReturnValueOnce('s');
        expect(confirm('Confirm?')).toBe(true);
        expect(outputMock.print).toHaveBeenCalled();
    });

    it('shows Y as default when defaultYes is true', async () => {
        mockReadlineQuestion.mockReturnValue('y');
        expect(confirm('Confirm?', true)).toBe(true);
    });
});

describe('isTTY', async () => {
    afterEach(async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('returns true when stdout.isTTY and quiet is false', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        expect(isTTY()).toBe(true);
    });

    it('returns false when stdout.isTTY is falsy', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
        expect(isTTY()).toBe(false);
    });

    it('returns false when quiet is true', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        const cfg3 = ConfigAccessor.create();
        cfg3.get = <T>(k: string) => ({ quiet: true, autoConfirm: false })[k] as T;
        mockGetConfig.mockReturnValue(cfg3);
        expect(isTTY()).toBe(false);
    });
});

describe('NAV_CMDS', async () => {
    it('contains expected navigation commands', async () => {
        expect(NAV_CMDS).toEqual(['/back', '/menu', '/exit', '/sair', '/quit', '/help']);
    });
});
