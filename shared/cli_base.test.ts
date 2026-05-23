const mockRootLogger: {
    info: jest.Mock;
    error: jest.Mock;
    warn: jest.Mock;
    debug?: jest.Mock;
    writeFileOnly?: jest.Mock;
    filePath?: string;
} = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

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
} = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
jest.mock('./prompt', () => MOCK_PROMPT);

import * as cliBase from './cli_base';

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

        it('throws when required vars are missing', () => {
            delete process.env.TOKEN_A;
            delete process.env.TOKEN_B;
            const validate = cliBase.createValidateEnv(configs);
            expect(() => validate()).toThrow('Variáveis de ambiente faltando');
            expect(MOCK_PROMPT.error).toHaveBeenCalledWith(expect.stringContaining('Variáveis obrigatórias'));
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
        it('registers SIGINT handler', () => {
            const onSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
            cliBase.setupSigint(null, () => {});
            expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            onSpy.mockRestore();
        });

        it('calls onExit and sets exitCode on SIGINT', () => {
            jest.useFakeTimers();
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
            const removeListenerSpy = jest.spyOn(process, 'removeListener').mockImplementation(() => process);
            const onSpy = jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') handler();
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(null, onExit);
            expect(onExit).toHaveBeenCalled();
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            jest.advanceTimersByTime(2000);
            expect(exitSpy).toHaveBeenCalled();
            exitSpy.mockRestore();
            removeListenerSpy.mockRestore();
            onSpy.mockRestore();
            jest.useRealTimers();
        });

        it('does not exit if isBusy returns true', () => {
            const onSpy = jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') handler();
                return process;
            });
            const onExit = jest.fn();
            cliBase.setupSigint(() => true, onExit);
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Operação em andamento'));
            expect(onExit).not.toHaveBeenCalled();
            onSpy.mockRestore();
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

    describe('setupSigint exit code', () => {
        it('sets exitCode to 0 on clean exit', () => {
            jest.useFakeTimers();
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
            const removeListenerSpy = jest.spyOn(process, 'removeListener').mockImplementation(() => process);
            const onSpy = jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') handler();
                return process;
            });
            cliBase.setupSigint(null, jest.fn());
            expect(process.exitCode).toBe(0);
            jest.advanceTimersByTime(2000);
            exitSpy.mockRestore();
            removeListenerSpy.mockRestore();
            onSpy.mockRestore();
            jest.useRealTimers();
        });

        it('handles null onExit gracefully', () => {
            jest.useFakeTimers();
            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
            const removeListenerSpy = jest.spyOn(process, 'removeListener').mockImplementation(() => process);
            const onSpy = jest.spyOn(process, 'on').mockImplementation((evt, handler) => {
                if (evt === 'SIGINT') handler();
                return process;
            });
            cliBase.setupSigint(null, null);
            expect(MOCK_PROMPT.info).toHaveBeenCalledWith('Até logo!');
            expect(process.exitCode).toBe(0);
            jest.advanceTimersByTime(2000);
            exitSpy.mockRestore();
            removeListenerSpy.mockRestore();
            onSpy.mockRestore();
            jest.useRealTimers();
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
    });

    describe('printSessionSummary', () => {
        beforeAll(() => {
            MOCK_PROMPT.print = jest.fn();
            MOCK_PROMPT.success = jest.fn();
            MOCK_PROMPT.divider = jest.fn();
            mockRootLogger.writeFileOnly = jest.fn();
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
