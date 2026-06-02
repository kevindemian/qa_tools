import { jest } from '@jest/globals';

export class Logger {
    context: Record<string, unknown> = {};
    _logDir: string | null = null;
    _filePathCached: string | null = null;
    _fileError = false;
    _bytesWritten = 0;
    _maxLogSize = 1048576;
    _config: unknown = null;

    constructor(context?: Record<string, unknown>) {
        if (context) this.context = context;
    }

    child = jest.fn<(extra: Record<string, unknown>) => Logger>().mockReturnValue(this);
    writeFileOnly = jest.fn<(level: string, msg: string) => void>();
    debug = jest.fn<(msg: string, data?: unknown) => void>();
    info = jest.fn<(msg: string, data?: unknown) => void>();
    warn = jest.fn<(msg: string, data?: unknown) => void>();
    error = jest.fn<(msg: string, data?: unknown) => void>();

    get filePath(): string | null {
        return this._filePathCached;
    }
}

export const rootLogger = new Logger();

export const maskDeep = jest.fn<(obj: unknown) => unknown>().mockImplementation((obj: unknown) => obj);
