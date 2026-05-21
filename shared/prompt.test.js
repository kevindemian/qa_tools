const mockRootLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn(), writeFileOnly: jest.fn() };

jest.mock('./logger', () => ({
  rootLogger: mockRootLogger,
  Logger: function() { this.info = jest.fn(); this.error = jest.fn(); this.warn = jest.fn(); this.debug = jest.fn(); this.writeFileOnly = jest.fn(); }
}));

describe('Prompt', () => {
  let prompt;
  let mockLog, mockError, mockWarn;

  beforeAll(() => {
    prompt = require('./prompt');
  });

  beforeEach(() => {
    mockLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    delete process.env.QUIET;
  });

  afterEach(() => {
    mockLog.mockRestore();
    mockError.mockRestore();
    mockWarn.mockRestore();
  });

  describe('success', () => {
    it('logs with green OK prefix', () => {
      prompt.success('Operacao concluida');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('OK')
      );
    });
  });

  describe('error', () => {
    it('logs with red ERR prefix', () => {
      prompt.error('Falha na operacao');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('ERR')
      );
    });
    it('also logs via writeFileOnly ERROR', () => {
      prompt.error('Algo deu errado');
      expect(mockRootLogger.writeFileOnly).toHaveBeenCalledWith('ERROR', 'Algo deu errado');
    });
  });

  describe('warn', () => {
    it('logs with yellow ! prefix', () => {
      prompt.warn('Aviso importante');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('!')
      );
    });
  });

  describe('info', () => {
    it('logs with cyan i prefix when not quiet', () => {
      prompt.info('Mensagem info');
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('i')
      );
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
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('-'));
    });
  });

  describe('printSummary', () => {
    it('shows success when all pass', () => {
      prompt.printSummary([{ status: 'ok', label: 't1', message: '' }]);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('TUDO CERTO!')
      );
    });

    it('shows partial when some fail', () => {
      prompt.printSummary([
        { status: 'ok', label: 't1', message: '' },
        { status: 'error', label: 't2', message: 'Falhou' },
      ]);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('OPERACAO PARCIAL')
      );
    });
  });

  describe('ProgressBar', () => {
    it('creates bar with correct width', () => {
      const bar = new prompt.ProgressBar(10, { width: 20 });
      expect(bar.total).toBe(10);
      expect(bar.width).toBe(20);
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
      const spy = jest.spyOn(process.stdout, 'write').mockImplementation(() => {});
      spinner.start('quiet test');
      expect(spy).toHaveBeenCalledWith('quiet test...\n');
      spy.mockRestore();
    });
  });

  describe('humanizeError', () => {
    it('returns known error for rate limit', () => {
      const result = prompt.humanizeError('rate limit exceeded');
      expect(result.msg).toContain('Rate limit');
    });

    it('returns known error for 403/permission', () => {
      const result = prompt.humanizeError('permission denied');
      expect(result.msg).toContain('Sem permissao');
    });

    it('returns known error for 401/unauthorized', () => {
      const result = prompt.humanizeError('401 unauthorized');
      expect(result.msg).toContain('Token invalido');
    });

    it('returns known error for connection issues', () => {
      const result = prompt.humanizeError('ECONNREFUSED');
      expect(result.msg).toContain('Erro de conexao');
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

    it('returns unknown for null', () => {
      expect(prompt.extractErrorMessage(null)).toBe('Erro desconhecido');
    });
  });

  describe('showSelect', () => {
    let readlineSync;

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
      const spy = jest.spyOn(readlineSync, 'question').mockReturnValue('3');
      const result = await prompt.showSelect('With sep', [
        { name: '1', value: '1' },
        { type: 'separator', line: '---' },
        { name: '2', value: '2' },
      ]);
      expect(result).toBe('3');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('smartPrompt', () => {
    let readlineSync;

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
      jest.spyOn(readlineSync, 'question')
        .mockReturnValueOnce('/help')
        .mockReturnValueOnce('final-value');
      const result = prompt.smartPrompt('Enter', {}, helpCb);
      expect(helpCb).toHaveBeenCalledTimes(1);
      expect(result).toBe('final-value');
    });

    it('returns empty after max retries with empty input', () => {
      jest.spyOn(readlineSync, 'question').mockReturnValue('');
      const result = prompt.smartPrompt('Enter', { maxRetries: 2 });
      expect(result).toBe('');
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
    let readlineSync;

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

    it('returns false for n input', () => {
      jest.spyOn(readlineSync, 'question').mockReturnValue('n');
      expect(prompt.confirm('Continue?', false)).toBe(false);
    });
  });

  describe('printError', () => {
    it('calls error with known humanized message', () => {
      const testErr = { response: { data: { errorMessages: ['rate limit exceeded'] } } };
      prompt.printError('Contexto', testErr);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit')
      );
    });

    it('calls error with unknown fallback when error has no message', () => {
      const testErr = { response: { data: {} } };
      prompt.printError('Contexto', testErr);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('Erro desconhecido')
      );
    });

    it('calls error with raw error message when not humanized', () => {
      const testErr = new Error('something weird');
      prompt.printError('Contexto', testErr);
      expect(mockLog).toHaveBeenCalledWith(
        expect.stringContaining('something weird')
      );
    });
  });

  describe('tableView', () => {
    it('calls console.table with all columns by default', () => {
      const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
      prompt.tableView([{ a: 1, b: 2 }]);
      expect(spy).toHaveBeenCalledWith([{ a: 1, b: 2 }]);
      spy.mockRestore();
    });

    it('filters columns when specified', () => {
      const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
      prompt.tableView([{ a: 1, b: 2, c: 3 }], ['a', 'c']);
      expect(spy).toHaveBeenCalledWith([{ a: 1, c: 3 }]);
      spy.mockRestore();
    });

    it('does not throw on empty data', () => {
      const spy = jest.spyOn(console, 'table').mockImplementation(() => {});
      expect(() => prompt.tableView([])).not.toThrow();
      spy.mockRestore();
    });
  });
});
