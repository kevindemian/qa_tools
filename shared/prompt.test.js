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
});
