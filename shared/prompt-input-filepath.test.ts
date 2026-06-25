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

const mockRlForReadline = { question: vi.fn(), on: vi.fn(), close: vi.fn() };
vi.mock('readline', () => ({
    createInterface: vi.fn(() => mockRlForReadline),
}));

vi.mock('@inquirer/input', () => ({ default: vi.fn() }));
vi.mock('@inquirer/select', () => ({ default: vi.fn() }));
vi.mock('@inquirer/confirm', () => ({ default: vi.fn() }));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import readlineSync from 'readline-sync';
import ConfigAccessor from './config-accessor.js';
import { CancelError, getConfig } from './prompt-ui.js';
import { filePathCompleter, askFilePath } from './prompt-input-filepath.js';
const _mockRl = mockRlForReadline;

const mockReadlineQuestion = vi.spyOn(readlineSync, 'question').mockImplementation(() => '');
const mockGetConfig = vi.mocked(getConfig);

describe('Prompt Input Filepath', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockReadlineQuestion.mockReturnValue('');
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        const cfg = ConfigAccessor.create();
        cfg.get = <T>(k: string) => ({ quiet: false, autoConfirm: false })[k] as T;
        mockGetConfig.mockReturnValue(cfg);
    });

    afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    });

    describe('FilePathCompleter', () => {
        const testDir = path.join(import.meta.dirname, '__test_fixtures__');
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
            expect(matches).toHaveLength(4);
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

            expect(matches).toHaveLength(3);
            expect(line).toBe(prefix);
        });

        it('returns empty on invalid dir', () => {
            const [matches] = filePathCompleter('/nonexistent_dir_xyz/foo');

            expect(matches).toStrictEqual([]);
        });

        it('expands tilde', () => {
            const [matches] = filePathCompleter('~');

            expect(matches.length).toBeGreaterThan(0);
        });

        it('filters out dotfiles when base does not start with dot', () => {
            const dir = path.join(import.meta.dirname, '__test_fixtures__');
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
            const dir = path.join(import.meta.dirname, '__test_fixtures__');
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

                expect(matches).toStrictEqual([]);
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

            expect(Array.isArray(matches)).toBeTruthy();
        });
    });

    describe('AskFilePath', () => {
        it('falls back to prompt when no TTY', async () => {expect.hasAssertions();

            mockReadlineQuestion.mockReturnValue('/some/path');
            const result = await askFilePath('File:');

            expect(result).toBe('/some/path');
        });
    });

    describe('AskFilePath TTY mode', () => {
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

        it('resolves with user input', async () => {expect.hasAssertions();

            const mockRl = _mockRl;
            mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb('user path'));
            const result = await askFilePath('File:');

            expect(result).toBe('user path');
            expect(mockRl.close).toHaveBeenCalledWith();
        });

        it('rejects on navigation command', async () => {expect.hasAssertions();

            const mockRl = _mockRl;
            mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb('/back'));

            await expect(askFilePath('File:')).rejects.toThrow(CancelError);
            expect(mockRl.close).toHaveBeenCalledWith();
        });

        it('rejects on SIGINT', async () => {expect.hasAssertions();

            const mockRl = _mockRl;
            mockRl.question.mockImplementation(() => {});
            let sigintHandler: () => void = () => {};
            mockRl.on.mockImplementation((event: string, handler: () => void) => {
                if (event === 'SIGINT') sigintHandler = handler;
            });
            const promise = askFilePath('File:');
            sigintHandler();

            await expect(promise).rejects.toThrow('/exit');
            expect(mockRl.close).toHaveBeenCalledWith();
        });

        it('resolves with default when empty answer', async () => {expect.hasAssertions();

            const mockRl = _mockRl;
            mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb(''));
            const result = await askFilePath('File:', { default: '/default/path' });

            expect(result).toBe('/default/path');
            expect(mockRl.close).toHaveBeenCalledWith();
        });

        it('resolves with empty string when no default and empty answer', async () => {expect.hasAssertions();

            const mockRl = _mockRl;
            mockRl.question.mockImplementation((_prompt: string, cb: (a: string) => void) => cb(''));
            const result = await askFilePath('File:');

            expect(result).toBe('');
            expect(mockRl.close).toHaveBeenCalledWith();
        });
    });

});
