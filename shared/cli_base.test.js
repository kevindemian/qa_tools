const mockRootLogger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };

jest.mock('./logger', () => ({
  rootLogger: mockRootLogger,
  Logger: function() { this.info = jest.fn(); this.error = jest.fn(); this.warn = jest.fn(); this.debug = jest.fn(); },
}));

describe('CLI Base', () => {
  let cliBase;
  let mockLog, mockError, mockWarn;

  const MOCK_PROMPT = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };

  beforeAll(() => {
    jest.mock('./prompt', () => MOCK_PROMPT);
    cliBase = require('./cli_base');
  });

  beforeEach(() => {
    jest.clearAllMocks();
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

    it('sets exitCode when required vars are missing', () => {
      delete process.env.TOKEN_A;
      delete process.env.TOKEN_B;
      const validate = cliBase.createValidateEnv(configs);
      validate();
      expect(process.exitCode).toBe(1);
      expect(MOCK_PROMPT.error).toHaveBeenCalledWith(
        expect.stringContaining('Variaveis obrigatorias')
      );
    });

    it('warns when real credentials are detected', () => {
      process.env.TOKEN_A = 'this-is-a-real-token-value-123456';
      process.env.TOKEN_B = 'another-real-credential-here-789';
      const validate = cliBase.createValidateEnv(configs);
      validate();
      expect(mockRootLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('VARIAVEL COM CREDENCIAL REAL')
      );
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
      const onSpy = jest.spyOn(process, 'on').mockImplementation(() => {});
      cliBase.setupSigint(null, () => {});
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      onSpy.mockRestore();
    });
  });
});
