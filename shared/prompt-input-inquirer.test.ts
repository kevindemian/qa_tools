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
    const actual = jest.requireActual('./prompt-ui');
    return {
        ...actual,
        getConfig: jest.fn(() => {
            const cfg = new (jest.requireActual('./config-accessor').default)();
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

jest.mock('readline', () => {
    const mockRl = { question: jest.fn(), on: jest.fn(), close: jest.fn() };
    return { createInterface: jest.fn(() => mockRl), _testRl: mockRl };
});

jest.mock('@inquirer/input', () => ({ default: jest.fn() }));
jest.mock('@inquirer/select', () => ({ default: jest.fn() }));
jest.mock('@inquirer/confirm', () => ({ default: jest.fn() }));

import readlineSync from 'readline-sync';
import ConfigAccessor from './config-accessor';
import { getConfig, warn, CancelError } from './prompt-ui';
import {
    smartPrompt,
    ask,
    askConfirm,
    showSelect,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
    SelectChoice,
} from './prompt-input-inquirer';

const mockReadlineQuestion = jest.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = jest.mocked(getConfig);
const mockWarn = jest.mocked(warn);

beforeEach(() => {
    jest.clearAllMocks();
    mockReadlineQuestion.mockReturnValue('');
    const cfg = ConfigAccessor.create();
    cfg.get = <T>(k: string) => ({ quiet: false, autoConfirm: false })[k] as T;
    mockGetConfig.mockReturnValue(cfg);
    __setInputMod(null);
    __setSelectMod(null);
    __setConfirmMod(null);
});

describe('smartPrompt', () => {
    it('returns value on first try', async () => {
        mockReadlineQuestion.mockReturnValue('my value');
        const result = await smartPrompt('Label');
        expect(result).toBe('my value');
    });

    it('triggers help callback on /help', async () => {
        mockReadlineQuestion.mockReturnValueOnce('/help').mockReturnValueOnce('value');
        const helpCb = jest.fn();
        const result = await smartPrompt('Label', {}, helpCb);
        expect(result).toBe('value');
        expect(helpCb).toHaveBeenCalled();
    });

    it('throws CancelError on navigation', async () => {
        mockReadlineQuestion.mockReturnValue('/back');
        await expect(smartPrompt('Label')).rejects.toThrow(CancelError);
    });

    it('handles CancelError with /help from ask', async () => {
        mockReadlineQuestion.mockReturnValueOnce('/help').mockReturnValueOnce('ok');
        const helpCb = jest.fn();
        const result = await smartPrompt('Label', {}, helpCb);
        expect(result).toBe('ok');
    });

    it('warns on max retries exceeded', async () => {
        mockReadlineQuestion.mockReturnValue('');
        const result = await smartPrompt('Label', { maxRetries: 2 });
        expect(result).toBe('');
        expect(mockWarn).toHaveBeenCalled();
    });

    it('re-throws non-CancelError from ask', async () => {
        mockReadlineQuestion.mockImplementation(() => {
            throw new Error('readline error');
        });
        await expect(smartPrompt('Label')).rejects.toThrow('readline error');
    });

    it('continues on /help CancelError without callback', async () => {
        mockReadlineQuestion.mockReturnValueOnce('/help').mockReturnValueOnce('ok');
        const result = await smartPrompt('Label');
        expect(result).toBe('ok');
    });
});

describe('ask', () => {
    it('returns prompt result when no TTY', async () => {
        mockReadlineQuestion.mockReturnValue('user input');
        const result = await ask('Label');
        expect(result).toBe('user input');
    });

    it('throws CancelError on navigation command', async () => {
        mockReadlineQuestion.mockReturnValue('/back');
        await expect(ask('Label')).rejects.toThrow('/back');
    });

    it('falls back to prompt when no inquirer mod', async () => {
        mockReadlineQuestion.mockReturnValue('fallback');
        const result = await ask('Label');
        expect(result).toBe('fallback');
    });

    it('works with injected input mod', async () => {
        __setInputMod({ default: jest.fn().mockResolvedValue('injected') });
        mockReadlineQuestion.mockReturnValue('fallback value');
        const result = await ask('Label');
        expect(result).toBe('fallback value');
    });

    it('throws CancelError on navigation command in fallback', async () => {
        mockReadlineQuestion.mockReturnValue('/back');
        await expect(ask('Label')).rejects.toThrow('/back');
    });
});

describe('ask with TTY and inquirer mod', () => {
    beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    afterEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('returns inquirer result when mod injected and TTY', async () => {
        const mockMod = jest.fn().mockResolvedValue('inquirer answer');
        __setInputMod({ default: mockMod });
        const result = await ask('Label');
        expect(result).toBe('inquirer answer');
        expect(mockMod).toHaveBeenCalledWith(expect.objectContaining({ message: 'Label' }));
    });

    it('falls through to prompt when navigation command from inquirer', async () => {
        const mockMod = jest.fn().mockResolvedValue('/back');
        __setInputMod({ default: mockMod });
        mockReadlineQuestion.mockReturnValue('backup result');
        const result = await ask('Label');
        expect(result).toBe('backup result');
    });

    it('falls back to prompt when inquirer throws', async () => {
        const mockMod = jest.fn().mockRejectedValue(new Error('inquirer error'));
        __setInputMod({ default: mockMod });
        mockReadlineQuestion.mockReturnValue('fallback answer');
        const result = await ask('Label');
        expect(result).toBe('fallback answer');
    });

    it('uses prompt fallback when _inputMod is false (cached import failure)', async () => {
        __setInputMod(false);
        mockReadlineQuestion.mockReturnValue('fallback');
        const result = await ask('Label');
        expect(result).toBe('fallback');
    });

    it('calls theme.answer and theme.message via inquirer input mod', async () => {
        const mockMod = jest
            .fn()
            .mockImplementation(
                async (opts: {
                    theme: { style: { answer: (s: string) => string; message: (s: string) => string } };
                }) => {
                    opts.theme.style.answer('ans');
                    opts.theme.style.message('msg');
                    return 'result';
                },
            );
        __setInputMod({ default: mockMod });
        const result = await ask('Label');
        expect(result).toBe('result');
    });
});

describe('askConfirm', () => {
    it('returns confirm result when no TTY', async () => {
        mockReadlineQuestion.mockReturnValue('s');
        const result = await askConfirm('Confirm?');
        expect(result).toBe(true);
    });

    it('returns false for no response', async () => {
        mockReadlineQuestion.mockReturnValue('n');
        const result = await askConfirm('Confirm?');
        expect(result).toBe(false);
    });

    it('returns inquirer result when askConfirm mod injected and TTY', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        const mockConfirmMod = jest.fn().mockResolvedValue(true);
        __setConfirmMod({ default: mockConfirmMod });
        const result = await askConfirm('Confirm?');
        expect(result).toBe(true);
        expect(mockConfirmMod).toHaveBeenCalledWith(expect.objectContaining({ message: 'Confirm?' }));
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('falls back to confirm when askConfirm inquirer throws', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        const mockConfirmMod = jest.fn().mockRejectedValue(new Error('err'));
        __setConfirmMod({ default: mockConfirmMod });
        mockReadlineQuestion.mockReturnValue('s');
        const result = await askConfirm('Confirm?');
        expect(result).toBe(true);
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('uses confirm fallback when _confirmMod is false (cached import failure)', async () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        __setConfirmMod(false);
        mockReadlineQuestion.mockReturnValue('s');
        const result = await askConfirm('Confirm?');
        expect(result).toBe(true);
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });
});

describe('showSelect', () => {
    const choices = [
        { name: 'Option 1', value: '1' },
        { name: 'Option 2', value: '2' },
    ];

    it('returns selected value by number', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', choices);
        expect(result).toBe('1');
    });

    it('returns 0 for second choice by number', async () => {
        mockReadlineQuestion.mockReturnValue('2');
        const result = await showSelect('Choose', choices);
        expect(result).toBe('2');
    });

    it('handles choice by alias', async () => {
        mockReadlineQuestion.mockReturnValue('Option 1');
        const result = await showSelect('Choose', choices);
        expect(result).toBe('Option 1');
    });

    it('throws CancelError on navigation command', async () => {
        mockReadlineQuestion.mockReturnValue('/help');
        await expect(showSelect('Choose', choices)).rejects.toThrow('/help');
    });

    it('returns 0 for exit choice', async () => {
        mockReadlineQuestion.mockReturnValue('0');
        const result = await showSelect('Choose', choices);
        expect(result).toBe('0');
    });

    it('handles sections in fallback mode', async () => {
        const sectionedChoices: SelectChoice[] = [
            { type: 'separator' as const, line: 'Section 1' },
            { name: 'Item A', value: 'a' },
            { name: 'Item B', value: 'b' },
        ];
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', sectionedChoices);
        expect(result).toBe('a');
    });

    it('shows description when provided', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', [{ name: 'Option 1', value: '1', description: 'desc' }]);
        expect(result).toBe('1');
    });

    it('uses name as value when value not provided', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', [{ name: 'Option A' }]);
        expect(result).toBe('Option A');
    });

    it('handles choices with no name resulting in empty rendered items', async () => {
        mockReadlineQuestion.mockReturnValue('0');
        const result = await showSelect('Choose', [{ value: 'a' }, { value: 'b' }]);
        expect(result).toBe('0');
    });

    it('returns default when empty answer and default provided', async () => {
        mockReadlineQuestion.mockReturnValue('');
        const result = await showSelect('Choose', [{ name: 'A', value: 'a' }], { default: 'def' });
        expect(result).toBe('def');
    });

    it('returns 0 when empty answer and no default', async () => {
        mockReadlineQuestion.mockReturnValue('');
        const result = await showSelect('Choose', [{ name: 'A', value: 'a' }]);
        expect(result).toBe('0');
    });
});

describe('showSelect with menuMode', () => {
    it('forces fallback when menuMode is true', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', [{ name: 'Item A', value: 'a' }], { menuMode: true });
        expect(result).toBe('a');
    });

    it('handles separator with empty line in fallback mode', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', [
            { type: 'separator' as const, line: '' },
            { name: 'Visible', value: 'v' },
        ]);
        expect(result).toBe('v');
    });
});

