vi.mock('../ui/output.js', () => {
    const mockOutput = { print: vi.fn() };
    return {
        Output: { isTTY: vi.fn(), isCI: vi.fn(), columns: vi.fn(() => 80), rows: vi.fn(() => 24) },
        defaultOutput: mockOutput,
    };
});

vi.mock('../logger', () => ({
    rootLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), writeFileOnly: vi.fn() },
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
        writeFileOnly = vi.fn();
    },
}));

vi.mock('../ui/palette.js', () => {
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

vi.mock('../ui/prompt-ui.js', async () => {
    const actual = await vi.importActual<typeof import('../ui/prompt-ui.js')>('../ui/prompt-ui.js');
    return {
        ...actual,
        getConfig: vi.fn(() => ({
            get: <T>(key: string): T => {
                const v = { quiet: false, autoConfirm: false };
                return Reflect.get(v, key) as T;
            },
        })),
        warn: vi.fn(),
        icon: vi.fn(() => '!'),
    };
});

interface MockRl {
    question: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    _lineCallback: ((line: string) => void) | null;
    _closeCallback: (() => void) | null;
    _sigintCallback: (() => void) | null;
}

const mockRl: MockRl = {
    question: vi.fn(),
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'close') mockRl._closeCallback = callback;
        if (event === 'line') mockRl._lineCallback = callback;
        if (event === 'SIGINT') mockRl._sigintCallback = callback;
    }),
    close: vi.fn(),
    _closeCallback: null,
    _lineCallback: null,
    _sigintCallback: null,
};

vi.mock('readline', () => ({
    createInterface: vi.fn(() => mockRl),
}));

vi.mock('@inquirer/editor', () => ({ default: vi.fn() }));

import { askMultiline, __setEditorMod } from '../ui/prompt-input-editor.js';
import { CancelError } from '../ui/prompt-ui.js';

describe('Prompt Input Editor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __setEditorMod(null);
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    afterEach(() => {
        Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
        Object.defineProperty(process.stdout, 'isTTY', { value: undefined, configurable: true });
    });

    describe('AskMultiline', () => {
        it('returns editor result when mod injected and TTY', async () => {
            expect.hasAssertions();

            const mockEditor = vi.fn().mockResolvedValue('multi-line text');
            __setEditorMod({ default: mockEditor });
            const result = await askMultiline('Label');

            expect(result).toBe('multi-line text');
            expect(mockEditor).toHaveBeenCalledWith(expect.objectContaining({ message: 'Label' }));
        });

        it('trims whitespace from editor result', async () => {
            expect.hasAssertions();

            const mockEditor = vi.fn().mockResolvedValue('  text with spaces  ');
            __setEditorMod({ default: mockEditor });
            const result = await askMultiline('Label');

            expect(result).toBe('text with spaces');
        });

        it('throws CancelError on navigation command from editor', async () => {
            expect.hasAssertions();

            const mockEditor = vi.fn().mockResolvedValue('/back');
            __setEditorMod({ default: mockEditor });

            await expect(askMultiline('Label')).rejects.toThrow(CancelError);
        });

        it('falls back to sentinel when editor throws', async () => {
            expect.hasAssertions();

            const mockEditor = vi.fn().mockRejectedValue(new Error('Editor failed'));
            __setEditorMod({ default: mockEditor });

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('line 1');
                if (mockRl._lineCallback) mockRl._lineCallback('line 2');
                if (mockRl._lineCallback) mockRl._lineCallback('');
                if (mockRl._lineCallback) mockRl._lineCallback('');
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('line 1\nline 2');
        });

        it('falls back to sentinel when no mod available', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('text');
                if (mockRl._lineCallback) mockRl._lineCallback('');
                if (mockRl._lineCallback) mockRl._lineCallback('');
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('text');
        });

        it('terminates on double empty line in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('first');
                if (mockRl._lineCallback) mockRl._lineCallback('second');
                if (mockRl._lineCallback) mockRl._lineCallback('');
                if (mockRl._lineCallback) mockRl._lineCallback('');
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('first\nsecond');
        });

        it('terminates on close event in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._closeCallback) mockRl._closeCallback();
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('');
        });

        it('returns default when result is empty in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._closeCallback) mockRl._closeCallback();
            }, 10);

            const result = await askMultiline('Label', { default: 'fallback' });

            expect(result).toBe('fallback');
        });

        it('throws CancelError on /back in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('/back');
            }, 10);

            await expect(askMultiline('Label')).rejects.toThrow(CancelError);
        });

        it('handles SIGINT in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._sigintCallback) mockRl._sigintCallback();
            }, 10);

            await expect(askMultiline('Label')).rejects.toThrow(CancelError);
        });

        it('uses prompt fallback when _editorMod is false', async () => {
            expect.hasAssertions();

            __setEditorMod(false);

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('fallback text');
                if (mockRl._lineCallback) mockRl._lineCallback('');
                if (mockRl._lineCallback) mockRl._lineCallback('');
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('fallback text');
        });

        it('accumulates multiple lines in sentinel mode', async () => {
            expect.hasAssertions();

            setTimeout(() => {
                if (mockRl._lineCallback) mockRl._lineCallback('line 1');
                if (mockRl._lineCallback) mockRl._lineCallback('line 2');
                if (mockRl._lineCallback) mockRl._lineCallback('line 3');
                if (mockRl._lineCallback) mockRl._lineCallback('');
                if (mockRl._lineCallback) mockRl._lineCallback('');
            }, 10);

            const result = await askMultiline('Label');

            expect(result).toBe('line 1\nline 2\nline 3');
        });
    });
});
