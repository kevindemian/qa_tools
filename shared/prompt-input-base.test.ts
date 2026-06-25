vi.mock('./output', () => {
    const mockOutput = { print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn(), columns: vi.fn(() => 80), rows: vi.fn(() => 24) },
        defaultOutput: mockOutput,
    };
});

vi.mock('./logger', () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), writeFileOnly: vi.fn() },
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
        writeFileOnly = vi.fn();
    },
}));

vi.mock('./box', () => ({
    box: vi.fn((lines: string[]) => lines.join('\n')),
    divider: vi.fn(() => '---'),
    visibleWidth: vi.fn((s: string) => s.length),
}));

vi.mock('./palette', () => {
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

describe('Prompt Input Base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReadlineQuestion.mockReturnValue('');
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        const cfg = ConfigAccessor.create();
        cfg.get = <T>(k: string) => ({ quiet: false, autoConfirm: false })[k] as T;
        mockGetConfig.mockReturnValue(cfg);
    });

    describe('Prompt', () => {
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
            expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('caractere'));
        });

        it('displays hint when provided', () => {
            mockReadlineQuestion.mockReturnValue('value');

            expect(prompt('Label', { hint: 'some hint' })).toBe('value');
        });

        it('returns default when readlineSync throws (e.g. no /dev/tty)', () => {
            mockReadlineQuestion.mockImplementation(() => {
                throw new Error("The current environment doesn't support interactive reading from TTY.");
            });

            expect(prompt('Label', { default: 'fallback' })).toBe('fallback');
        });

        it('returns empty default when readlineSync throws and no default set', () => {
            mockReadlineQuestion.mockImplementation(() => {
                throw new Error('TTY unavailable');
            });

            expect(prompt('Label')).toBe('');
        });

        it('returns default when stdin.isTTY is false', () => {
            Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

            expect(prompt('Label', { default: 'tty-false' })).toBe('tty-false');
        });
    });

    describe('Confirm', () => {
        it('returns true for yes answer', () => {
            mockReadlineQuestion.mockReturnValue('s');

            expect(confirm('Confirm?')).toBeTruthy();
        });

        it('returns false for no answer', () => {
            mockReadlineQuestion.mockReturnValue('n');

            expect(confirm('Confirm?')).toBeFalsy();
        });

        it('returns defaultYes when autoConfirm', () => {
            const cfg2 = ConfigAccessor.create();
            cfg2.get = <T>(k: string) => ({ quiet: false, autoConfirm: true })[k] as T;
            mockGetConfig.mockReturnValue(cfg2);

            expect(confirm('Confirm?', true)).toBeTruthy();
        });

        it('throws CancelError on navigation', () => {
            mockReadlineQuestion.mockReturnValue('/menu');

            expect(() => confirm('Confirm?')).toThrow(CancelError);
        });

        it('accepts yes synonyms', () => {
            mockReadlineQuestion.mockReturnValue('y');

            expect(confirm('Confirm?')).toBeTruthy();

            mockReadlineQuestion.mockReturnValue('yes');

            expect(confirm('Confirm?')).toBeTruthy();

            mockReadlineQuestion.mockReturnValue('sim');

            expect(confirm('Confirm?')).toBeTruthy();
        });

        it('accepts no synonyms', () => {
            mockReadlineQuestion.mockReturnValue('n');

            expect(confirm('Confirm?')).toBeFalsy();

            mockReadlineQuestion.mockReturnValue('no');

            expect(confirm('Confirm?')).toBeFalsy();

            mockReadlineQuestion.mockReturnValue('nao');

            expect(confirm('Confirm?')).toBeFalsy();
        });

        it('retries on invalid answer then accepts yes', () => {
            mockReadlineQuestion.mockReturnValueOnce('x').mockReturnValueOnce('s');

            expect(confirm('Confirm?')).toBeTruthy();
            expect(outputMock['print']).toHaveBeenCalledWith(expect.stringContaining('Resposta inválida'));
        });

        it('shows Y as default when defaultYes is true', () => {
            mockReadlineQuestion.mockReturnValue('y');

            expect(confirm('Confirm?', true)).toBeTruthy();
        });

        it('returns defaultYes when readlineSync throws', () => {
            mockReadlineQuestion.mockImplementation(() => {
                throw new Error('TTY unavailable');
            });

            expect(confirm('Confirm?', true)).toBeTruthy();
            expect(confirm('Confirm?', false)).toBeFalsy();
        });

        it('returns defaultYes when stdin.isTTY is false', () => {
            Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

            expect(confirm('Confirm?', true)).toBeTruthy();
        });
    });

    describe('IsTTY', () => {
        afterEach(() => {
            Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
        });

        it('returns true when stdout.isTTY and quiet is false', () => {
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });

            expect(isTTY()).toBeTruthy();
        });

        it('returns false when stdout.isTTY is falsy', () => {
            Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });

            expect(isTTY()).toBeFalsy();
        });

        it('returns false when quiet is true', () => {
            Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
            const cfg3 = ConfigAccessor.create();
            cfg3.get = <T>(k: string) => ({ quiet: true, autoConfirm: false })[k] as T;
            mockGetConfig.mockReturnValue(cfg3);

            expect(isTTY()).toBeFalsy();
        });
    });

    describe('NAV_CMDS', () => {
        it('contains expected navigation commands', () => {
            expect(NAV_CMDS).toStrictEqual(['/back', '/menu', '/exit', '/sair', '/quit', '/help']);
        });
    });

});
