const realLogger = jest.requireActual('../logger');

export class Logger {
    constructor(_opts?: Record<string, unknown>) {}
    debug = jest.fn();
    info = jest.fn();
    warn = jest.fn();
    error = jest.fn();
    child = jest.fn().mockReturnValue({ info: jest.fn(), error: jest.fn(), warn: jest.fn() });
}
export const rootLogger = new Logger();
export const maskDeep = jest.fn().mockImplementation(realLogger.maskDeep);
