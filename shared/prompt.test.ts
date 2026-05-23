const mockRootLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    writeFileOnly: jest.fn(),
    filePath: undefined as string | undefined,
};

jest.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: class {
        info = jest.fn();
        error = jest.fn();
        warn = jest.fn();
        debug = jest.fn();
        writeFileOnly = jest.fn();
    },
}));

import * as promptModule from './prompt';

describe('Prompt', () => {
    let prompt: typeof import('./prompt');
    let mockLog: jest.SpyInstance, mockError: jest.SpyInstance, mockWarn: jest.SpyInstance;

    beforeAll(() => {
        prompt = promptModule;
    });

    beforeEach(() => {
        mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
        mockError = jest.spyOn(console, 'error').mockImplementation(() => {});
        mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        process.stdout.isTTY = false;
        delete process.env.QUIET;
    });

    afterEach(() => {
        mockLog.mockRestore();
        mockError.mockRestore();
        mockWarn.mockRestore();
        process.stdout.isTTY = false;
    });

    describe('success', () => {
        it('logs with green OK prefix', () => {
            prompt.success('Operacao concluida');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('OK'));
        });

        it('does not log to console when QUIET=true', () => {
            process.env.QUIET = 'true';
            prompt.success('Silenciada');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('always logs via writeFileOnly even when quiet', () => {
            process.env.QUIET = 'true';
            prompt.success('Logada mesmo quiet');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('INFO', 'Logada mesmo quiet');
        });

        it('uses unicode icon when isTTY=true and not quiet', () => {
            process.stdout.isTTY = true;
            prompt.success('Unicode');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('\u2713'));
        });
    });

    describe('error', () => {
        it('logs with red ERR prefix', () => {
            prompt.error('Falha na operacao');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('ERR'));
        });
        it('also logs via writeFileOnly ERROR', () => {
            prompt.error('Algo deu errado');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('ERROR', 'Algo deu errado');
        });
    });

    describe('warn', () => {
        it('logs with yellow ! prefix', () => {
            prompt.warn('Aviso importante');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('!'));
        });
    });

    describe('info', () => {
        it('logs with cyan i prefix when not quiet', () => {
            prompt.info('Mensagem info');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('i'));
        });

        it('does not log to console when QUIET=true', () => {
            process.env.QUIET = 'true';
            prompt.info('Silenciada');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('always logs via writeFileOnly even when quiet', () => {
            process.env.QUIET = 'true';
            prompt.info('Logada mesmo quiet');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('INFO', 'Logada mesmo quiet');
        });
    });

    describe('helpLine', () => {
        it('logs with cyan i prefix regardless of quiet mode', () => {
            process.env.QUIET = 'true';
            prompt.helpLine('Ajuda');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Ajuda'));
        });

        it('logs via writeFileOnly HELP', () => {
            process.env.QUIET = 'true';
            prompt.helpLine('HELP text');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('HELP', 'HELP text');
        });
    });

    describe('isQuiet', () => {
        it('returns false when QUIET is not set', () => {
            expect(prompt.isQuiet()).toBe(false);
        });

        it('returns true when QUIET=true', () => {
            process.env.QUIET = 'true';
            expect(prompt.isQuiet()).toBe(true);
        });
    });

    describe('title', () => {
        it('logs bold text', () => {
            prompt.title('TITULO');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TITULO'));
        });
    });

    describe('divider', () => {
        it('logs a line of dashes', () => {
            prompt.divider();
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('─'));
        });
    });

    describe('printSummary', () => {
        it('shows success when all pass', () => {
            prompt.printSummary([{ status: 'ok', label: 't1', message: '' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TUDO CERTO!'));
        });

        it('shows partial when some fail', () => {
            prompt.printSummary([
                { status: 'ok', label: 't1', message: '' },
                { status: 'error', label: 't2', message: 'Falhou' },
            ]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Falhou'));
        });

        it('shows log path when filePath is set and some fail', () => {
            mockRootLogger.filePath = '/tmp/qa-tools.log';
            prompt.printSummary([{ status: 'error', label: 't1', message: 'erro' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Consulte o log'));
            mockRootLogger.filePath = undefined;
        });
    });

    describe('ProgressBar', () => {
        let dateNowSpy: jest.SpyInstance;

        beforeEach(() => {
            dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(0);
        });

        afterEach(() => {
            dateNowSpy.mockRestore();
        });

        it('creates bar with correct width', () => {
            const bar = new prompt.ProgressBar(10, { width: 20 });
            expect(bar.total).toBe(10);
            expect(bar.width).toBe(20);
        });

        it('renders full bar in non-TTY output', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.update(10);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('100%'));
        });

        it('renders empty bar in non-TTY output', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.update(0);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('0%'));
        });

        it('renders partial bar in non-TTY output', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.update(5);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('50%'));
        });

        it('shows ? ETA in non-TTY mode', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            dateNowSpy.mockReturnValue(3000);
            bar.startTime = 0;
            bar.update(0);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('0%'));
        });

        it('writes TTY bar format to process.stdout when isTTY=true', () => {
            process.stdout.isTTY = true;
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.update(5);
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('█'));
            writeSpy.mockRestore();
        });

        it('writes TTY bar with ETA when isTTY=true and elapsed > 0', () => {
            process.stdout.isTTY = true;
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const bar = new prompt.ProgressBar(10, { width: 5 });
            dateNowSpy.mockReturnValue(3000);
            bar.startTime = 0;
            bar.update(5);
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('s'));
            writeSpy.mockRestore();
        });

        it('stop clears line when isTTY=true', () => {
            process.stdout.isTTY = true;
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.stop();
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('\r'));
            writeSpy.mockRestore();
        });
    });

    describe('Spinner', () => {
        it('start/stop does not throw', () => {
            const spinner = new prompt.Spinner();
            expect(() => spinner.start('working')).not.toThrow();
            expect(() => spinner.stop()).not.toThrow();
        });

        it('start is noop when QUIET=true', () => {
            process.env.QUIET = 'true';
            const spinner = new prompt.Spinner();
            const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            spinner.start('quiet test');
            expect(spy).toHaveBeenCalledWith('quiet test...\n');
            spy.mockRestore();
        });
    });

    describe('withSpinner', () => {
        it('executes fn and returns result when QUIET=true', async () => {
            process.env.QUIET = 'true';
            const result = await prompt.withSpinner('label', () => Promise.resolve(42));
            expect(result).toBe(42);
        });

        it('executes fn and returns result when QUIET=false', async () => {
            const result = await prompt.withSpinner('label', () => Promise.resolve('ok'));
            expect(result).toBe('ok');
        });
    });

    describe('humanizeError', () => {
        it('returns known error for rate limit', () => {
            const result = prompt.humanizeError('rate limit exceeded')!;
            expect(result.msg).toContain('Rate limit');
        });

        it('returns known error for 403/permission', () => {
            const result = prompt.humanizeError('permission denied')!;
            expect(result.msg).toContain('Sem permissão');
        });

        it('returns known error for 401/unauthorized', () => {
            const result = prompt.humanizeError('401 unauthorized')!;
            expect(result.msg).toContain('Token inválido');
        });

        it('returns known error for connection issues', () => {
            const result = prompt.humanizeError('ECONNREFUSED')!;
            expect(result.msg).toContain('Erro de conexão');
        });

        it('returns null for unknown errors', () => {
            expect(prompt.humanizeError('some random error')).toBeNull();
        });

        it('returns unknown for null/empty', () => {
            const r = prompt.humanizeError('');
            expect(r && r.msg).toBe('Erro desconhecido');
        });
    });

    describe('extractErrorMessage', () => {
        it('extracts from axios error response', () => {
            const err = { response: { data: { errorMessages: ['Issue not found'] } } };
            expect(prompt.extractErrorMessage(err)).toBe('Issue not found');
        });

        it('extracts from err.message', () => {
            expect(prompt.extractErrorMessage(new Error('simple error'))).toBe('simple error');
        });

        it('extracts data when response.data is a string', () => {
            const err = { response: { data: 'rate limit exceeded' } };
            expect(prompt.extractErrorMessage(err)).toBe('rate limit exceeded');
        });

        it('returns unknown for null', () => {
            expect(prompt.extractErrorMessage(null)).toBe('Erro desconhecido');
        });

        it('returns unknown when error access throws', () => {
            const throwingErr = {};
            Object.defineProperty(throwingErr, 'response', {
                get() {
                    throw new Error('access error');
                },
            });
            expect(prompt.extractErrorMessage(throwingErr)).toBe('Erro desconhecido');
        });
    });

    describe('showSelect', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('uses fallback when not TTY', async () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
                { name: '3', value: '3' },
            ]);
            expect(result).toBe('2');
            expect(spy).toHaveBeenCalled();
        });

        it('handles separator in fallback', async () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = await prompt.showSelect('With sep', [
                { name: '1', value: '1' },
                { type: 'separator', line: '---' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('2');
            expect(spy).toHaveBeenCalled();
        });

        it('returns "0" for empty input in fallback', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('0');
        });

        it('returns selected value for numeric input in fallback', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = await prompt.showSelect('Test', [
                { name: 'One', value: '1v' },
                { name: 'Two', value: '2v' },
            ]);
            expect(result).toBe('1v');
        });

        it('returns value from name when value is missing', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = await prompt.showSelect('Test', [{ name: 'Alpha' }, { name: 'Beta' }]);
            expect(result).toBe('Alpha');
        });

        it('returns "0" for zero input in fallback', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('0');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('0');
        });

        it('loops on invalid number in fallback', async () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValueOnce('999').mockReturnValueOnce('1');
            const result = await prompt.showSelect('Test', [{ name: 'A', value: 'a' }]);
            expect(result).toBe('a');
            expect(spy).toHaveBeenCalledTimes(2);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Opção inválida'));
        });
    });

    describe('prompt', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('returns answer on first prompt', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('my-answer');
            const result = prompt.prompt('Enter value');
            expect(result).toBe('my-answer');
        });

        it('includes hint in prompt text when provided', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('ok');
            prompt.prompt('Label', { hint: 'optional' });
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('optional'), expect.any(Object));
        });

        it('includes default value in prompt text when provided', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('ok');
            prompt.prompt('Label', { default: 'def' });
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('def'), { defaultInput: 'def' });
        });

        it('retries when answer is shorter than minLength', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValueOnce('ab').mockReturnValueOnce('abcdef');
            const result = prompt.prompt('Label', { minLength: 5 });
            expect(result).toBe('abcdef');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Mínimo de'));
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('smartPrompt', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('returns value on first attempt', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('my-value');
            const result = prompt.smartPrompt('Enter value');
            expect(result).toBe('my-value');
        });

        it('calls helpCallback on /help and retries', () => {
            const helpCb = jest.fn();
            jest.spyOn(readlineSync, 'question').mockReturnValueOnce('/help').mockReturnValueOnce('final-value');
            const result = prompt.smartPrompt('Enter', {}, helpCb);
            expect(helpCb).toHaveBeenCalledTimes(1);
            expect(result).toBe('final-value');
        });

        it('returns empty after max retries with empty input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = prompt.smartPrompt('Enter', { maxRetries: 2 });
            expect(result).toBe('');
        });

        it('returns /back navigation command immediately', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/back');
            const result = prompt.smartPrompt('Enter');
            expect(result).toBe('/back');
        });

        it('returns /exit navigation command immediately', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/exit');
            const result = prompt.smartPrompt('Enter');
            expect(result).toBe('/exit');
        });

        it('returns /menu navigation command immediately', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/menu');
            const result = prompt.smartPrompt('Enter');
            expect(result).toBe('/menu');
        });

        it('allows unlimited /help and returns on valid input', () => {
            const helpCb = jest.fn();
            jest.spyOn(readlineSync, 'question')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('final-value');
            const result = prompt.smartPrompt('Enter', {}, helpCb);
            expect(result).toBe('final-value');
            expect(helpCb).toHaveBeenCalledTimes(3);
        });
    });

    describe('confirm', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('returns true for y input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('y');
            expect(prompt.confirm('Continue?', true)).toBe(true);
        });

        it('accepts yes and sim as confirmation', () => {
            jest.spyOn(readlineSync, 'question')
                .mockReturnValueOnce('yes')
                .mockReturnValueOnce('sim')
                .mockReturnValueOnce('Y')
                .mockReturnValueOnce('s');
            expect(prompt.confirm('?', false)).toBe(true);
            expect(prompt.confirm('?', false)).toBe(true);
            expect(prompt.confirm('?', false)).toBe(true);
            expect(prompt.confirm('?', false)).toBe(true);
        });

        it('returns false for n input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('n');
            expect(prompt.confirm('Continue?', false)).toBe(false);
        });

        it('loops on invalid input until valid', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValueOnce('x').mockReturnValueOnce('y');
            expect(prompt.confirm('Continue?', false)).toBe(true);
            expect(spy).toHaveBeenCalledTimes(2);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Resposta inválida'));
        });
    });

    describe('printError', () => {
        it('calls error with known humanized message', () => {
            const testErr = { response: { data: { errorMessages: ['rate limit exceeded'] } } };
            prompt.printError('Contexto', testErr);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Rate limit'));
        });

        it('calls error with unknown fallback when error has no message', () => {
            const testErr = { response: { data: {} } };
            prompt.printError('Contexto', testErr);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Erro desconhecido'));
        });

        it('calls error with raw error message when not humanized', () => {
            const testErr = new Error('something weird');
            prompt.printError('Contexto', testErr);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('something weird'));
        });
    });

    describe('tableView', () => {
        it('prints table with all columns by default', () => {
            prompt.tableView([{ a: 1, b: 2 }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('a'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('b'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('1'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('2'));
        });

        it('filters columns when specified', () => {
            prompt.tableView([{ a: 1, b: 2, c: 3 }], ['a', 'c']);
            const output = mockLog.mock.calls.map((c) => c[0]).join(' ');
            expect(output).toContain('a');
            expect(output).toContain('c');
            expect(output).not.toContain('b');
        });

        it('does not throw on empty data', () => {
            expect(() => prompt.tableView([])).not.toThrow();
        });
    });

    describe('onError', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
            delete process.env.AUTO_CONFIRM;
            delete process.env.ON_ERROR;
        });

        it('returns "skip" when autoConfirm and autoAction is skip', async () => {
            process.env.AUTO_CONFIRM = 'true';
            process.env.ON_ERROR = 'skip';
            const result = await prompt.onError('ctx', new Error('fail'), { retry: true });
            expect(result).toBe('skip');
        });

        it('returns "abort" when autoConfirm and autoAction is abort', async () => {
            process.env.AUTO_CONFIRM = 'true';
            process.env.ON_ERROR = 'abort';
            const result = await prompt.onError('ctx', new Error('fail'));
            expect(result).toBe('abort');
        });

        it('returns "abort" when user chooses A', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('a');
            const result = await prompt.onError('ctx', new Error('fail'));
            expect(result).toBe('abort');
        });

        it('returns "skip" when user chooses S', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('s');
            const result = await prompt.onError('ctx', new Error('fail'));
            expect(result).toBe('skip');
        });

        it('returns "retry" when user chooses R with canRetry', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('r');
            const result = await prompt.onError('ctx', new Error('fail'), { retry: true });
            expect(result).toBe('retry');
        });

        it('shows details and loops when user chooses D with canDetails', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValueOnce('d').mockReturnValueOnce('a');
            const err = {
                response: { status: 400, data: { detail: 'invalid' } },
                message: 'bad request',
            };
            const result = await prompt.onError('ctx', err, { details: true });
            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('400'));
        });

        it('shows error with stack details when err is Error', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValueOnce('d').mockReturnValueOnce('a');
            const result = await prompt.onError('ctx', new Error('detail-error'), { details: true });
            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Stack'));
        });

        it('warns on invalid option and retries', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValueOnce('x').mockReturnValueOnce('a');
            const result = await prompt.onError('ctx', new Error('fail'));
            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Opção inválida'));
        });
    });

    describe('print', () => {
        it('calls console.log with the message', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
            prompt.print('Hello');
            expect(spy).toHaveBeenCalledWith('Hello');
            spy.mockRestore();
        });
    });
});
