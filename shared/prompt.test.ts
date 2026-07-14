import os from 'os';
import path from 'path';
import type { Mock, MockInstance } from 'vitest';
import { nonNull } from './test-utils.js';
import readlineSync from 'readline-sync';

const mockRootLogger = vi.hoisted(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    writeFileOnly: vi.fn(),
    filePath: undefined as string | undefined,
}));

vi.mock('./logger', () => ({
    rootLogger: mockRootLogger,
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
        writeFileOnly = vi.fn();
    },
}));

const mockSingleBar = { start: vi.fn(), update: vi.fn(), stop: vi.fn() };

const { mockSingleBarCtor } = vi.hoisted(() => ({
    mockSingleBarCtor: vi.fn(function () {
        return mockSingleBar;
    }),
}));

vi.mock('cli-progress', () => ({
    default: {
        SingleBar: mockSingleBarCtor,
        Presets: { shades_classic: {} },
    },
    SingleBar: mockSingleBarCtor,
    Presets: { shades_classic: {} },
}));

vi.mock('@inquirer/input', () => ({ default: vi.fn().mockRejectedValue(new Error('mock fail')) }));
vi.mock('@inquirer/confirm', () => ({ default: vi.fn().mockResolvedValue(true) }));

import Config from './config.js';
import * as promptModule from './prompt.js';

