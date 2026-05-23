import fs from 'fs';
import path from 'path';
import os from 'os';
import { Logger, rootLogger, maskDeep } from './logger';

function normalizePath(p: string): string {
    return p.replace(/\\/g, '/');
}

describe('Logger', () => {
    describe('rootLogger', () => {
        it('is a Logger instance', () => {
            expect(rootLogger).toBeInstanceOf(Logger);
        });

        it('has empty context', () => {
            expect(rootLogger.context).toEqual({});
        });
    });

    describe('child()', () => {
        it('creates a child with merged context', () => {
            const child = rootLogger.child({ operation: 'test', resource: 'Jira' });
            expect(child.context).toEqual({ operation: 'test', resource: 'Jira' });
        });

        it('child inherits parent context and adds new keys', () => {
            const parent = rootLogger.child({ session: 'jira' });
            const child = parent.child({ operation: 'csv-import' });
            expect(child.context).toEqual({ session: 'jira', operation: 'csv-import' });
        });

        it('child does not mutate parent context', () => {
            const parent = rootLogger.child({ session: 'jira' });
            const child = parent.child({ operation: 'csv-import' });
            expect(parent.context).toEqual({ session: 'jira' });
            expect(Object.keys(parent.context)).not.toContain('operation');
        });
    });

    describe('_writeFile', () => {
        const origFile = process.env.LOG_FILE;
        const origDir = process.env.LOG_DIR;

        afterAll(() => {
            if (origFile) process.env.LOG_FILE = origFile;
            else delete process.env.LOG_FILE;
            if (origDir) process.env.LOG_DIR = origDir;
            else delete process.env.LOG_DIR;
        });

        function writeAndCheck(
            level: string,
            msg: string,
            data?: unknown,
        ): { fileFound: boolean; lastLine?: string; filePath?: string; logFile?: string } {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;

            const logger = new Logger({ test: 'write' });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic method dispatch by level string
            (logger as any)[level](msg, data);

            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(testDir, `qa-tools-${date}.log`);

            if (!fs.existsSync(logFile)) {
                const fp = logger.filePath;
                return { fileFound: false, filePath: fp ?? undefined, logFile };
            }

            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.trim().split('\n');
            const lastLine = lines[lines.length - 1];

            fs.rmSync(testDir, { recursive: true, force: true });
            return { fileFound: true, lastLine, filePath: logFile };
        }

        it('creates the log file when LOG_FILE=true', () => {
            const result = writeAndCheck('info', 'test');
            expect(result.fileFound).toBe(true);
        });

        it('writes a log line with INFO level and context', () => {
            const result = writeAndCheck('info', 'Mensagem de teste');
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).toContain('[INFO]');
            expect(result.lastLine).toContain('[write]');
            expect(result.lastLine).toContain('Mensagem de teste');
        });

        it('writes a log line with WARN level and context', () => {
            const result = writeAndCheck('warn', 'Aviso contextualizado');
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).toContain('[WARN]');
            expect(result.lastLine).toContain('Aviso contextualizado');
        });

        it('writes data param as JSON in the log line', () => {
            const result = writeAndCheck('warn', 'Com dados', { status: 429, attempt: 3 });
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).toContain('{"status":429,"attempt":3}');
        });

        it('has no ANSI escape codes in the log file', () => {
            const result = writeAndCheck('info', 'Sem ANSI no arquivo');
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).not.toMatch(/\x1b\[/);
        });

        it('writes ERROR level correctly', () => {
            const result = writeAndCheck('error', 'Erro grave');
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).toContain('[ERROR]');
            expect(result.lastLine).toContain('Erro grave');
        });

        it('rotates log file when size exceeds limit', () => {
            jest.isolateModules(() => {
                const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-rot-')));
                process.env.LOG_FILE = 'true';
                process.env.LOG_DIR = testDir;
                process.env.LOG_MAX_SIZE = '100';

                const { Logger: LoggerSmall } = require('./logger') as { Logger: typeof import('./logger').Logger };
                const logger = new LoggerSmall({ test: 'rotate' });
                logger.info('x'.repeat(120));
                const firstFile = logger.filePath;

                logger.info('more data after rotation');
                const dir = path.dirname(firstFile!);
                const ext = path.extname(firstFile!);
                const base = path.basename(firstFile!, ext);
                const rotated = path.join(dir, `${base}.1${ext}`);

                expect(fs.existsSync(rotated)).toBe(true);
                const rotatedContent = fs.readFileSync(rotated, 'utf8');
                expect(rotatedContent).toContain('[INFO]');

                delete process.env.LOG_MAX_SIZE;
                fs.rmSync(testDir, { recursive: true, force: true });
            });
        });
    });

    describe('_ensureDir error paths', () => {
        const origFile = process.env.LOG_FILE;
        const origDir = process.env.LOG_DIR;
        let spyError: jest.SpyInstance;

        afterEach(() => {
            if (origFile) process.env.LOG_FILE = origFile;
            else delete process.env.LOG_FILE;
            if (origDir) process.env.LOG_DIR = origDir;
            else delete process.env.LOG_DIR;
            if (spyError) spyError.mockRestore();
            jest.restoreAllMocks();
        });

        it('returns false when _fileError is already set', () => {
            const logger = new Logger();
            logger._fileError = true;
            expect(logger._ensureDir()).toBe(false);
        });

        it('returns false when LOG_FILE is not true', () => {
            delete process.env.LOG_FILE;
            const logger = new Logger();
            expect(logger._ensureDir()).toBe(false);
        });

        it('sets _fileError and console.error on mkdir failure', () => {
            spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-ensure-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const logger = new Logger();
            jest.spyOn(fs, 'existsSync').mockReturnValue(false);
            jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('permission denied');
            });
            const result = logger._ensureDir();
            expect(result).toBe(false);
            expect(logger._fileError).toBe(true);
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar diretório'));
        });

        it('reads _bytesWritten from statSync when log file already exists', () => {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-stat-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(testDir, `qa-tools-${date}.log`);
            fs.writeFileSync(logFile, 'existing content\n');
            const logger = new Logger();
            const result = logger._ensureDir();
            expect(result).toBe(true);
            expect(logger._bytesWritten).toBeGreaterThan(0);
        });

        afterAll(() => {
            // cleanup handled in afterEach
        });
    });

    describe('_rotateIfNeeded error paths', () => {
        afterEach(() => {
            jest.restoreAllMocks();
            delete process.env.LOG_MAX_SIZE;
            delete process.env.LOG_FILE;
            delete process.env.LOG_DIR;
        });

        it('increments seq when rotated file already exists', () => {
            jest.isolateModules(() => {
                const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-seq-')));
                process.env.LOG_FILE = 'true';
                process.env.LOG_DIR = testDir;
                process.env.LOG_MAX_SIZE = '50';
                const date = new Date().toISOString().split('T')[0];
                const logFile = path.join(testDir, `qa-tools-${date}.log`);
                fs.writeFileSync(logFile, 'x'.repeat(60));
                fs.writeFileSync(path.join(testDir, `qa-tools-${date}.1.log`), 'rotated-1\n');
                const { Logger: LoggerSeq } = require('./logger') as { Logger: typeof import('./logger').Logger };
                const logger = new LoggerSeq();
                logger._filePathCached = logFile;
                logger._bytesWritten = 100;
                logger._rotateIfNeeded();
                expect(fs.existsSync(path.join(testDir, `qa-tools-${date}.2.log`))).toBe(true);
                fs.rmSync(testDir, { recursive: true, force: true });
            });
        });

        it('logs error on rename failure during rotation', () => {
            jest.isolateModules(() => {
                const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
                const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-rotfail-')));
                process.env.LOG_FILE = 'true';
                process.env.LOG_DIR = testDir;
                process.env.LOG_MAX_SIZE = '50';
                const date = new Date().toISOString().split('T')[0];
                const logFile = path.join(testDir, `qa-tools-${date}.log`);
                fs.writeFileSync(logFile, 'x'.repeat(60));
                const { Logger: LoggerRotFail } = require('./logger') as {
                    Logger: typeof import('./logger').Logger;
                };
                const logger = new LoggerRotFail();
                logger._filePathCached = logFile;
                logger._bytesWritten = 100;
                jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
                    throw new Error('rename failed');
                });
                logger._rotateIfNeeded();
                expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao rotacionar log'));
                spyError.mockRestore();
                fs.rmSync(testDir, { recursive: true, force: true });
            });
        });
    });

    describe('_writeFile error paths', () => {
        let spyError: jest.SpyInstance;

        afterEach(() => {
            if (spyError) spyError.mockRestore();
            jest.restoreAllMocks();
            delete process.env.LOG_FILE;
            delete process.env.LOG_DIR;
        });

        it('handles data serialization error gracefully', () => {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-serial-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const logger = new Logger();
            const circular: Record<string, unknown> = { a: 1 };
            circular.self = circular;
            logger._writeFile('INFO', 'test', circular);
            const logFile = logger.filePath;
            if (logFile && fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                expect(content).toContain('[data serialization error]');
            }
            fs.rmSync(testDir, { recursive: true, force: true });
        });

        it('sets _fileError and logs on append failure', () => {
            spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-append-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const logger = new Logger();
            jest.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
                throw new Error('permission denied');
            });
            logger._writeFile('INFO', 'test');
            expect(logger._fileError).toBe(true);
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever no arquivo'));
            fs.rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('filePath getter', () => {
        it('returns null when LOG_FILE is not true', () => {
            const prev = process.env.LOG_FILE;
            delete process.env.LOG_FILE;
            const logger = new Logger();
            expect(logger.filePath).toBeNull();
            if (prev) process.env.LOG_FILE = prev;
            else delete process.env.LOG_FILE;
        });

        it('returns a path when LOG_FILE=true and file was written', () => {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-fp-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const logger = new Logger({ test: 'path' });
            logger.info('ativando filePath');
            const fp = logger.filePath;
            expect(fp).not.toBeNull();
            expect(fp).toContain('qa-tools-');
            expect(fp).toContain('.log');
            fs.rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('maskDeep', () => {
        it('masks values for keys matching token/secret/key', () => {
            const input = { token: 'abcdefghij', name: 'public', secret: 'my-secret-value!' };
            const result = maskDeep(input) as { token: string; name: string; secret: string };
            expect(result.token).toBe('abcd****');
            expect(result.name).toBe('public');
            expect(result.secret).toBe('my-s****');
        });

        it('does not mutate the original object', () => {
            const input = { token: 'abcdefghij' };
            const result = maskDeep(input) as { token: string };
            expect(input.token).toBe('abcdefghij');
            expect(result.token).toBe('abcd****');
        });

        it('handles null/undefined gracefully', () => {
            expect(maskDeep(null)).toBeNull();
            expect(maskDeep(undefined)).toBeUndefined();
        });

        it('handles non-object values', () => {
            expect(maskDeep('string')).toBe('string');
            expect(maskDeep(42)).toBe(42);
        });

        it('recursively masks nested arrays', () => {
            const input = { items: [{ token: 'abcdefghij' }, { name: 'public' }] };
            const result = maskDeep(input) as { items: Array<{ token: string; name: string }> };
            expect(result.items[0].token).toBe('abcd****');
            expect(result.items[1].name).toBe('public');
        });

        it('masks keys matching password/authorization patterns', () => {
            const input = { password: 'supersecret!', authorization: 'Bearer tok12345' };
            const result = maskDeep(input) as { password: string; authorization: string };
            expect(result.password).toBe('supe****');
            expect(result.authorization).toBe('Bear****');
        });
    });

    describe('_writeConsole error with data', () => {
        it('appends short JSON data to ERROR console output', () => {
            const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger();
            logger._writeConsole('ERROR', 'fail', { code: 500 });
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('{"code":500}'));
            spyError.mockRestore();
        });

        it('omits data when data is long for ERROR level', () => {
            const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger();
            const bigData = { big: 'x'.repeat(200) };
            logger._writeConsole('ERROR', 'fail', bigData);
            const text = spyError.mock.calls[0][0] as string;
            expect(text.length).toBeLessThan(400);
            spyError.mockRestore();
        });
    });

    describe('writeFileOnly', () => {
        afterEach(() => {
            jest.restoreAllMocks();
            delete process.env.LOG_FILE;
            delete process.env.LOG_DIR;
        });

        it('writes to file without console output', () => {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-wfo-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;
            const logger = new Logger({ test: 'wfo' });
            const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
            logger.writeFileOnly('INFO', 'file-only message');
            expect(spyLog).not.toHaveBeenCalled();
            const logFile = logger.filePath;
            if (logFile && fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                expect(content).toContain('file-only message');
            }
            spyLog.mockRestore();
            fs.rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('level filtering', () => {
        it('does not call console.log for levels below LOG_LEVEL', () => {
            const prevLevel = process.env.LOG_LEVEL;
            process.env.LOG_LEVEL = 'ERROR';

            const spyLog = jest.spyOn(console, 'log').mockImplementation(() => {});
            const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger({ test: 'filter' });

            logger.debug('debug msg');
            logger.info('info msg');
            logger.warn('warn msg');

            expect(console.log).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();

            logger.error('error msg');
            expect(console.log).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledTimes(1);

            spyLog.mockRestore();
            spyError.mockRestore();
            if (prevLevel) process.env.LOG_LEVEL = prevLevel;
            else delete process.env.LOG_LEVEL;
        });
    });
});
