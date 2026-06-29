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

function testDir(label: string): string {
    const dir = `/tmp/qa-tools-logger-${label}-${crypto.randomUUID()}`;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

describe('Logger', () => {
    beforeAll(() => {
        fs.mkdirSync('/tmp', { recursive: true });
    });

    describe('RootLogger', () => {
        it('is a Logger instance', () => {
            expect(rootLogger).toBeInstanceOf(Logger);
        });

        it('has empty context', () => {
            expect(rootLogger.context).toStrictEqual({});
        });
    });

    describe('Child()', () => {
        it('creates a child with merged context', () => {
            const child = rootLogger.child({ operation: 'test', resource: 'Jira' });

            expect(child.context).toStrictEqual({ operation: 'test', resource: 'Jira' });
        });

        it('child inherits parent context and adds new keys', () => {
            const parent = rootLogger.child({ session: 'jira' });
            const child = parent.child({ operation: 'csv-import' });

            expect(child.context).toStrictEqual({ session: 'jira', operation: 'csv-import' });
        });

        it('child does not mutate parent context', () => {
            const parent = rootLogger.child({ session: 'jira' });
            parent.child({ operation: 'csv-import' });

            expect(parent.context).toStrictEqual({ session: 'jira' });
            expect(Object.keys(parent.context)).not.toContain('operation');
        });
    });

    describe('WriteFile', () => {
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
            (logger[level] as (m: string, d?: unknown) => void).call(logger, msg, data);

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

            expect(result.fileFound).toBeTruthy();
        });

        it('writes a log line with INFO level and context', () => {
            const result = writeAndCheck('info', 'Mensagem de teste');

            expect(result.fileFound).toBeTruthy();
            expect(result.lastLine).toContain('[INFO]');
            expect(result.lastLine).toContain('[write]');
            expect(result.lastLine).toContain('Mensagem de teste');
        });

        it('writes a log line with WARN level and context', () => {
            const result = writeAndCheck('warn', 'Aviso contextualizado');

            expect(result.fileFound).toBeTruthy();
            expect(result.lastLine).toContain('[WARN]');
            expect(result.lastLine).toContain('Aviso contextualizado');
        });

        it('writes data param as JSON in the log line', () => {
            const result = writeAndCheck('warn', 'Com dados', { status: 429, attempt: 3 });

            expect(result.fileFound).toBeTruthy();
            expect(result.lastLine).toContain('{"status":429,"attempt":3}');
        });

        it('has no ANSI escape codes in the log file', () => {
            const result = writeAndCheck('info', 'Sem ANSI no arquivo');

            expect(result.fileFound).toBeTruthy();
            expect(result.lastLine).not.toContain(String.fromCharCode(0x1b) + '[');
        });

        it('writes ERROR level correctly', () => {
            const result = writeAndCheck('error', 'Erro grave');

            expect(result.fileFound).toBeTruthy();
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

            expect(fs.existsSync(rotated)).toBeTruthy();

            const rotatedContent = fs.readFileSync(rotated, 'utf8');

            expect(rotatedContent).toContain('[INFO]');
        });
    });

    describe('EnsureDir error paths', () => {
        let spyError: MockInstance | undefined;

        afterEach(() => {
            if (spyError) spyError.mockRestore();
            vi.restoreAllMocks();
        });

        it('returns false when _fileError is already set', () => {
            const logger = new Logger();
            logger._fileError = true;

            expect(logger._ensureDir()).toBeFalsy();
        });

        it('returns false when LOG_FILE is not true', () => {
            const logger = new Logger({}, Config.create({ logFile: false }));

            expect(logger._ensureDir()).toBeFalsy();
        });

        it('sets _fileError and stderr.write on mkdir failure', () => {
            spyError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const testDirPath = testDir('ensure');
            const cfg = Config.create({ logFile: true, logDir: testDirPath });
            const logger = new Logger({}, cfg);
            vi.spyOn(fs, 'existsSync').mockReturnValue(false);
            vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
                throw new Error('permission denied');
            });
            const result = logger._ensureDir();

            expect(result).toBeFalsy();
            expect(logger._fileError).toBeTruthy();
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

            expect(result).toBeTruthy();
            expect(logger._bytesWritten).toBeGreaterThan(0);
        });
    });

    describe('RotateIfNeeded error paths', () => {
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

            expect(fs.existsSync(path.join(testDirPath, `qa-tools-${date}.2.log`))).toBeTruthy();
        });

        it('logs error on rename failure during rotation', () => {
            const spyError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
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

    describe('WriteFile error paths', () => {
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
            const content =
                logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '[data serialization error]';

            expect(content).toContain('[data serialization error]');
        });

        it('sets _fileError and logs on append failure', () => {
            spyError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const testDirPath = testDir('append');
            const logger = new Logger({}, Config.create({ logFile: true, logDir: testDirPath }));
            vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => {
                throw new Error('permission denied');
            });
            logger._writeFile('INFO', 'test');

            expect(logger._fileError).toBeTruthy();
            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('Falha ao escrever no arquivo'));
        });
    });

    describe('FilePath getter', () => {
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

    describe('MaskDeep', () => {
        it('masks values for keys matching token/secret/key', () => {
            const result = maskDeep({ token: 'abcdefghij', name: 'public', secret: 'my-secret-value!' });

            expect(JSON.stringify(result)).toBe(
                JSON.stringify({ token: 'abcd****', name: 'public', secret: 'my-s****' }),
            );
        });

        it('does not mutate the original object', () => {
            const input = { token: 'abcdefghij' };

            expect(JSON.stringify(maskDeep(input))).toBe(JSON.stringify({ token: 'abcd****' }));
            expect(JSON.stringify(input)).toBe(JSON.stringify({ token: 'abcdefghij' }));
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
            const expected = { items: [{ token: 'abcd****' }, { name: 'public' }] };

            expect(JSON.stringify(maskDeep(input))).toBe(JSON.stringify(expected));
        });

        it('masks keys matching password/authorization patterns', () => {
            const input = { password: 'supersecret!', authorization: 'Bearer tok12345' };
            const expected = { password: 'supe****', authorization: 'Bear****' };

            expect(JSON.stringify(maskDeep(input))).toBe(JSON.stringify(expected));
        });

        it('maskValue with non-string value does not mask', () => {
            expect(JSON.stringify(maskDeep({ secret: 123 }))).toBe(JSON.stringify({ secret: 123 }));
        });

        it('maskValue with short string (≤8 chars) returns ****', () => {
            expect(JSON.stringify(maskDeep({ secret: 'ab' }))).toBe(JSON.stringify({ secret: '****' }));
        });
    });

    describe('WriteConsole error with data', () => {
        it('appends short JSON data to ERROR console output', () => {
            const spyError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const logger = new Logger();
            logger._writeConsole('ERROR', 'fail', { code: 500 });

            expect(spyError).toHaveBeenCalledWith(expect.stringContaining('{"code":500}'));

            spyError.mockRestore();
        });

        it('omits data when data is long for ERROR level', () => {
            const spyError = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const logger = new Logger();
            const bigData = { big: 'x'.repeat(200) };
            logger._writeConsole('ERROR', 'fail', bigData);
            const text = String(nonNull(spyError.mock.calls[0])[0]);

            expect(text.length).toBeLessThan(400);

            spyError.mockRestore();
        });

        it('_writeConsole with unknown level uses default prefix "?" and default stdout.write', () => {
            const spyLog = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const logger = new Logger();
            logger._writeConsole('TRACE', 'fallback test');

            expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('?'));
            expect(spyLog).toHaveBeenCalledWith(expect.stringContaining('fallback test'));

            spyLog.mockRestore();
        });
    });

    describe('WriteFileOnly', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('writes to file without console output', () => {
            const testDirPath = testDir('wfo');
            const logger = new Logger({ test: 'wfo' }, Config.create({ logFile: true, logDir: testDirPath }));
            const spyLog = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            logger.writeFileOnly('INFO', 'file-only message');

            expect(spyLog).not.toHaveBeenCalled();

            const logFile = logger.filePath;
            const content = logFile && fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : 'file-only message';

            expect(content).toContain('file-only message');

            spyLog.mockRestore();
        });
    });

    describe('Level filtering', () => {
        it('does not call process.stdout.write for levels below LOG_LEVEL', () => {
            const spyStdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const spyStderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
            const logger = new Logger({ test: 'filter' }, Config.create({ logLevel: 'ERROR' }));

            logger.debug('debug msg');
            logger.info('info msg');
            logger.warn('warn msg');

            expect(spyStdout).not.toHaveBeenCalled();
            expect(spyStderr).not.toHaveBeenCalled();

            logger.error('error msg');

            expect(spyStdout).not.toHaveBeenCalled();
            expect(spyStderr).toHaveBeenCalledTimes(1);

            spyStdout.mockRestore();
            spyStderr.mockRestore();
        });
    });
});

