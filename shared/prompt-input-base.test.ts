jest.mock('./output', () => {
    const mockOutput = { print: jest.fn() };
    return {
        Output: { isTTY: jest.fn(), isCI: jest.fn(), columns: jest.fn(() => 80), rows: jest.fn(() => 24) },
        defaultOutput: mockOutput,
    };
});

jest.mock('./logger', () => ({
    rootLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), writeFileOnly: jest.fn() },
    Logger: class {
        info = jest.fn();
        error = jest.fn();
        warn = jest.fn();
        debug = jest.fn();
        writeFileOnly = jest.fn();
    },
}));

jest.mock('./box', () => ({
    box: jest.fn((lines: string[]) => lines.join('\n')),
    divider: jest.fn(() => '---'),
    visibleWidth: jest.fn((s: string) => s.length),
}));

jest.mock('./palette', () => {
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

jest.mock('./prompt-ui', () => {
    const actual = jest.requireActual<typeof import('./prompt-ui')>('./prompt-ui');
    return {
        ...actual,
        getConfig: jest.fn(() => {
            const ConfigAccessorActual = jest.requireActual<typeof import('./config-accessor')>('./config-accessor');
            const cfg = ConfigAccessorActual.default.create();
            cfg.get = <T>(key: string): T => {
                const v: Record<string, unknown> = { quiet: false, autoConfirm: false };
                return v[key] as T;
            };
            return cfg;
        }),
        warn: jest.fn(),
        icon: jest.fn(() => '!'),
    };
});

import readlineSync from 'readline-sync';
import ConfigAccessor from './config-accessor';
import { getConfig, warn, CancelError } from './prompt-ui';
import { defaultOutput as outputMock } from './output';
import { prompt, confirm, isTTY, NAV_CMDS } from './prompt-input-base';

const mockReadlineQuestion = jest.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = jest.mocked(getConfig);
const mockWarn = jest.mocked(warn);

beforeEach(() => {
    jest.clearAllMocks();
    mockReadlineQuestion.mockReturnValue('');
    const cfg = ConfigAccessor.create();
    cfg.get = <T>(k: string) => ({ quiet: false, autoConfirm: false })[k] as T;
    mockGetConfig.mockReturnValue(cfg);
});

describe('prompt', () => {
    it('returns the user input', () => {
        mockReadlineQuestion.mockReturnValue('my value');
        expect(prompt('Label')).toBe('my value');
    });

    it('returns default when no input', () => {
        mockReadlineQuestion.mockReturnValue('');
        expect(prompt('Label', { default: 'def' })).toBe('');
    });

    it('throws CancelError on navigation command', () => {
        mockReadlineQuestion.mockReturnValue('/back');
        expect(() => prompt('Label')).toThrow(CancelError);
    });

    it('rejects short input when minLength set', () => {
        mockReadlineQuestion.mockReturnValueOnce('ab').mockReturnValueOnce('abcdef');
        expect(prompt('Label', { minLength: 3 })).toBe('abcdef');
        expect(mockWarn).toHaveBeenCalled();
    });

    it('displays hint when provided', () => {
        mockReadlineQuestion.mockReturnValue('value');
        expect(prompt('Label', { hint: 'some hint' })).toBe('value');
    });
});

describe('confirm', () => {
    it('returns true for yes answer', () => {
        mockReadlineQuestion.mockReturnValue('s');
        expect(confirm('Confirm?')).toBe(true);
    });

    it('returns false for no answer', () => {
        mockReadlineQuestion.mockReturnValue('n');
        expect(confirm('Confirm?')).toBe(false);
    });

    it('returns defaultYes when autoConfirm', () => {
        const cfg2 = ConfigAccessor.create();
        cfg2.get = <T>(k: string) => ({ quiet: false, autoConfirm: true })[k] as T;
        mockGetConfig.mockReturnValue(cfg2);
        expect(confirm('Confirm?', true)).toBe(true);
    });

    it('throws CancelError on navigation', () => {
        mockReadlineQuestion.mockReturnValue('/menu');
        expect(() => confirm('Confirm?')).toThrow(CancelError);
    });

    it('accepts yes synonyms', () => {
        mockReadlineQuestion.mockReturnValue('y');
        expect(confirm('Confirm?')).toBe(true);
        mockReadlineQuestion.mockReturnValue('yes');
        expect(confirm('Confirm?')).toBe(true);
        mockReadlineQuestion.mockReturnValue('sim');
        expect(confirm('Confirm?')).toBe(true);
    });

    it('accepts no synonyms', () => {
        mockReadlineQuestion.mockReturnValue('n');
        expect(confirm('Confirm?')).toBe(false);
        mockReadlineQuestion.mockReturnValue('no');
        expect(confirm('Confirm?')).toBe(false);
        mockReadlineQuestion.mockReturnValue('nao');
        expect(confirm('Confirm?')).toBe(false);
    });

    it('retries on invalid answer then accepts yes', () => {
        mockReadlineQuestion.mockReturnValueOnce('x').mockReturnValueOnce('s');
        expect(confirm('Confirm?')).toBe(true);
        expect(outputMock.print).toHaveBeenCalled();
    });

    it('shows Y as default when defaultYes is true', () => {
        mockReadlineQuestion.mockReturnValue('y');
        expect(confirm('Confirm?', true)).toBe(true);
    });
});

describe('isTTY', () => {
    afterEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('returns true when stdout.isTTY and quiet is false', () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        expect(isTTY()).toBe(true);
    });

    it('returns false when stdout.isTTY is falsy', () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
        expect(isTTY()).toBe(false);
    });

    it('returns false when quiet is true', () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        const cfg3 = ConfigAccessor.create();
        cfg3.get = <T>(k: string) => ({ quiet: true, autoConfirm: false })[k] as T;
        mockGetConfig.mockReturnValue(cfg3);
        expect(isTTY()).toBe(false);
    });
});

describe('NAV_CMDS', () => {
    it('contains expected navigation commands', () => {
        expect(NAV_CMDS).toEqual(['/back', '/menu', '/exit', '/sair', '/quit', '/help']);
    });
});