describe('showSelect TTY path', () => {
    beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    afterEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('returns inquirer result when mod injected and TTY', async () => {
        const mockSelectMod = jest.fn().mockResolvedValue('selected');
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [
            { name: 'Item A', value: 'a' },
            { name: 'Item B', value: 'b' },
        ]);
        expect(result).toBe('selected');
        expect(mockSelectMod).toHaveBeenCalledWith(expect.objectContaining({ message: 'Choose' }));
    });

    it('handles separator and no-name choices in TTY mode', async () => {
        const mockSelectMod = jest.fn().mockResolvedValue('val');
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [
            { type: 'separator', line: '---' },
            { name: undefined, value: 'no-name' },
            { name: 'Visible', value: 'val' },
        ]);
        expect(result).toBe('val');
    });

    it('returns 0 when inquirer mod throws in TTY mode', async () => {
        const mockSelectMod = jest.fn().mockRejectedValue(new Error('select error'));
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [{ name: 'Item', value: 'x' }]);
        expect(result).toBe('0');
    });

    it('calls theme.renderSelected via inquirer select mod', async () => {
        const mockSelectMod = jest
            .fn()
            .mockImplementation(async (opts: { theme: { style: { renderSelected: (s: string) => string } } }) => {
                opts.theme.style.renderSelected('sel');
                return 'selected';
            });
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [{ name: 'Item A', value: 'a' }]);
        expect(result).toBe('selected');
    });

    it('handles separator without line property', async () => {
        const mockSelectMod = jest.fn().mockResolvedValue('val');
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [{ type: 'separator' as const }, { name: 'Visible', value: 'val' }]);
        expect(result).toBe('val');
    });

    it('handles choice without value in TTY mode', async () => {
        const mockSelectMod = jest.fn().mockResolvedValue('Visible');
        __setSelectMod({ default: mockSelectMod });
        const result = await showSelect('Choose', [{ name: 'Visible' }]);
        expect(result).toBe('Visible');
    });
});

describe('showSelect fallback', () => {
    it('returns slash command directly when not in NAV_CMDS', async () => {
        mockReadlineQuestion.mockReturnValue('/custom-cmd');
        const result = await showSelect('Choose', [{ name: 'Item A', value: 'a' }]);
        expect(result).toBe('/custom-cmd');
    });

    it('handles choice with no name in fallback mode', async () => {
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', [{ value: 'a' }, { name: 'Visible', value: 'v' }]);
        expect(result).toBe('v');
    });
});