describe('Prompt', () => {
    let prompt: typeof import('./prompt.js');
    let mockLog: MockInstance, mockError: MockInstance, mockWarn: MockInstance;

    beforeAll(() => {
        prompt = promptModule;
    });

    beforeEach(() => {
        mockLog = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        mockError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        mockWarn = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        process.stdout.isTTY = false;
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
        prompt.__setConfig(Config.create({}));
    });

    afterEach(() => {
        mockLog.mockRestore();
        mockError.mockRestore();
        mockWarn.mockRestore();
        process.stdout.isTTY = false;
        Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
    });

    describe('Success', () => {
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

    describe('Error', () => {
        it('logs with red ERR prefix', () => {
            prompt.error('Falha na operacao');

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('ERR'));
        });

        it('also logs via writeFileOnly ERROR', () => {
            prompt.error('Algo deu errado');

            expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('ERROR', 'Algo deu errado');
        });
    });

    describe('Warn', () => {
        it('logs with yellow ! prefix', () => {
            prompt.warn('Aviso importante');

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('!'));
        });
    });

    describe('Info', () => {
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

    describe('HelpLine', () => {
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

    describe('IsQuiet', () => {
        it('returns false when QUIET is not set', () => {
            expect(prompt.isQuiet()).toBeFalsy();
        });

        it('returns true when QUIET=true', () => {
            prompt.__setConfig(Config.create({ quiet: true }));

            expect(prompt.isQuiet()).toBeTruthy();
        });
    });

    describe('Title', () => {
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

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('--- Quieto ---'));
        });
    });

    describe('Divider', () => {
        it('logs a line of dashes', () => {
            prompt.divider();

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('─'));
        });
    });

    describe('Badge', () => {
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

    describe('PrintSummary', () => {
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
            mockRootLogger.filePath = path.join(os.tmpdir(), 'qa-qa-tools.log');
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
            mockRootLogger.filePath = path.join(os.tmpdir(), 'qa-qa-tools.log');
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

        it.each([
            { value: 10, expected: '100%', title: 'renders full bar in non-TTY output' },
            { value: 0, expected: '0%', title: 'renders empty bar in non-TTY output' },
            { value: 5, expected: '50%', title: 'renders partial bar in non-TTY output' },
        ])('$title', ({ value, expected }) => {
            const bar = new prompt.ProgressBar(10, { width: 5 });
            bar.update(value);

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining(expected));
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

            it('constructs SingleBar with format config', async () => {
                expect.hasAssertions();

                const bar = new prompt.ProgressBar(100, { width: 30 });

                expect(bar).toBeDefined();

                const cliProgressMod = await import('cli-progress');

                expect(vi.spyOn(cliProgressMod, 'SingleBar')).toHaveBeenCalledWith(
                    expect.objectContaining({ barsize: 30 }),
                    {},
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

                expect(mockSingleBar.stop).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('WithSpinner', () => {
        beforeEach(() => {
            injectOraMock();
        });

        afterEach(() => {
            promptModule.__setOraDep(null);
        });

        it('executes fn and returns result when QUIET=true', async () => {
            expect.hasAssertions();

            prompt.__setConfig(Config.create({ quiet: true }));
            const result = await prompt.withSpinner('label', () => Promise.resolve(42));

            expect(result).toBe(42);
        });

        it('executes fn and returns result when QUIET=false', async () => {
            expect.hasAssertions();

            const result = await prompt.withSpinner('label', () => Promise.resolve('ok'));

            expect(result).toBe('ok');
        });

        it('shows spinner when TTY mode', async () => {
            expect.hasAssertions();

            process.stdout.isTTY = true;
            const result = await prompt.withSpinner('loading...', () => Promise.resolve('done'));

            expect(result).toBe('done');
        });
    });

    describe('HumanizeError', () => {
        it('returns known error for rate limit', () => {
            const result = nonNull(prompt.humanizeError('rate limit exceeded'));

            expect(result.msg).toContain('Rate limit');
        });

        it('returns known error for 403/permission', () => {
            const result = nonNull(prompt.humanizeError('permission denied'));

            expect(result.msg).toContain('Sem permissão');
        });

        it('returns known error for 401/unauthorized', () => {
            const result = nonNull(prompt.humanizeError('401 unauthorized'));

            expect(result.msg).toContain('Token inválido');
        });

        it('returns known error for connection issues', () => {
            const result = nonNull(prompt.humanizeError('ECONNREFUSED'));

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
            const result = nonNull(prompt.humanizeError('Issue type not found'));

            expect(result.msg).toContain('Tipo de issue');
        });

        it('returns known error for field not found', () => {
            const result = nonNull(prompt.humanizeError('Field customfield_123 not found'));

            expect(result.msg).toContain('Campo não encontrado');
        });

        it('returns known error for project not found', () => {
            const result = nonNull(prompt.humanizeError('Project PROJ not found'));

            expect(result.msg).toContain('Projeto não encontrado');
        });

        it('returns known error for version not found', () => {
            const result = nonNull(prompt.humanizeError('version not found'));

            expect(result.msg).toContain('Versão não encontrada');
        });

        it('returns known error for already exists', () => {
            const result = nonNull(prompt.humanizeError('already exists'));

            expect(result.msg).toContain('Item ja existe');
        });
    });

    describe('ExtractErrorMessage', () => {
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

    function injectInputMock(): { default: Mock } {
        const mock = { default: vi.fn().mockResolvedValue('input-value') };
        promptModule.__setInputMod(mock);
        return mock;
    }

    function injectConfirmMock(): { default: Mock } {
        const mock = { default: vi.fn().mockResolvedValue(true) };
        promptModule.__setConfirmMod(mock);
        return mock;
    }

    function injectOraMock(): { start: Mock; stop: Mock; succeed: Mock; fail: Mock } {
        const inst = { start: vi.fn().mockReturnThis(), stop: vi.fn(), succeed: vi.fn(), fail: vi.fn() };
        const ctr = vi.fn(() => inst);
        promptModule.__setOraDep(ctr);
        return inst;
    }

    describe('ShowSelect', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('selects by number', async () => {
            expect.hasAssertions();

            const spy = vi.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
                { name: '3', value: '3' },
            ]);

            expect(result).toBe('2');
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('handles separator', async () => {
            expect.hasAssertions();

            const spy = vi.spyOn(readlineSync, 'question').mockReturnValue('2');
            const result = await prompt.showSelect('With sep', [
                { name: '1', value: '1' },
                { type: 'separator', line: '---' },
                { name: '2', value: '2' },
            ]);

            expect(result).toBe('2');
            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('returns "0" for empty input', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);

            expect(result).toBe('0');
        });

        it('returns selected value for numeric input', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = await prompt.showSelect('Test', [
                { name: 'One', value: '1v' },
                { name: 'Two', value: '2v' },
            ]);

            expect(result).toBe('1v');
        });

        it('returns value from name when value is missing', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('1');
            const result = await prompt.showSelect('Test', [{ name: 'Alpha' }, { name: 'Beta' }]);

            expect(result).toBe('Alpha');
        });

        it('returns "0" for zero input', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('0');
            const result = await prompt.showSelect('Test', [
                { name: '1', value: '1' },
                { name: '2', value: '2' },
            ]);

            expect(result).toBe('0');
        });

        it('returns raw value for non-numeric input', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('criar');
            const result = await prompt.showSelect('Test', [{ name: '1', value: '1' }]);

            expect(result).toBe('criar');
        });
    });

    describe('Prompt', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns answer on first prompt', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('my-answer');
            const result = prompt.prompt('Enter value');

            expect(result).toBe('my-answer');
        });

        it('includes hint in prompt text when provided', () => {
            const spy = vi.spyOn(readlineSync, 'question').mockReturnValue('ok');
            prompt.prompt('Label', { hint: 'optional' });

            expect(spy).toHaveBeenCalledWith(expect.stringContaining('optional'), expect.any(Object));
        });

        it('includes default value in prompt text when provided', () => {
            const spy = vi.spyOn(readlineSync, 'question').mockReturnValue('ok');
            prompt.prompt('Label', { default: 'def' });

            expect(spy).toHaveBeenCalledWith(expect.stringContaining('def'), { defaultInput: 'def' });
        });

        it('retries when answer is shorter than minLength', () => {
            const spy = vi.spyOn(readlineSync, 'question').mockReturnValueOnce('ab').mockReturnValueOnce('abcdef');
            const result = prompt.prompt('Label', { minLength: 5 });

            expect(result).toBe('abcdef');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Mínimo de'));
            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('SmartPrompt', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns value on first attempt', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('my-value');
            const result = await prompt.smartPrompt('Enter value');

            expect(result).toBe('my-value');
        });

        it('calls helpCallback on /help and retries', async () => {
            expect.hasAssertions();

            const helpCb = vi.fn();
            vi.spyOn(readlineSync, 'question').mockReturnValueOnce('/help').mockReturnValueOnce('final-value');
            const result = await prompt.smartPrompt('Enter', {}, helpCb);

            expect(helpCb).toHaveBeenCalledTimes(1);
            expect(result).toBe('final-value');
        });

        it('returns empty string after max retries with empty input', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('');
            const result = await prompt.smartPrompt('Enter', { maxRetries: 2 });

            expect(result).toBe('');
        });

        it.each([
            { command: '/back', title: 'throws CancelError for /back navigation command' },
            { command: '/exit', title: 'throws CancelError for /exit navigation command' },
            { command: '/menu', title: 'throws CancelError for /menu navigation command' },
        ])('$title', async ({ command }) => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue(command);

            await expect(prompt.smartPrompt('Enter')).rejects.toThrow(prompt.CancelError);
        });

        it('allows unlimited /help and returns on valid input', async () => {
            expect.hasAssertions();

            const helpCb = vi.fn();
            vi.spyOn(readlineSync, 'question')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('/help')
                .mockReturnValueOnce('final-value');
            const result = await prompt.smartPrompt('Enter', {}, helpCb);

            expect(result).toBe('final-value');
            expect(helpCb).toHaveBeenCalledTimes(3);
        });
    });

    describe('Confirm', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns true for y input', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('y');

            expect(prompt.confirm('Continue?', true)).toBeTruthy();
        });

        it('accepts yes and sim as confirmation', () => {
            vi.spyOn(readlineSync, 'question')
                .mockReturnValueOnce('yes')
                .mockReturnValueOnce('sim')
                .mockReturnValueOnce('Y')
                .mockReturnValueOnce('s');

            expect(prompt.confirm('?', false)).toBeTruthy();
            expect(prompt.confirm('?', false)).toBeTruthy();
            expect(prompt.confirm('?', false)).toBeTruthy();
            expect(prompt.confirm('?', false)).toBeTruthy();
        });

        it('returns false for n input', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('n');

            expect(prompt.confirm('Continue?', false)).toBeFalsy();
        });

        it('loops on invalid input until valid', () => {
            const spy = vi.spyOn(readlineSync, 'question').mockReturnValueOnce('x').mockReturnValueOnce('y');

            expect(prompt.confirm('Continue?', false)).toBeTruthy();
            expect(spy).toHaveBeenCalledTimes(2);
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Resposta inválida'));
        });
    });

    describe('Ask', () => {
        let mockInput: ReturnType<typeof injectInputMock>;

        beforeEach(() => {
            mockInput = injectInputMock();
        });

        afterEach(() => {
            vi.restoreAllMocks();
            promptModule.__setInputMod(null);
        });

        it('uses inquirer when TTY mode', async () => {
            expect.hasAssertions();

            process.stdout.isTTY = true;
            const result = await promptModule.ask('Enter name', { default: 'John' });

            expect(result).toBe('input-value');
            expect(mockInput.default).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Enter name', default: 'John' }),
            );
        });

        it('falls back to readline-sync when inquirer throws', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('fallback');
            process.stdout.isTTY = true;
            mockInput.default.mockRejectedValueOnce(new Error('fail'));
            const result = await promptModule.ask('Label');

            expect(result).toBe('fallback');
        });

        it('uses readline-sync when not TTY', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('cli-value');
            const result = await promptModule.ask('Label');

            expect(result).toBe('cli-value');
        });

        it('attempts import when _inputMod is null with TTY', async () => {
            expect.hasAssertions();

            prompt.__setInputMod(null);
            process.stdout.isTTY = true;
            vi.spyOn(readlineSync, 'question').mockReturnValue('answer');
            const result = await promptModule.ask('Name');

            expect(result).toBe('answer');
        });
    });

    describe('AskConfirm', () => {
        let mockConfirm: ReturnType<typeof injectConfirmMock>;

        beforeEach(() => {
            mockConfirm = injectConfirmMock();
        });

        afterEach(() => {
            vi.restoreAllMocks();
            promptModule.__setConfirmMod(null);
        });

        it('uses inquirer when TTY mode', async () => {
            expect.hasAssertions();

            process.stdout.isTTY = true;
            const result = await promptModule.askConfirm('Proceed?', true);

            expect(result).toBeTruthy();
            expect(mockConfirm.default).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Proceed?', default: true }),
            );
        });

        it('falls back to readline-sync when inquirer throws', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('y');
            process.stdout.isTTY = true;
            mockConfirm.default.mockRejectedValueOnce(new Error('fail'));
            const result = await promptModule.askConfirm('?');

            expect(result).toBeTruthy();
        });

        it('uses readline-sync when not TTY', async () => {
            expect.hasAssertions();

            vi.spyOn(readlineSync, 'question').mockReturnValue('n');
            const result = await promptModule.askConfirm('?');

            expect(result).toBeFalsy();
        });

        it('attempts import when _confirmMod is null with TTY', async () => {
            expect.hasAssertions();

            prompt.__setConfirmMod(null);
            process.stdout.isTTY = true;
            vi.spyOn(readlineSync, 'question').mockReturnValue('y');
            const result = await promptModule.askConfirm('Proceed?');

            expect(result).toBeTruthy();
        });
    });

    describe('PrintError', () => {
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

    describe('TableView', () => {
        it('prints table with all columns by default', () => {
            prompt.tableView([{ a: 1, b: 2 }]);

            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('a'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('b'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('1'));
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('2'));
        });

        it('filters columns when specified', () => {
            prompt.tableView([{ a: 1, b: 2, c: 3 }], ['a', 'c']);
            const output = mockLog.mock.calls.map((c) => c[0] as string).join(' ');

            expect(output).toContain('a');
            expect(output).toContain('c');
            expect(output).not.toContain('b');
        });

        it('returns undefined on empty data', () => {
            expect(prompt.tableView([])).toBeUndefined();
        });

        it('uses custom border chars in table output', () => {
            prompt.tableView([{ x: 1, y: 2 }]);
            const output = mockLog.mock.calls.map((c) => c[0] as string).join(' ');

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
            const output = mockLog.mock.calls.map((c) => c[0] as string).join(' ');

            expect(output).toContain('pass');
            expect(output).toContain('fail');
            expect(output).toContain('skip');
        });

        it('handles null data gracefully', () => {
            expect(prompt.tableView(null)).toBeUndefined();
        });
    });

    describe('OnError', () => {
        afterEach(() => {
            vi.restoreAllMocks();
            prompt.__setConfig(Config.create({}));
        });

        it('returns "skip" when autoConfirm and autoAction is skip', () => {
            prompt.__setConfig(Config.create({ autoConfirm: true, onError: 'skip' }));
            const result = prompt.onError('ctx', new Error('fail'), { retry: true });

            expect(result).toBe('skip');
        });

        it('returns "abort" when autoConfirm and autoAction is abort', () => {
            prompt.__setConfig(Config.create({ autoConfirm: true, onError: 'abort' }));
            const result = prompt.onError('ctx', new Error('fail'));

            expect(result).toBe('abort');
        });

        it('returns "abort" when user chooses A', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('a');
            const result = prompt.onError('ctx', new Error('fail'));

            expect(result).toBe('abort');
        });

        it('returns "skip" when user chooses S', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('s');
            const result = prompt.onError('ctx', new Error('fail'));

            expect(result).toBe('skip');
        });

        it('returns "retry" when user chooses R with canRetry', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValue('r');
            const result = prompt.onError('ctx', new Error('fail'), { retry: true });

            expect(result).toBe('retry');
        });

        it('shows details and loops when user chooses D with canDetails', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValueOnce('d').mockReturnValueOnce('a');
            const err = {
                response: { status: 400, data: { detail: 'invalid' } },
                message: 'bad request',
            };
            const result = prompt.onError('ctx', err, { details: true });

            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('400'));
        });

        it('shows error with stack details when err is Error', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValueOnce('d').mockReturnValueOnce('a');
            const result = prompt.onError('ctx', new Error('detail-error'), { details: true });

            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Stack'));
        });

        it('warns on invalid option and retries', () => {
            vi.spyOn(readlineSync, 'question').mockReturnValueOnce('x').mockReturnValueOnce('a');
            const result = prompt.onError('ctx', new Error('fail'));

            expect(result).toBe('abort');
            expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Opção inválida'));
        });
    });

    describe('Print', () => {
        it('calls process.stdout.write with the message', () => {
            const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            prompt.print('Hello');

            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Hello'));

            spy.mockRestore();
        });
    });
});
