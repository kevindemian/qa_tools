import { nonNull } from './test-utils.js';
import type { Mock, Mocked } from 'vitest';

const mockRootLogger = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    filePath: undefined as string | undefined,
    writeFileOnly: vi.fn(),
    file: vi.fn(),
    writeSplash: vi.fn(),
    updateSplashStep: vi.fn(),
}));

vi.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
    },
}));

const MOCK_PROMPT: {
    error: Mock;
    warn: Mock;
    info: Mock;
    print?: Mock;
    success?: Mock;
    divider?: Mock;
    confirm?: Mock;
} = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), confirm: vi.fn().mockReturnValue(false) }));
vi.mock('./prompt', () => MOCK_PROMPT);
vi.mock('readline', () => ({
    createInterface: vi.fn(),
}));

import * as cliBase from './cli_base.js';
import * as readline from 'readline';
import Config from './config.js';

const ENV_BACKUP = { ...process.env };

describe('CLI Base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...ENV_BACKUP };
    });

    describe('Mask', () => {
        it('returns first 4 chars plus asterisks', () => {
            expect(cliBase.mask('abcdefgh')).toBe('abcd****');
        });

        it('returns empty string for empty input', () => {
            expect(cliBase.mask('')).toBe('');
        });

        it('returns 4 asterisks for short strings', () => {
            expect(cliBase.mask('ab')).toBe('ab****');
        });
    });

    describe('CreateValidateEnv', () => {
        const configs = [
            { key: 'TOKEN_A', label: 'Token A', example: 'TOKEN_A=abc' },
            { key: 'TOKEN_B', label: 'Token B', example: 'TOKEN_B=def' },
        ];

        it('does not throw when required vars are missing — returns result and warns', () => {
            delete process.env['TOKEN_A'];
            delete process.env['TOKEN_B'];
            const validate = cliBase.createValidateEnv(configs);
            const result = validate();

            expect(result.ok).toBeFalsy();
            expect(result.missing).toContain('TOKEN_A');
            expect(MOCK_PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Configurações incompletas'));
        });

        it('warns when real credentials are detected', () => {
            process.env['TOKEN_A'] = 'this-is-a-real-token-value-123456';
            process.env['TOKEN_B'] = 'another-real-credential-here-789';
            const validate = cliBase.createValidateEnv(configs);
            validate();

            expect(mockRootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('VARIÁVEL COM CREDENCIAL REAL'));
        });

        it('does not warn for placeholder values', () => {
            process.env['TOKEN_A'] = 'seu-token-aqui';
            process.env['TOKEN_B'] = 'your-token-here';
            const validate = cliBase.createValidateEnv(configs);
            validate();

            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });
    });

    describe('SetupSigint', () => {
        let mockRl: Mocked<readline.Interface>;
        let createInterfaceSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            mockRl = {
                question: vi.fn() as readline.Interface['question'],
                close: vi.fn() as readline.Interface['close'],
                terminal: false as const,
                line: '',
                cursor: 0,
                getPrompt: vi.fn() as readline.Interface['getPrompt'],
                setPrompt: vi.fn() as readline.Interface['setPrompt'],
                prompt: vi.fn() as readline.Interface['prompt'],
                pause: vi.fn() as readline.Interface['pause'],
                resume: vi.fn() as readline.Interface['resume'],
                getCursorPos: vi.fn() as readline.Interface['getCursorPos'],
                write: vi.fn() as readline.Interface['write'],
                on: vi.fn() as readline.Interface['on'],
                once: vi.fn() as readline.Interface['once'],
                emit: vi.fn() as readline.Interface['emit'],
                addListener: vi.fn() as readline.Interface['addListener'],
                removeListener: vi.fn() as readline.Interface['removeListener'],
                off: vi.fn() as readline.Interface['off'],
                removeAllListeners: vi.fn() as readline.Interface['removeAllListeners'],
                setMaxListeners: vi.fn() as readline.Interface['setMaxListeners'],
                getMaxListeners: vi.fn() as readline.Interface['getMaxListeners'],
                listeners: vi.fn() as readline.Interface['listeners'],
                rawListeners: vi.fn() as readline.Interface['rawListeners'],
                listenerCount: vi.fn() as readline.Interface['listenerCount'],
                prependListener: vi.fn() as readline.Interface['prependListener'],
                prependOnceListener: vi.fn() as readline.Interface['prependOnceListener'],
                eventNames: vi.fn() as readline.Interface['eventNames'],
                [Symbol.dispose]: vi.fn() as readline.Interface[typeof Symbol.dispose],
                [Symbol.asyncIterator]: vi.fn() as readline.Interface[typeof Symbol.asyncIterator],
            } as Mocked<readline.Interface>;
            createInterfaceSpy = vi.spyOn(readline, 'createInterface').mockReturnValue(mockRl);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('registers SIGINT handler', () => {
            const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
            cliBase.setupSigint(null, () => {});

            expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        });

        it('shows confirmation prompt on SIGINT (not busy)', () => {
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);

            expect(createInterfaceSpy).toHaveBeenCalledWith(
                expect.objectContaining({ input: process.stdin, output: process.stdout }),
            );

            const questionSpy = vi.spyOn(mockRl, 'question');

            expect(questionSpy).toHaveBeenCalledWith('Deseja sair? (s/N) ', expect.any(Function));
        });

        it('calls onExit and exits when user responds s', async () => {
            expect.hasAssertions();
            vi.useFakeTimers();
            const exitSpy = vi
                .spyOn(process, 'exit')
                .mockImplementation(vi.fn<(...args: [string | number | null | undefined]) => never>());
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);
            const questionFn = nonNull(mockRl.question.mock.calls[0])[1] as (answer: string) => void;
            questionFn('s');

            expect(onExit).toHaveBeenCalledWith();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');

            await vi.advanceTimersByTimeAsync(2000);

            expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));

            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('does not exit when user responds n', () => {
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);
            const questionFn = nonNull(mockRl.question.mock.calls[0])[1] as (answer: string) => void;
            questionFn('n');

            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });

        it('force exits on 2nd SIGINT during confirmation', async () => {
            expect.hasAssertions();
            vi.useFakeTimers();
            const exitSpy = vi
                .spyOn(process, 'exit')
                .mockImplementation(vi.fn<(...args: [string | number | null | undefined]) => never>());
            let capturedHandler: () => void = () => {};
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = vi.fn();
            const questionSpy = vi.spyOn(mockRl, 'question');
            cliBase.setupSigint(null, onExit);
            capturedHandler();

            expect(questionSpy).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Function),
            );

            capturedHandler();

            expect(onExit).toHaveBeenCalledWith();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');

            await vi.advanceTimersByTimeAsync(2000);

            expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));

            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('does not exit if isBusy returns true', () => {
            let capturedHandler: () => void = () => {};
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(() => true, onExit);
            capturedHandler();

            expect(MOCK_PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Operação em andamento'));
            expect(onExit).not.toHaveBeenCalled();
        });

        it('handles null onExit gracefully on confirmation s', async () => {
            expect.hasAssertions();
            vi.useFakeTimers();
            const exitSpy = vi
                .spyOn(process, 'exit')
                .mockImplementation(vi.fn<(...args: [string | number | null | undefined]) => never>());
            let capturedHandler: () => void = () => {};
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            cliBase.setupSigint(null, null);
            capturedHandler();
            const questionFn = nonNull(mockRl.question.mock.calls[0])[1] as (answer: string) => void;
            questionFn('s');

            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');

            await vi.advanceTimersByTimeAsync(2000);

            expect(exitSpy).toHaveBeenCalledWith(expect.any(Number));

            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('continues when SIGINT answer is undefined', () => {
            let capturedHandler: () => void = () => {};
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);
            capturedHandler();
            const questionFn = nonNull(mockRl.question.mock.calls[0])[1] as (answer: string | undefined) => void;
            questionFn(undefined);

            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });

        it('continues when SIGINT answer is empty string', () => {
            let capturedHandler: () => void = () => {};
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);
            capturedHandler();
            const questionFn = nonNull(mockRl.question.mock.calls[0])[1] as (answer: string) => void;
            questionFn('');

            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });
    });

    // ---------------------------------------------------------------------------
    // setupSigint — integration SIGINT (CR-3a)
    // Uses real process.emit('SIGINT') instead of capturing the handler
    // ---------------------------------------------------------------------------

    describe('SetupSigint — integration SIGINT (CR-3a)', () => {
        let mockRlInt: Record<string, ReturnType<typeof vi.fn>>;
        let onExit: () => void;

        beforeEach(() => {
            onExit = vi.fn() as () => void;
            mockRlInt = { question: vi.fn(), close: vi.fn() };
            vi.spyOn(readline, 'createInterface').mockReturnValue(mockRlInt as never);
        });

        afterEach(() => {
            process.removeAllListeners('SIGINT');
            vi.restoreAllMocks();
        });

        it('continues when answer is undefined after real SIGINT emission', () => {
            cliBase.setupSigint(null, onExit);
            process.emit('SIGINT');
            const questionFn = nonNull(mockRlInt['question']?.mock.calls[0]?.[1]) as (a: string | undefined) => void;
            questionFn(undefined);

            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });

        it('continues when answer is empty string after real SIGINT emission', () => {
            cliBase.setupSigint(null, onExit);
            process.emit('SIGINT');
            const questionFn = nonNull(mockRlInt['question']?.mock.calls[0]?.[1]) as (a: string) => void;
            questionFn('');

            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });
    });

    describe('OfferEnvSetup', () => {
        it('returns false when validation ok', () => {
            const result = cliBase.offerEnvSetup({ ok: true, missing: [] });

            expect(result).toBeFalsy();
            expect(MOCK_PROMPT.confirm).not.toHaveBeenCalled();
        });

        it('returns false and does not prompt in CI mode', () => {
            process.env['CI'] = 'true';
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });

            expect(result).toBeFalsy();
            expect(MOCK_PROMPT.confirm).not.toHaveBeenCalled();

            delete process.env['CI'];
        });

        it('returns false when confirm returns false', () => {
            delete process.env['CI'];
            nonNull(MOCK_PROMPT.confirm).mockReturnValueOnce(false);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });

            expect(result).toBeFalsy();
            expect(MOCK_PROMPT.confirm).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('returns true when user accepts', () => {
            delete process.env['CI'];
            nonNull(MOCK_PROMPT.confirm).mockReturnValueOnce(true);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });

            expect(result).toBeTruthy();
        });

        it('returns false when confirm throws (CancelError)', () => {
            delete process.env['CI'];
            nonNull(MOCK_PROMPT.confirm).mockImplementationOnce(() => {
                throw new Error('cancel');
            });
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });

            expect(result).toBeFalsy();
        });
    });

    describe('SanitizeUrl', () => {
        it('masks token in URL', () => {
            expect(cliBase.sanitizeUrl('http://example.com?token=abc123&other=1')).toBe(
                'http://example.com?token=****&other=1',
            );
        });

        it('returns unchanged URL without token', () => {
            expect(cliBase.sanitizeUrl('http://example.com?key=value')).toBe('http://example.com?key=value');
        });

        it('returns empty string for empty input', () => {
            expect(cliBase.sanitizeUrl('')).toBe('');
        });

        it('does not modify URL with empty token value', () => {
            expect(cliBase.sanitizeUrl('http://example.com?token=')).toBe('http://example.com?token=');
        });
    });

    describe('CreateValidateEnv edge cases', () => {
        const config = [{ key: 'TOKEN_A', label: 'Token A', example: 'TOKEN_A=abc' }];

        it('does not warn when long value contains "seu-"', () => {
            process.env['TOKEN_A'] = 'este-eh-seu-token-aqui-amigo-12345678';
            const validate = cliBase.createValidateEnv(config);
            validate();

            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });

        it('does not warn when long value contains "your-"', () => {
            process.env['TOKEN_A'] = 'this-is-your-token-here-friend-1234567';
            const validate = cliBase.createValidateEnv(config);
            validate();

            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });

        it('does not warn when long value contains "placeholder"', () => {
            process.env['TOKEN_A'] = 'this-is-a-placeholder-value-for-test-123';
            const validate = cliBase.createValidateEnv(config);
            validate();

            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });

        it('uses || "" fallback when cfg.get() returns undefined on line 24', () => {
            const getSpy = vi
                .spyOn(Config, 'get')
                .mockReturnValueOnce('some-long-enough-value-1234567890')
                .mockReturnValueOnce(undefined);
            const validate = cliBase.createValidateEnv(config);
            validate();

            expect(mockRootLogger.warn).not.toHaveBeenCalled();

            getSpy.mockRestore();
        });
    });

    describe('PrintSessionSummary', () => {
        beforeAll(() => {
            MOCK_PROMPT.print = vi.fn();
            MOCK_PROMPT.success = vi.fn();
            MOCK_PROMPT.divider = vi.fn();
            mockRootLogger.writeFileOnly.mockReset();
        });

        beforeEach(() => {
            mockRootLogger.filePath = undefined;
        });

        it('prints ok and error counts when both > 0', () => {
            cliBase.printSessionSummary([{ status: 'ok' }, { status: 'error' }], null);

            expect(MOCK_PROMPT.success).toHaveBeenCalledWith('1 operação(oes) concluída(s)');
            expect(MOCK_PROMPT.error).toHaveBeenCalledWith('1 operação(oes) com erro');
        });

        it('prints only ok when no errors', () => {
            cliBase.printSessionSummary([{ status: 'ok' }, { status: 'ok' }], null);

            expect(MOCK_PROMPT.success).toHaveBeenCalledWith('2 operação(oes) concluída(s)');
            expect(MOCK_PROMPT.error).not.toHaveBeenCalled();
        });

        it('prints only error when no oks', () => {
            cliBase.printSessionSummary([{ status: 'error' }, { status: 'error' }], null);

            expect(MOCK_PROMPT.error).toHaveBeenCalledWith('2 operação(oes) com erro');
            expect(MOCK_PROMPT.success).not.toHaveBeenCalled();
        });

        it('skips counters when both are zero', () => {
            cliBase.printSessionSummary([], null);

            expect(MOCK_PROMPT.success).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.error).not.toHaveBeenCalled();
        });

        it('prints history entries when provided', () => {
            const history = [
                { status: 'ok', op: 'test', detail: 'passed' },
                { status: 'error', op: 'build', detail: 'failed' },
            ];
            cliBase.printSessionSummary([], null, history);

            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Últimas operações:');
            expect(MOCK_PROMPT.print).toHaveBeenCalledTimes(3);
            expect(MOCK_PROMPT.print).toHaveBeenCalledWith(expect.stringContaining('test: passed'));
            expect(MOCK_PROMPT.print).toHaveBeenCalledWith(expect.stringContaining('build: failed'));
        });

        it('prints last operation when provided', () => {
            cliBase.printSessionSummary([], 'test-op');

            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Última operação: test-op');
        });

        it('prints log path when available', () => {
            mockRootLogger.filePath = '/tmp/test.log';
            cliBase.printSessionSummary([], null);

            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Log: /tmp/test.log');
        });

        it('does not print log path when undefined', () => {
            cliBase.printSessionSummary([], null);

            expect(MOCK_PROMPT.info).not.toHaveBeenCalledWith(expect.stringContaining('Log:'));
        });
    });
});