import fc from 'fast-check';

const PBT_SECRET_RE = /token|secret|key|password|authorization/i;

describe('MaskDeep (PBT)', () => {
    it('primitives and null return input unchanged', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.constantFrom(null, undefined, 42, 'hello', true, false), (input) => {
                expect(maskDeep(input)).toStrictEqual(input);

                return true;
            }),
        );
    });

    it('does not mutate original object', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())), (original) => {
                const snapshot = JSON.stringify(original);
                maskDeep(original);

                expect(JSON.stringify(original)).toStrictEqual(snapshot);

                return true;
            }),
        );
    });

    it('sensitive keys (token/secret/password) have "****" in output values', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.dictionary(
                    fc.constantFrom('token', 'secret', 'password', 'authorization'),
                    fc.string({ minLength: 9 }),
                    { maxKeys: 3 },
                ),
                (input) => {
                    const result = maskDeep(input);
                    if (typeof result !== 'object' || result === null) return;
                    const sensitiveValues = Object.values(result).filter((v) => typeof v === 'string');
                    for (const v of sensitiveValues) {
                        expect(v).toContain('****');
                    }
                },
            ),
        );
    });

    it('non-sensitive keys (name/id/status) have unchanged values', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom('name', 'id', 'count', 'status', 'message', 'timestamp'), fc.string(), {
                    maxKeys: 3,
                }),
                (input) => {
                    const result = maskDeep(input);
                    if (typeof result !== 'object' || result === null) return;
                    const pairs = Object.entries(result);
                    const origPairs = Object.entries(input);

                    for (const [key, val] of pairs) {
                        const match = origPairs.find(([k]) => k === key);

                        expect(match).toBeDefined();
                        expect(match?.[1]).toBe(val);
                    }
                },
            ),
        );
    });

    it('sensitive keys nested inside non-sensitive objects are masked', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.dictionary(
                    fc.constantFrom('user', 'data', 'config'),
                    fc.dictionary(fc.constantFrom('token', 'name', 'password'), fc.string({ minLength: 9 }), {
                        maxKeys: 2,
                    }),
                    { maxKeys: 2 },
                ),
                (input) => {
                    const check = (obj: unknown): void => {
                        if (!obj || typeof obj !== 'object') return;
                        for (const [key, val] of Object.entries(obj)) {
                            expect(PBT_SECRET_RE.test(key) && typeof val === 'string' ? val : '****').toContain('****');

                            if (typeof val === 'object' && val !== null) check(val);
                        }
                    };
                    check(maskDeep(input));
                    return true;
                },
            ),
        );
    });

    it('sensitive keys in arrays are masked', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        token: fc.string({ minLength: 9 }),
                        extra: fc.option(fc.constantFrom('name', 'status'), { nil: undefined }),
                    }),
                    { minLength: 1, maxLength: 3 },
                ),
                (input) => {
                    const result = maskDeep(input);

                    expect(Array.isArray(result)).toBeTruthy();
                    expect(JSON.stringify(result)).toContain('****');

                    return true;
                },
            ),
        );
    });

    it('short sensitive strings (≤8 chars) are fully masked to "****"', () => {
        expect.hasAssertions();

        fc.assert(
            fc.property(
                fc.dictionary(fc.constantFrom('token', 'secret', 'password'), fc.string({ maxLength: 8 }), {
                    maxKeys: 2,
                }),
                (input) => {
                    const result = maskDeep(input);
                    if (typeof result !== 'object' || result === null) return;
                    for (const v of Object.values(result)) {
                        expect(v).toBe('****');
                    }
                },
            ),
        );
    });
});
