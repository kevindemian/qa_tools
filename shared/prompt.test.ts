import { createMockRootLogger } from './test-utils';

const mockRootLogger = createMockRootLogger();

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

const mockSingleBar = { start: jest.fn(), update: jest.fn(), stop: jest.fn() };

jest.mock('cli-progress', () => ({
    SingleBar: jest.fn(() => mockSingleBar),
    Presets: {
        shades_classic: {},
    },
}));

import Config from './config';
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
        prompt.__setConfig(Config.create({}));
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
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.success('Silenciada');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('always logs via writeFileOnly even when quiet', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
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
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.info('Silenciada');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('always logs via writeFileOnly even when quiet', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.info('Logada mesmo quiet');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('INFO', 'Logada mesmo quiet');
        });
    });

    describe('helpLine', () => {
        it('does not log to console when QUIET=true', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.helpLine('Ajuda');
            expect(mockLog).not.toHaveBeenCalled();
        });

        it('logs to console when not quiet', () => {
            prompt.helpLine('Ajuda');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Ajuda'));
        });

        it('logs via writeFileOnly HELP even when quiet', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.helpLine('HELP text');
            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('HELP', 'HELP text');
        });
    });

    describe('isQuiet', () => {
        it('returns false when QUIET is not set', () => {
            expect(prompt.isQuiet()).toBe(false);
        });

        it('returns true when QUIET=true', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            expect(prompt.isQuiet()).toBe(true);
        });
    });

    describe('title', () => {
        beforeEach(() => {
            prompt.__setConfig(Config.create({}));
        });

        it('logs bold text', () => {
            prompt.title('TITULO');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TITULO'));
        });

        it('logs plain text when QUIET=true', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.title('Quieto');
            expect(mockLog).toHaveBeenCalledWith('--- Quieto ---');
        });
    });

    describe('divider', () => {
        it('logs a line of dashes', () => {
            prompt.divider();
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('─'));
        });
    });

    describe('badge', () => {
        it('returns formatted ok badge', () => {
            const result = prompt.badge(5, 'passed', 'ok');
            expect(result).toContain('●');
            expect(result).toContain('5');
            expect(result).toContain('passed');
        });

        it('returns formatted error badge', () => {
            const result = prompt.badge(1, 'failed', 'error');
            expect(result).toContain('●');
            expect(result).toContain('1');
            expect(result).toContain('failed');
        });

        it('returns formatted info badge with open circle', () => {
            const result = prompt.badge(2, 'skipped', 'info');
            expect(result).toContain('○');
            expect(result).toContain('2');
            expect(result).toContain('skipped');
        });
    });

    describe('printSummary', () => {
        beforeEach(() => {
            prompt.__setConfig(Config.create({}));
            mockRootLogger.filePath = undefined;
        });

        it('shows success when all pass', () => {
            prompt.printSummary([{ status: 'ok', label: 't1', message: '' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TUDO CERTO!'));
        });

        it('shows pass rate percentage', () => {
            prompt.printSummary([{ status: 'ok', label: 't1', message: '' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('100% pass rate'));
        });

        it('shows Test Execution link when provided', () => {
            prompt.printSummary([{ status: 'ok', label: 't1', message: '' }], 'TEST-130');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Test Execution'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TEST-130'));
        });

        it('shows partial when some fail', () => {
            prompt.printSummary([
                { status: 'ok', label: 't1', message: '' },
                { status: 'error', label: 't2', message: 'Falhou' },
            ]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Falhou'));
        });

        it('shows correct pass rate when some fail', () => {
            prompt.printSummary([
                { status: 'ok', label: 't1', message: '' },
                { status: 'error', label: 't2', message: 'Falhou' },
            ]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('50% pass rate'));
        });

        it('shows log path when filePath is set and some fail', () => {
            mockRootLogger.filePath = '/tmp/qa-tools.log';
            prompt.printSummary([{ status: 'error', label: 't1', message: 'erro' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Consulte o log'));
        });

        it('shows compact when QUIET=true and all pass', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.printSummary([{ status: 'ok', label: 't1', message: '' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('TUDO CERTO!'));
        });

        it('shows error details when QUIET=true and some fail', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.printSummary([
                { status: 'ok', label: 't1', message: '' },
                { status: 'error', label: 't2', message: 'Falhou' },
            ]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('PARCIAL'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Falhou'));
        });

        it('shows log path in quiet error mode when filePath set', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            mockRootLogger.filePath = '/tmp/qa-tools.log';
            prompt.printSummary([{ status: 'error', label: 't1', message: 'erro' }]);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Consulte o log'));
        });
    });

    describe('ProgressBar', () => {
        it('tracks current value', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            expect(bar.current).toBe(0);
            bar.update(3);
            expect(bar.current).toBe(3);
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

        it('stops with current at 0', () => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.stop();
            expect(bar.current).toBe(0);
        });

        describe('TTY mode', () => {
            beforeEach(() => {
                process.stdout.isTTY = true;
                mockSingleBar.start.mockClear();
                mockSingleBar.update.mockClear();
                mockSingleBar.stop.mockClear();
            });

            it('constructs SingleBar with format config', () => {
                const bar = new prompt.ProgressBar(100, { width: 30 });
                const cliProgress = require('cli-progress');
                expect(cliProgress.SingleBar).toHaveBeenCalledWith(
                    expect.objectContaining({
                        format: expect.stringContaining('{bar}'),
                        barsize: 30,
                    }),
                    cliProgress.Presets.shades_classic,
                );
                expect(mockSingleBar.start).toHaveBeenCalledWith(100, 0);
            });

            it('calls bar.update in TTY mode', () => {
                const bar = new prompt.ProgressBar(100);
                bar.update(50);
                expect(mockSingleBar.update).toHaveBeenCalledWith(50);
            });

            it('calls bar.stop in TTY mode', () => {
                const bar = new prompt.ProgressBar(100);
                bar.stop();
                expect(mockSingleBar.stop).toHaveBeenCalled();
            });
        });
    });

    describe('withSpinner', () => {
        let mockOra: ReturnType<typeof injectOraMock>;

        beforeEach(() => {
            mockOra = injectOraMock();
        });

        afterEach(() => {
            promptModule.__setOraDep(null);
        });

        it('executes fn and returns result when QUIET=true', async () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            const result = await prompt.withSpinner('label', () => Promise.resolve(42));
            expect(result).toBe(42);
        });

        it('executes fn and returns result when QUIET=false', async () => {
            const result = await prompt.withSpinner('label', () => Promise.resolve('ok'));
            expect(result).toBe('ok');
        });

        it('shows spinner when TTY mode', async () => {
            process.stdout.isTTY = true;
            const result = await prompt.withSpinner('loading...', () => Promise.resolve('done'));
            expect(result).toBe('done');
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

        it('returns known error for issue type not found', () => {
            const result = prompt.humanizeError('Issue type not found')!;
            expect(result.msg).toContain('Tipo de issue');
        });

        it('returns known error for field not found', () => {
            const result = prompt.humanizeError('Field customfield_123 not found')!;
            expect(result.msg).toContain('Campo não encontrado');
        });

        it('returns known error for project not found', () => {
            const result = prompt.humanizeError('Project PROJ not found')!;
            expect(result.msg).toContain('Projeto não encontrado');
        });

        it('returns known error for version not found', () => {
            const result = prompt.humanizeError('version not found')!;
            expect(result.msg).toContain('Versão não encontrada');
        });

        it('returns known error for already exists', () => {
            const result = prompt.humanizeError('already exists')!;
            expect(result.msg).toContain('Item ja existe');
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

    function injectInputMock(): { default: jest.Mock } {
        const mock = { default: jest.fn().mockResolvedValue('input-value') };
        promptModule.__setInputMod(mock);
        return mock;
    }

    function injectConfirmMock(): { default: jest.Mock } {
        const mock = { default: jest.fn().mockResolvedValue(true) };
        promptModule.__setConfirmMod(mock);
        return mock;
    }

    function injectOraMock(): { start: jest.Mock; stop: jest.Mock; succeed: jest.Mock; fail: jest.Mock } {
        const inst = { start: jest.fn().mockReturnThis(), stop: jest.fn(), succeed: jest.fn(), fail: jest.fn() };
        const ctr = jest.fn(() => inst);
        promptModule.__setOraDep(ctr);
        return inst;
    }

    describe('showSelect', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('selects by number', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
                { name: '3', value: '3' },
            ]);
            expect(result).toBe('2');
            expect(spy).toHaveBeenCalled();
        });

        it('handles separator', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = prompt.showSelect('With sep', [
                { name: '1', value: '1' },
                { type: 'separator', line: '---' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('2');
            expect(spy).toHaveBeenCalled();
        });

        it('returns "0" for empty input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('0');
        });

        it('returns selected value for numeric input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = prompt.showSelect('Test', [
                { name: 'One', value: '1v' },
                { name: 'Two', value: '2v' },
            ]);
            expect(result).toBe('1v');
        });

        it('returns value from name when value is missing', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = prompt.showSelect('Test', [{ name: 'Alpha' }, { name: 'Beta' }]);
            expect(result).toBe('Alpha');
        });

        it('returns "0" for zero input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('0');
            const result = prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);
            expect(result).toBe('0');
        });

        it('returns raw value for non-numeric input', () => {
            const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('criar');
            const result = prompt.showSelect('Test', [{ name: '1', value: '1' }]);
            expect(result).toBe('criar');
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

        it('returns null after max retries with empty input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = prompt.smartPrompt('Enter', { maxRetries: 2 });
            expect(result).toBeNull();
        });

        it('returns null-like for aborted input', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = prompt.smartPrompt('Enter', { maxRetries: 1 });
            expect(result == null).toBe(true);
        });

        it('throws CancelError for /back navigation command', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/back');
            expect(() => prompt.smartPrompt('Enter')).toThrow(prompt.CancelError);
        });

        it('throws CancelError for /exit navigation command', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/exit');
            expect(() => prompt.smartPrompt('Enter')).toThrow(prompt.CancelError);
        });

        it('throws CancelError for /menu navigation command', () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('/menu');
            expect(() => prompt.smartPrompt('Enter')).toThrow(prompt.CancelError);
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

    describe('ask', () => {
        let mockInput: ReturnType<typeof injectInputMock>;
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        beforeEach(() => {
            mockInput = injectInputMock();
        });

        afterEach(() => {
            jest.restoreAllMocks();
            promptModule.__setInputMod(null);
        });

        it('uses inquirer when TTY mode', async () => {
            process.stdout.isTTY = true;
            const result = await promptModule.ask('Enter name', { default: 'John' });
            expect(result).toBe('input-value');
            expect(mockInput.default).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Enter name', default: 'John' }),
            );
        });

        it('falls back to readline-sync when inquirer throws', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('fallback');
            process.stdout.isTTY = true;
            mockInput.default.mockRejectedValueOnce(new Error('fail'));
            const result = await promptModule.ask('Label');
            expect(result).toBe('fallback');
        });

        it('uses readline-sync when not TTY', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('cli-value');
            const result = await promptModule.ask('Label');
            expect(result).toBe('cli-value');
        });

        it('attempts import when _inputMod is null with TTY', async () => {
            prompt.__setInputMod(null);
            process.stdout.isTTY = true;
            jest.spyOn(readlineSync, 'question').mockReturnValue('answer');
            const result = await promptModule.ask('Name');
            expect(result).toBe('answer');
        });
    });

    describe('askConfirm', () => {
        let mockConfirm: ReturnType<typeof injectConfirmMock>;
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        beforeEach(() => {
            mockConfirm = injectConfirmMock();
        });

        afterEach(() => {
            jest.restoreAllMocks();
            promptModule.__setConfirmMod(null);
        });

        it('uses inquirer when TTY mode', async () => {
            process.stdout.isTTY = true;
            const result = await promptModule.askConfirm('Proceed?', true);
            expect(result).toBe(true);
            expect(mockConfirm.default).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Proceed?', default: true }),
            );
        });

        it('falls back to readline-sync when inquirer throws', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('y');
            process.stdout.isTTY = true;
            mockConfirm.default.mockRejectedValueOnce(new Error('fail'));
            const result = await promptModule.askConfirm('?');
            expect(result).toBe(true);
        });

        it('uses readline-sync when not TTY', async () => {
            jest.spyOn(readlineSync, 'question').mockReturnValue('n');
            const result = await promptModule.askConfirm('?');
            expect(result).toBe(false);
        });

        it('attempts import when _confirmMod is null with TTY', async () => {
            prompt.__setConfirmMod(null);
            process.stdout.isTTY = true;
            jest.spyOn(readlineSync, 'question').mockReturnValue('y');
            const result = await promptModule.askConfirm('Proceed?');
            expect(result).toBe(true);
        });
    });

    describe('printError', () => {
        it('calls error with known humanized message', () => {
            const testErr = { response: { data: { errorMessages: ['rate limit exceeded'] } } };
            prompt.printError('Contexto', testErr);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Rate limit'));
        });

        it('shows hint for known error', () => {
            const testErr = { response: { data: { errorMessages: ['rate limit exceeded'] } } };
            prompt.printError('Contexto', testErr);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Aguarde'));
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

        it('uses quiet mode output when QUIET=true', () => {
            prompt.__setConfig(Config.create({ quiet: true }));
            prompt.printError('Contexto', new Error('fail'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('ERR'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Contexto'));
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

        it('returns undefined on empty data', () => {
            expect(prompt.tableView([])).toBeUndefined();
        });

        it('uses custom border chars in table output', () => {
            prompt.tableView([{ x: 1, y: 2 }]);
            const output = mockLog.mock.calls.map((c) => c[0]).join(' ');
            expect(output).toContain('┌');
            expect(output).toContain('┐');
            expect(output).toContain('└');
            expect(output).toContain('┘');
            expect(output).toContain('├');
            expect(output).toContain('┤');
            expect(output).toContain('┼');
        });

        it('colors status column cells by keyword', () => {
            prompt.tableView(
                [
                    { name: 't1', result: 'pass' },
                    { name: 't2', result: 'fail' },
                    { name: 't3', result: 'skip' },
                ],
                ['name', 'result'],
                'result',
            );
            const output = mockLog.mock.calls.map((c) => c[0]).join(' ');
            expect(output).toContain('pass');
            expect(output).toContain('fail');
            expect(output).toContain('skip');
        });

        it('handles null data gracefully', () => {
            expect(prompt.tableView(null)).toBeUndefined();
        });
    });

    describe('onError', () => {
        let readlineSync: typeof import('readline-sync');

        beforeAll(() => {
            readlineSync = require('readline-sync');
        });

        afterEach(() => {
            jest.restoreAllMocks();
            prompt.__setConfig(Config.create({}));
        });

        it('returns "skip" when autoConfirm and autoAction is skip', async () => {
            prompt.__setConfig(Config.create({ autoConfirm: true, onError: 'skip' }));
            const result = await prompt.onError('ctx', new Error('fail'), { retry: true });
            expect(result).toBe('skip');
        });

        it('returns "abort" when autoConfirm and autoAction is abort', async () => {
            prompt.__setConfig(Config.create({ autoConfirm: true, onError: 'abort' }));
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
