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
        getConfig: jest.fn(() => ({
            get: (key: string) => {
                const v: Record<string, unknown> = { quiet: false, autoConfirm: false };
                return v[key] as boolean;
            },
        })),
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import readlineSync from 'readline-sync';
import { CancelError } from './prompt-ui';
import { getConfig } from './prompt-ui';
import { filePathCompleter, askFilePath } from './prompt-input-filepath';
import * as readline from 'readline';

interface _MockRl {
    question: jest.Mock;
    on: jest.Mock;
    close: jest.Mock;
}
const _mockRl = (readline as unknown as { _testRl: _MockRl })._testRl;

const mockReadlineQuestion = jest.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = getConfig as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    mockReadlineQuestion.mockReturnValue('');
    mockGetConfig.mockReturnValue({ get: (k: string) => ({ quiet: false, autoConfirm: false })[k] });
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

    it('filters out dotfiles when base does not start with dot', () => {
        const dir = path.join(__dirname, '__test_fixtures__');
        const dotfile = path.join(dir, '.hidden');
        fs.writeFileSync(dotfile, '');
        try {
            const [matches] = filePathCompleter(dir + '/');
            expect(matches).not.toContain(dotfile);
        } finally {
            fs.unlinkSync(dotfile);
        }
    });

    it('includes dotfiles when base starts with dot', () => {
        const dir = path.join(__dirname, '__test_fixtures__');
        const dotfile = path.join(dir, '.hidden');
        fs.writeFileSync(dotfile, '');
        try {
            const [matches] = filePathCompleter(dir + '/.hid');
            expect(matches).toContain(dotfile);
        } finally {
            fs.unlinkSync(dotfile);
        }
    });

    it('handles statSync error in filter callback', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-err-'));
        try {
            fs.symlinkSync('/nonexistent-target', path.join(dir, 'dangling.txt'));
            const [matches] = filePathCompleter(dir + '/', ['.txt']);
            expect(matches).toEqual([]);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('handles stat error in map callback (broken symlink, no ext filter)', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stat-map-err-'));
        try {
            fs.symlinkSync('/nonexistent-target', path.join(dir, 'dangling'));
            const [matches] = filePathCompleter(dir + '/');
            expect(matches).toContain('dangling');
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('defaults to current dir when line is empty', () => {
        const [matches] = filePathCompleter('');
        expect(Array.isArray(matches)).toBe(true);
    });
});

describe('askFilePath', () => {
    it('falls back to prompt when no TTY', async () => {
        mockReadlineQuestion.mockReturnValue('/some/path');
        const result = await askFilePath('File:');
        expect(result).toBe('/some/path');
    });
});

describe('askFilePath TTY mode', () => {
    beforeEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        const mockRl = _mockRl;
        mockRl.question.mockReset();
        mockRl.on.mockReset();
        mockRl.close.mockReset();
    });

    afterEach(() => {
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    it('resolves with user input', async () => {
        const mockRl = _mockRl;
        mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb('user path'));
        const result = await askFilePath('File:');
        expect(result).toBe('user path');
        expect(mockRl.close).toHaveBeenCalled();
    });

    it('rejects on navigation command', async () => {
        const mockRl = _mockRl;
        mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb('/back'));
        await expect(askFilePath('File:')).rejects.toThrow(CancelError);
        expect(mockRl.close).toHaveBeenCalled();
    });

    it('rejects on SIGINT', async () => {
        const mockRl = _mockRl;
        mockRl.question.mockImplementation(() => {});
        let sigintHandler: () => void = () => {};
        mockRl.on.mockImplementation((event: string, handler: () => void) => {
            if (event === 'SIGINT') sigintHandler = handler;
        });
        const promise = askFilePath('File:');
        sigintHandler();
        await expect(promise).rejects.toThrow('/exit');
        expect(mockRl.close).toHaveBeenCalled();
    });

    it('resolves with default when empty answer', async () => {
        const mockRl = _mockRl;
        mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb(''));
        const result = await askFilePath('File:', { default: '/default/path' });
        expect(result).toBe('/default/path');
        expect(mockRl.close).toHaveBeenCalled();
    });

    it('resolves with empty string when no default and empty answer', async () => {
        const mockRl = _mockRl;
        mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb(''));
        const result = await askFilePath('File:');
        expect(result).toBe('');
        expect(mockRl.close).toHaveBeenCalled();
    });
});
