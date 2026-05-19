let errorHandler;
const mockInstance = Object.assign(
  jest.fn(() => Promise.reject(new Error('still fails'))),
  {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn((success, error) => { errorHandler = error; }) },
    },
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  }
);

jest.mock('axios', () => ({ create: jest.fn(() => mockInstance) }));

describe('HTTP Client', () => {
  let httpClient;
  let axios;

  beforeAll(() => {
    httpClient = require('./http-client');
    axios = require('axios');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'setTimeout').mockImplementation(cb => {
      process.nextTick(cb);
      return 123;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createHttpClient', () => {
    it('creates axios instance with provided config', () => {
      const client = httpClient.createHttpClient({
        baseUrl: 'https://api.test.com',
        authHeader: { 'Authorization': 'Bearer token123' },
        timeout: 5000,
      });
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.test.com',
        timeout: 5000,
        httpsAgent: expect.any(Object),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token123',
        },
      });
    });

    it('registers response interceptor', () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('uses default timeout when not specified', () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 120000 })
      );
    });
  });

  describe('retry interceptor', () => {
    const makeError = (method, status, attempts) => ({
      message: 'Request failed',
      config: { method, __retryAttempts: attempts },
      response: { status },
      code: undefined,
    });

    it('retries GET up to 5 times', async () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      const err = makeError('get', 500, 0);
      mockInstance.mockImplementation(cfg =>
        errorHandler(makeError('get', 500, cfg.__retryAttempts))
      );
      try { await errorHandler(err); } catch (e) { }
      expect(mockInstance).toHaveBeenCalledTimes(5);
    });

    it('retries PUT up to 5 times', async () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      const err = makeError('put', 500, 0);
      mockInstance.mockImplementation(cfg =>
        errorHandler(makeError('put', 500, cfg.__retryAttempts))
      );
      try { await errorHandler(err); } catch (e) { }
      expect(mockInstance).toHaveBeenCalledTimes(5);
    });

    it('does not retry POST', async () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      const err = makeError('post', 500, 0);
      try { await errorHandler(err); } catch (e) { }
      expect(mockInstance).not.toHaveBeenCalled();
    });

    it('does not retry non-retryable errors (4xx)', async () => {
      httpClient.createHttpClient({ baseUrl: 'https://api.test.com' });
      const err = {
        message: 'Bad request',
        config: { method: 'get', __retryAttempts: 2 },
        response: { status: 400 },
        code: undefined,
      };
      try { await errorHandler(err); } catch (e) { }
      expect(mockInstance).not.toHaveBeenCalled();
    });
  });
});
