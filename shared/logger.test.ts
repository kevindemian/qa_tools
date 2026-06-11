import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import path from 'path';

vi.mock('fs', async () => {
    const memfs = await import('memfs');
    const mfs = memfs.fs;
    return { default: mfs, ...mfs };
});

import fs from 'fs';
import Config from './config.js';
import { formatDateISO } from './date-utils.js';
import { Logger, rootLogger, maskDeep } from './logger.js';
import { nonNull } from './test-utils.js';

let testCounter = 0;

beforeAll(() => {
    fs.mkdirSync('/tmp', { recursive: true });
});

function testDir(label: string): string {
    const dir = `/tmp/qa-tools-logger-${label}-${testCounter++}`;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
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
            parent.child({ operation: 'csv-import' });
            expect(parent.context).toEqual({ session: 'jira' });
            expect(Object.keys(parent.context)).not.toContain('operation');
        });
    });

    describe('_writeFile', () => {
        function writeAndCheck(
            level: keyof Logger,
            msg: string,
            data?: unknown,
        ): {
            fileFound: boolean;
            lastLine?: string | undefined;
            filePath?: string | undefined;
            logFile?: string | undefined;
        } {
            const testDirPath = testDir('write');
            const cfg = Config.create({ logFile: true, logDir: testDirPath });
            const logger = new Logger({ test: 'write' }, cfg);
            (logger[level] as (m: string, d?: unknown) => void)(msg, data);

            const date = formatDateISO();
            const logFile = path.join(testDirPath, `qa-tools-${date}.log`);

            if (!fs.existsSync(logFile)) {
                const fp = logger.filePath;
                return { fileFound: false, filePath: fp ?? undefined, logFile };
            }

            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.trim().split('\n');
            const lastLine = lines[lines.length - 1];

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
            expect(result.lastLine).not.toMatch(new RegExp(String.fromCharCode(0x1b) + '\\['));
        });

        it('writes ERROR level correctly', () => {
            const result = writeAndCheck('error', 'Erro grave');
            expect(result.fileFound).toBe(true);
            expect(result.lastLine).toContain('[ERROR]');
            expect(result.lastLine).toContain('Erro grave');
        });

        it('rotates log file when size exceeds limit', () => {
            const testDirPath = testDir('rotate');
            const cfg = Config.create({ logFile: true, logDir: testDirPath, logMaxSize: 100 });

            const logger = new Logger({ test: 'rotate' }, cfg);
            logger.info('x'.repeat(120));
            const firstFile = logger.filePath;

            logger.info('more data after rotation');
            const dir = path.dirname(nonNull(firstFile));
            const ext = path.extname(nonNull(firstFile));
            const base = path.basename(nonNull(firstFile), ext);
            const rotated = path.join(dir, `${base}.1${ext}`);

            expect(fs.existsSync(rotated)).toBe(true);
            const rotatedContent = fs.readFileSync(rotated, 'utf8');
            expect(rotatedContent).toContain('[INFO]');
        });
    });

    describe('_ensureDir error paths', () => {
        let spyError: MockInstance | undefined;

        afterEach(() => {
            if (spyError) spyError.mockRestore();
            vi.restoreAllMocks();
        });

        it('returns false when _fileError is already set', () => {
            const logger = new Logger();
            logger._fileError = true;
            expect(logger._ensureDir()).toBe(false);
        });

        it('returns false when LOG_FILE is not true', () => {
            const logger = new Logger({}, Config.create({ logFile: false }));
            expect(logger._ensureDir()).toBe(false);
        });

        it('sets _fileError and console.error on mkdir failure', () => {
            spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const testDirPath = testDir('ensure');
            const cfg = Config.create({ logFile: true, logDir: testDirPath });
            const logger = new Logger({}, cfg);
            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('permission denied');
            });
            const result = logger._ensureDir();
            expect(result).toBe(false);
            expect(logger._fileError).toBe(true);
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao criar diretório'));
        });

        it('reads _bytesWritten from statSync when log file already exists', () => {
            const testDirPath = testDir('stat');
            const cfg = Config.create({ logFile: true, logDir: testDirPath });
            const date = formatDateISO();
            const logFile = path.join(testDirPath, `qa-tools-${date}.log`);
            fs.writeFileSync(logFile, 'existing content\n');
            const logger = new Logger({}, cfg);
            const result = logger._ensureDir();
            expect(result).toBe(true);
            expect(logger._bytesWritten).toBeGreaterThan(0);
        });
    });

    describe('_rotateIfNeeded error paths', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('increments seq when rotated file already exists', () => {
            const testDirPath = testDir('seq');
            const date = formatDateISO();
            const logFile = path.join(testDirPath, `qa-tools-${date}.log`);
            fs.writeFileSync(logFile, 'x'.repeat(60));
            fs.writeFileSync(path.join(testDirPath, `qa-tools-${date}.1.log`), 'rotated-1\n');
            const cfg = Config.create({ logFile: true, logDir: testDirPath, logMaxSize: 50 });
            const logger = new Logger({}, cfg);
            logger._filePathCached = logFile;
            logger._bytesWritten = 100;
            logger._rotateIfNeeded();
            expect(fs.existsSync(path.join(testDirPath, `qa-tools-${date}.2.log`))).toBe(true);
        });

        it('logs error on rename failure during rotation', () => {
            const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const testDirPath = testDir('rotfail');
            const date = formatDateISO();
            const logFile = path.join(testDirPath, `qa-tools-${date}.log`);
            fs.writeFileSync(logFile, 'x'.repeat(60));
            const cfg = Config.create({ logFile: true, logDir: testDirPath, logMaxSize: 50 });
            const logger = new Logger({}, cfg);
            logger._filePathCached = logFile;
            logger._bytesWritten = 100;
            vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
                throw new Error('rename failed');
            });
            logger._rotateIfNeeded();
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao rotacionar log'));
            spyError.mockRestore();
        });
    });

    describe('_writeFile error paths', () => {
        let spyError: MockInstance | undefined;

        afterEach(() => {
            if (spyError) spyError.mockRestore();
            vi.restoreAllMocks();
        });

        it('handles data serialization error gracefully', () => {
            const testDirPath = testDir('serial');
            const logger = new Logger({}, Config.create({ logFile: true, logDir: testDirPath }));
            const circular: { a: number; self?: unknown } = { a: 1 };
            circular.self = circular;
            logger._writeFile('INFO', 'test', circular);
            const logFile = logger.filePath;
            if (logFile && fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                expect(content).toContain('[data serialization error]');
            }
        });

        it('sets _fileError and logs on append failure', () => {
            spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const testDirPath = testDir('append');
            const logger = new Logger({}, Config.create({ logFile: true, logDir: testDirPath }));
            vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
                throw new Error('permission denied');
            });
            logger._writeFile('INFO', 'test');
            expect(logger._fileError).toBe(true);
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever no arquivo'));
        });
    });

    describe('filePath getter', () => {
        it('returns null when LOG_FILE is not true', () => {
            const logger = new Logger({}, Config.create({ logFile: false }));
            expect(logger.filePath).toBeNull();
        });

        it('returns a path when LOG_FILE=true and file was written', () => {
            const testDirPath = testDir('fp');
            const logger = new Logger({ test: 'path' }, Config.create({ logFile: true, logDir: testDirPath }));
            logger.info('ativando filePath');
            const fp = logger.filePath;
            expect(fp).not.toBeNull();
            expect(fp).toContain('qa-tools-');
            expect(fp).toContain('.log');
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
            expect(nonNull(result.items[0]).token).toBe('abcd****');
            expect(nonNull(result.items[1]).name).toBe('public');
        });

        it('masks keys matching password/authorization patterns', () => {
            const input = { password: 'supersecret!', authorization: 'Bearer tok12345' };
            const result = maskDeep(input) as { password: string; authorization: string };
            expect(result.password).toBe('supe****');
            expect(result.authorization).toBe('Bear****');
        });

        it('maskValue with non-string value does not mask', () => {
            const result = maskDeep({ secret: 123 }) as { [key: string]: unknown };
            expect(result['secret']).toBe(123);
        });

        it('maskValue with short string (≤8 chars) returns ****', () => {
            const result = maskDeep({ secret: 'ab' }) as Record<string, string>;
            expect(result['secret']).toBe('****');
        });
    });

    describe('_writeConsole error with data', () => {
        it('appends short JSON data to ERROR console output', () => {
            const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger();
            logger._writeConsole('ERROR', 'fail', { code: 500 });
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('{"code":500}'));
            spyError.mockRestore();
        });

        it('omits data when data is long for ERROR level', () => {
            const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger();
            const bigData = { big: 'x'.repeat(200) };
            logger._writeConsole('ERROR', 'fail', bigData);
            const text = nonNull(spyError.mock.calls[0])[0] as string;
            expect(text.length).toBeLessThan(400);
            spyError.mockRestore();
        });

        it('_writeConsole with unknown level uses default prefix "?" and default console.log', () => {
            const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
            const logger = new Logger();
            logger._writeConsole('TRACE', 'fallback test');
            expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('?'));
            expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('fallback test'));
            spyLog.mockRestore();
        });
    });

    describe('writeFileOnly', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('writes to file without console output', () => {
            const testDirPath = testDir('wfo');
            const logger = new Logger({ test: 'wfo' }, Config.create({ logFile: true, logDir: testDirPath }));
            const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
            logger.writeFileOnly('INFO', 'file-only message');
            expect(spyLog).not.toHaveBeenCalled();
            const logFile = logger.filePath;
            if (logFile && fs.existsSync(logFile)) {
                const content = fs.readFileSync(logFile, 'utf8');
                expect(content).toContain('file-only message');
            }
            spyLog.mockRestore();
        });
    });

    describe('level filtering', () => {
        it('does not call console.log for levels below LOG_LEVEL', () => {
            const spyLog = vi.spyOn(console, 'log').mockImplementation(() => {});
            const spyError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const logger = new Logger({ test: 'filter' }, Config.create({ logLevel: 'ERROR' }));

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
        });
    });
});
