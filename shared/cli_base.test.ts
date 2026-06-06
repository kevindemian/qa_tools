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

vi.mock('./logger', async () => ({
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
vi.mock('readline', async () => ({
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

    describe('mask', () => {
        it('returns first 4 chars plus asterisks', async () => {
            expect(cliBase.mask('abcdefgh')).toBe('abcd****');
        });

        it('returns empty string for empty input', async () => {
            expect(cliBase.mask('')).toBe('');
        });

        it('returns 4 asterisks for short strings', async () => {
            expect(cliBase.mask('ab')).toBe('ab****');
        });
    });

    describe('createValidateEnv', () => {
        const configs = [
            { key: 'TOKEN_A', label: 'Token A', example: 'TOKEN_A=abc' },
            { key: 'TOKEN_B', label: 'Token B', example: 'TOKEN_B=def' },
        ];

        it('does not throw when required vars are missing — returns result and warns', async () => {
            delete process.env.TOKEN_A;
            delete process.env.TOKEN_B;
            const validate = cliBase.createValidateEnv(configs);
            const result = validate();
            expect(result.ok).toBe(false);
            expect(result.missing).toContain('TOKEN_A');
            expect(MOCK_PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Configurações incompletas'));
        });

        it('warns when real credentials are detected', async () => {
            process.env.TOKEN_A = 'this-is-a-real-token-value-123456';
            process.env.TOKEN_B = 'another-real-credential-here-789';
            const validate = cliBase.createValidateEnv(configs);
            validate();
            expect(mockRootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('VARIÁVEL COM CREDENCIAL REAL'));
        });

        it('does not warn for placeholder values', async () => {
            process.env.TOKEN_A = 'seu-token-aqui';
            process.env.TOKEN_B = 'your-token-here';
            const validate = cliBase.createValidateEnv(configs);
            validate();
            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });
    });

    describe('setupSigint', () => {
        let mockRl: Mocked<readline.Interface>;

        beforeEach(() => {
            mockRl = vi.mocked({
                question: vi.fn(),
                close: vi.fn(),
                terminal: false,
                line: '',
                cursor: 0,
                getPrompt: vi.fn(),
                setPrompt: vi.fn(),
                prompt: vi.fn(),
                pause: vi.fn(),
                resume: vi.fn(),
                getCursorPos: vi.fn(),
                write: vi.fn(),
                on: vi.fn(),
                once: vi.fn(),
                emit: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                off: vi.fn(),
                removeAllListeners: vi.fn(),
                setMaxListeners: vi.fn(),
                getMaxListeners: vi.fn(),
                listeners: vi.fn(),
                rawListeners: vi.fn(),
                listenerCount: vi.fn(),
                prependListener: vi.fn(),
                prependOnceListener: vi.fn(),
                eventNames: vi.fn(),
                [Symbol.dispose]: vi.fn(),
                [Symbol.asyncIterator]: vi.fn(),
            }) as unknown as Mocked<readline.Interface>;
            vi.mocked(readline.createInterface).mockReturnValue(mockRl);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('registers SIGINT handler', async () => {
            vi.spyOn(process, 'on').mockImplementation(() => process);
            cliBase.setupSigint(null, () => {});
            expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        });

        it('shows confirmation prompt on SIGINT (not busy)', async () => {
            vi.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = vi.fn();
            cliBase.setupSigint(null, onExit);
            expect(readline.createInterface).toHaveBeenCalled();
            expect(mockRl.question).toHaveBeenCalledWith('Deseja sair? (s/N) ', expect.any(Function));
        });

        it('calls onExit and exits when user responds s', async () => {
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
            expect(onExit).toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            vi.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('does not exit when user responds n', async () => {
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
            cliBase.setupSigint(null, onExit);
            capturedHandler();
            expect(mockRl.question).toHaveBeenCalled();
            capturedHandler();
            expect(onExit).toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            vi.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('does not exit if isBusy returns true', async () => {
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
            vi.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            vi.useRealTimers();
        });

        it('continues when SIGINT answer is undefined', async () => {
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

        it('continues when SIGINT answer is empty string', async () => {
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

    describe('setupSigint — integration SIGINT (CR-3a)', () => {
        let mockRlInt: Record<string, ReturnType<typeof vi.fn>>;
        let onExit: () => void;

        beforeEach(() => {
            onExit = vi.fn() as () => void;
            mockRlInt = { question: vi.fn(), close: vi.fn() };
            vi.mocked(readline.createInterface).mockReturnValue(mockRlInt as never);
        });

        afterEach(() => {
            process.removeAllListeners('SIGINT');
            vi.restoreAllMocks();
        });

        it('continues when answer is undefined after real SIGINT emission', () => {
            cliBase.setupSigint(null, onExit);
            process.emit('SIGINT');
            const questionFn = nonNull(mockRlInt.question?.mock.calls[0]?.[1]) as (a: string | undefined) => void;
            questionFn(undefined);
            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });

        it('continues when answer is empty string after real SIGINT emission', () => {
            cliBase.setupSigint(null, onExit);
            process.emit('SIGINT');
            const questionFn = nonNull(mockRlInt.question?.mock.calls[0]?.[1]) as (a: string) => void;
            questionFn('');
            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });
    });

    describe('offerEnvSetup', () => {
        it('returns false when validation ok', async () => {
            const result = cliBase.offerEnvSetup({ ok: true, missing: [] });
            expect(result).toBe(false);
            expect(MOCK_PROMPT.confirm).not.toHaveBeenCalled();
        });

        it('returns false and does not prompt in CI mode', async () => {
            process.env.CI = 'true';
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(false);
            expect(MOCK_PROMPT.confirm).not.toHaveBeenCalled();
            delete process.env.CI;
        });

        it('returns false when confirm returns false', async () => {
            delete process.env.CI;
            nonNull(MOCK_PROMPT.confirm).mockReturnValueOnce(false);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(false);
            expect(MOCK_PROMPT.confirm).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('returns true when user accepts', async () => {
            delete process.env.CI;
            nonNull(MOCK_PROMPT.confirm).mockReturnValueOnce(true);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(true);
        });

        it('returns false when confirm throws (CancelError)', async () => {
            delete process.env.CI;
            nonNull(MOCK_PROMPT.confirm).mockImplementationOnce(() => {
                throw new Error('cancel');
            });
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(false);
        });
    });

    describe('sanitizeUrl', () => {
        it('masks token in URL', async () => {
            expect(cliBase.sanitizeUrl('http://example.com?token=abc123&other=1')).toBe(
                'http://example.com?token=****&other=1',
            );
        });

        it('returns unchanged URL without token', async () => {
            expect(cliBase.sanitizeUrl('http://example.com?key=value')).toBe('http://example.com?key=value');
        });

        it('returns empty string for empty input', async () => {
            expect(cliBase.sanitizeUrl('')).toBe('');
        });

        it('does not modify URL with empty token value', async () => {
            expect(cliBase.sanitizeUrl('http://example.com?token=')).toBe('http://example.com?token=');
        });
    });

    describe('createValidateEnv edge cases', () => {
        const config = [{ key: 'TOKEN_A', label: 'Token A', example: 'TOKEN_A=abc' }];

        it('does not warn when long value contains "seu-"', () => {
            process.env.TOKEN_A = 'este-eh-seu-token-aqui-amigo-12345678';
            const validate = cliBase.createValidateEnv(config);
            validate();
            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });

        it('does not warn when long value contains "your-"', () => {
            process.env.TOKEN_A = 'this-is-your-token-here-friend-1234567';
            const validate = cliBase.createValidateEnv(config);
            validate();
            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });

        it('does not warn when long value contains "placeholder"', () => {
            process.env.TOKEN_A = 'this-is-a-placeholder-value-for-test-123';
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

    describe('printSessionSummary', () => {
        beforeAll(() => {
            MOCK_PROMPT.print = vi.fn();
            MOCK_PROMPT.success = vi.fn();
            MOCK_PROMPT.divider = vi.fn();
            mockRootLogger.writeFileOnly.mockReset();
        });

        beforeEach(() => {
            mockRootLogger.filePath = undefined;
        });

        it('prints ok and error counts when both > 0', async () => {
            cliBase.printSessionSummary([{ status: 'ok' }, { status: 'error' }], null);
            expect(MOCK_PROMPT.success).toHaveBeenCalledWith('1 operação(oes) concluída(s)');
            expect(MOCK_PROMPT.error).toHaveBeenCalledWith('1 operação(oes) com erro');
        });

        it('prints only ok when no errors', async () => {
            cliBase.printSessionSummary([{ status: 'ok' }, { status: 'ok' }], null);
            expect(MOCK_PROMPT.success).toHaveBeenCalledWith('2 operação(oes) concluída(s)');
            expect(MOCK_PROMPT.error).not.toHaveBeenCalled();
        });

        it('prints only error when no oks', async () => {
            cliBase.printSessionSummary([{ status: 'error' }, { status: 'error' }], null);
            expect(MOCK_PROMPT.error).toHaveBeenCalledWith('2 operação(oes) com erro');
            expect(MOCK_PROMPT.success).not.toHaveBeenCalled();
        });

        it('skips counters when both are zero', async () => {
            cliBase.printSessionSummary([], null);
            expect(MOCK_PROMPT.success).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.error).not.toHaveBeenCalled();
        });

        it('prints history entries when provided', async () => {
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

        it('prints last operation when provided', async () => {
            cliBase.printSessionSummary([], 'test-op');
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Última operação: test-op');
        });

        it('prints log path when available', async () => {
            mockRootLogger.filePath = '/tmp/test.log';
            cliBase.printSessionSummary([], null);
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Log: /tmp/test.log');
        });

        it('does not print log path when undefined', async () => {
            cliBase.printSessionSummary([], null);
            expect(MOCK_PROMPT.info).not.toHaveBeenCalledWith(expect.stringContaining('Log:'));
        });
    });
});
