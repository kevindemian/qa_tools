import { createMockRootLogger } from './test-utils';

const mockRootLogger = createMockRootLogger();

jest.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: class {
        info = jest.fn();
        error = jest.fn();
        warn = jest.fn();
        debug = jest.fn();
    },
}));

const MOCK_PROMPT: {
    error: jest.Mock;
    warn: jest.Mock;
    info: jest.Mock;
    print?: jest.Mock;
    success?: jest.Mock;
    divider?: jest.Mock;
    confirm?: jest.Mock;
} = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), confirm: jest.fn().mockReturnValue(false) };
jest.mock('./prompt', () => MOCK_PROMPT);
jest.mock('readline', () => ({
    createInterface: jest.fn(),
}));

import * as cliBase from './cli_base';
import * as readline from 'readline';
import Config from './config';

const ENV_BACKUP = { ...process.env };

describe('CLI Base', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env = { ...ENV_BACKUP };
    });

    describe('mask', () => {
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

    describe('createValidateEnv', () => {
        const configs = [
            { key: 'TOKEN_A', label: 'Token A', example: 'TOKEN_A=abc' },
            { key: 'TOKEN_B', label: 'Token B', example: 'TOKEN_B=def' },
        ];

        it('does not throw when required vars are missing — returns result and warns', () => {
            delete process.env.TOKEN_A;
            delete process.env.TOKEN_B;
            const validate = cliBase.createValidateEnv(configs);
            const result = validate();
            expect(result.ok).toBe(false);
            expect(result.missing).toContain('TOKEN_A');
            expect(MOCK_PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Configurações incompletas'));
        });

        it('warns when real credentials are detected', () => {
            process.env.TOKEN_A = 'this-is-a-real-token-value-123456';
            process.env.TOKEN_B = 'another-real-credential-here-789';
            const validate = cliBase.createValidateEnv(configs);
            validate();
            expect(mockRootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('VARIÁVEL COM CREDENCIAL REAL'));
        });

        it('does not warn for placeholder values', () => {
            process.env.TOKEN_A = 'seu-token-aqui';
            process.env.TOKEN_B = 'your-token-here';
            const validate = cliBase.createValidateEnv(configs);
            validate();
            expect(mockRootLogger.warn).not.toHaveBeenCalled();
        });
    });

    describe('setupSigint', () => {
        let mockRl: jest.Mocked<readline.Interface>;

        beforeEach(() => {
            mockRl = jest.mocked<readline.Interface>({
                question: jest.fn(),
                close: jest.fn(),
                terminal: false,
                line: '',
                cursor: 0,
                getPrompt: jest.fn(),
                setPrompt: jest.fn(),
                prompt: jest.fn(),
                pause: jest.fn(),
                resume: jest.fn(),
                getCursorPos: jest.fn(),
                write: jest.fn(),
                on: jest.fn(),
                once: jest.fn(),
                emit: jest.fn(),
                addListener: jest.fn(),
                removeListener: jest.fn(),
                off: jest.fn(),
                removeAllListeners: jest.fn(),
                setMaxListeners: jest.fn(),
                getMaxListeners: jest.fn(),
                listeners: jest.fn(),
                rawListeners: jest.fn(),
                listenerCount: jest.fn(),
                prependListener: jest.fn(),
                prependOnceListener: jest.fn(),
                eventNames: jest.fn(),
                [Symbol.dispose]: jest.fn(),
                [Symbol.asyncIterator]: jest.fn(),
            }) as jest.Mocked<readline.Interface>;
            jest.mocked(readline.createInterface).mockReturnValue(mockRl);
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('registers SIGINT handler', () => {
            jest.spyOn(process, 'on').mockImplementation(() => process);
            cliBase.setupSigint(null, () => {});
            expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        });

        it('shows confirmation prompt on SIGINT (not busy)', () => {
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(null, onExit);
            expect(readline.createInterface).toHaveBeenCalled();
            expect(mockRl.question).toHaveBeenCalledWith('Deseja sair? (s/N) ', expect.any(Function));
        });

        it('calls onExit and exits when user responds s', () => {
            jest.useFakeTimers();
            const exitSpy = jest
                .spyOn(process, 'exit')
                .mockImplementation(jest.fn<never, [string | number | null | undefined]>());
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(null, onExit);
            const questionFn = mockRl.question.mock.calls[0]![1] as (answer: string) => void;
            questionFn('s');
            expect(onExit).toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            jest.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            jest.useRealTimers();
        });

        it('does not exit when user responds n', () => {
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') (handler as () => void)();
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(null, onExit);
            const questionFn = mockRl.question.mock.calls[0]![1] as (answer: string) => void;
            questionFn('n');
            expect(onExit).not.toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Continuando...');
        });

        it('force exits on 2nd SIGINT during confirmation', () => {
            jest.useFakeTimers();
            const exitSpy = jest
                .spyOn(process, 'exit')
                .mockImplementation(jest.fn<never, [string | number | null | undefined]>());
            let capturedHandler: () => void;
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(null, onExit);
            capturedHandler!();
            expect(mockRl.question).toHaveBeenCalled();
            capturedHandler!();
            expect(onExit).toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            jest.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            jest.useRealTimers();
        });

        it('does not exit if isBusy returns true', () => {
            let capturedHandler: () => void;
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(() => true, onExit);
            capturedHandler!();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Operação em andamento'));
            expect(onExit).not.toHaveBeenCalled();
        });

        it('handles null onExit gracefully on confirmation s', () => {
            jest.useFakeTimers();
            const exitSpy = jest
                .spyOn(process, 'exit')
                .mockImplementation(jest.fn<never, [string | number | null | undefined]>());
            let capturedHandler: () => void;
            jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') capturedHandler = handler as () => void;
                return process;
            });
            cliBase.setupSigint(null, null);
            capturedHandler!();
            const questionFn = mockRl.question.mock.calls[0]![1] as (answer: string) => void;
            questionFn('s');
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            jest.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            jest.useRealTimers();
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
            MOCK_PROMPT.confirm!.mockReturnValueOnce(false);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(false);
            expect(MOCK_PROMPT.confirm).toHaveBeenCalledWith(expect.stringContaining('configurar'));
        });

        it('returns true when user accepts', async () => {
            delete process.env.CI;
            MOCK_PROMPT.confirm!.mockReturnValueOnce(true);
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(true);
        });

        it('returns false when confirm throws (CancelError)', async () => {
            delete process.env.CI;
            MOCK_PROMPT.confirm!.mockImplementationOnce(() => {
                throw new Error('cancel');
            });
            const result = cliBase.offerEnvSetup({ ok: false, missing: ['TOKEN_A'] });
            expect(result).toBe(false);
        });
    });

    describe('sanitizeUrl', () => {
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
            const getSpy = jest
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
            MOCK_PROMPT.print = jest.fn();
            MOCK_PROMPT.success = jest.fn();
            MOCK_PROMPT.divider = jest.fn();
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
