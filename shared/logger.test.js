const fs = require('fs');
const path = require('path');
const os = require('os');

function normalizePath(p) {
    return p.replace(/\\/g, '/');
}

describe('Logger', () => {
    let Logger, rootLogger, maskDeep;

    beforeAll(() => {
        const mod = require('./logger');
        Logger = mod.Logger;
        rootLogger = mod.rootLogger;
        maskDeep = mod.maskDeep;
    });

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

        function writeAndCheck(level, msg, data) {
            const testDir = normalizePath(fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tools-logger-')));
            process.env.LOG_FILE = 'true';
            process.env.LOG_DIR = testDir;

            const logger = new Logger({ test: 'write' });
            logger[level](msg, data);

            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(testDir, `qa-tools-${date}.log`);

            if (!fs.existsSync(logFile)) {
                const fp = logger.filePath;
                return { fileFound: false, filePath: fp, logFile };
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
            const result = maskDeep(input);
            expect(result.token).toBe('abcd****');
            expect(result.name).toBe('public');
            expect(result.secret).toBe('my-s****');
        });

        it('does not mutate the original object', () => {
            const input = { token: 'abcdefghij' };
            const result = maskDeep(input);
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
    });

    describe('level filtering', () => {
        it('does not call console.log for levels below LOG_LEVEL', () => {
            const prevLevel = process.env.LOG_LEVEL;
            process.env.LOG_LEVEL = 'ERROR';

            const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const logger = new Logger({ test: 'filter' });

            logger.debug('debug msg');
            logger.info('info msg');
            logger.warn('warn msg');

            expect(console.log).not.toHaveBeenCalled();

            logger.error('error msg');
            expect(console.log).toHaveBeenCalledTimes(1);

            spy.mockRestore();
            if (prevLevel) process.env.LOG_LEVEL = prevLevel;
            else delete process.env.LOG_LEVEL;
        });
    });
});
