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

jest.mock('./palette', () => ({
    palette: {
        green: { bold: (s: string) => s },
        red: { bold: (s: string) => s },
        yellow: { bold: (s: string) => s },
        blue: (s: string) => s,
        fg: { bold: (s: string) => s },
        muted: (s: string) => s,
        border: 'gray',
        purple: { bold: (s: string) => s },
    },
}));

jest.mock('./prompt-ui', () => {
    const actual = jest.requireActual('./prompt-ui');
    return {
        ...actual,
        getConfig: jest.fn(() => ({ quiet: false, autoConfirm: false })),
        warn: jest.fn(),
        icon: jest.fn(() => '!'),
    };
});

import * as fs from 'fs';
import * as path from 'path';
import readlineSync from 'readline-sync';
import { getConfig, warn, CancelError } from './prompt-ui';
import {
    prompt,
    confirm,
    smartPrompt,
    ask,
    askConfirm,
    showSelect,
    filePathCompleter,
    __setSelectMod,
    __setInputMod,
    __setConfirmMod,
} from './prompt-input';

const mockReadlineQuestion = jest.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = getConfig as jest.Mock;
const mockWarn = warn as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockReadlineQuestion.mockReturnValue('');
    mockGetConfig.mockReturnValue({ quiet: false, autoConfirm: false });
    __setInputMod(null);
    __setSelectMod(null);
    __setConfirmMod(null);
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
        mockGetConfig.mockReturnValue({ quiet: false, autoConfirm: true });
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
        expect(result).toBeNull();
        expect(mockWarn).toHaveBeenCalled();
    });
});

describe('ask', () => {
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
        const sectionedChoices = [
            { type: 'separator' as const, line: 'Section 1' },
            { name: 'Item A', value: 'a' },
            { name: 'Item B', value: 'b' },
        ];
        mockReadlineQuestion.mockReturnValue('1');
        const result = await showSelect('Choose', sectionedChoices);
        expect(result).toBe('a');
    });
});

describe('filePathCompleter', () => {
    const testDir = path.join(__dirname, '__test_fixtures__');
    const csvFile = path.join(testDir, 'test.csv');
    const jsonFile = path.join(testDir, 'test.json');
    const txtFile = path.join(testDir, 'test.txt');
    const subDir = path.join(testDir, 'subdir');

    beforeAll(() => {
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(csvFile, '');
        fs.writeFileSync(jsonFile, '');
        fs.writeFileSync(txtFile, '');
    });

    afterAll(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('matches all entries with empty base', () => {
        const [matches] = filePathCompleter(testDir + '/');
        expect(matches).toContain(csvFile);
        expect(matches).toContain(jsonFile);
        expect(matches).toContain(txtFile);
        expect(matches).toContain(subDir + '/');
        expect(matches.length).toBe(4);
    });

    it('filters by csv extension', () => {
        const [matches] = filePathCompleter(testDir + '/', ['.csv']);
        expect(matches).toContain(csvFile);
        expect(matches).not.toContain(jsonFile);
        expect(matches).not.toContain(txtFile);
        expect(matches).toContain(subDir + '/');
    });

    it('filters by json and txt extensions', () => {
        const [matches] = filePathCompleter(testDir + '/', ['.json', '.txt']);
        expect(matches).toContain(jsonFile);
        expect(matches).toContain(txtFile);
        expect(matches).not.toContain(csvFile);
        expect(matches).toContain(subDir + '/');
    });

    it('includes directories with trailing slash', () => {
        const [matches] = filePathCompleter(testDir + '/');
        expect(matches).toContain(subDir + '/');
    });

    it('returns original line as second element', () => {
        const prefix = testDir + '/test.';
        const [matches, line] = filePathCompleter(prefix);
        expect(matches.length).toBe(3);
        expect(line).toBe(prefix);
    });

    it('returns empty on invalid dir', () => {
        const [matches] = filePathCompleter('/nonexistent_dir_xyz/foo');
        expect(matches).toEqual([]);
    });

    it('expands tilde', () => {
        const [matches] = filePathCompleter('~');
        expect(matches.length).toBeGreaterThan(0);
    });
});
