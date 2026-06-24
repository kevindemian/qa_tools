import * as fs from 'fs';
import {
    reportsDir,
    logsDir,
    tempDirPath,
    writeReport,
    writeEphemeral,
    ensureDirs,
    registerCleanup,
} from './temp-dir.js';
import { rootLogger } from './logger.js';

vi.mock(
    'fs',
    (): Pick<typeof fs, 'mkdirSync' | 'writeFileSync' | 'existsSync' | 'rmSync'> => ({
        mkdirSync: vi.fn<(...args: Parameters<typeof fs.mkdirSync>) => ReturnType<typeof fs.mkdirSync>>(),
        writeFileSync: vi.fn<(...args: Parameters<typeof fs.writeFileSync>) => ReturnType<typeof fs.writeFileSync>>(),
        existsSync: vi.fn<(...args: Parameters<typeof fs.existsSync>) => ReturnType<typeof fs.existsSync>>(() => false),
        rmSync: vi.fn<(...args: Parameters<typeof fs.rmSync>) => ReturnType<typeof fs.rmSync>>(),
    }),
);

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['QA_TOOLS_REPORTS_DIR'];
    delete process.env['QA_TOOLS_LOGS_DIR'];
    delete process.env['QA_TOOLS_TEMP_DIR'];
    delete process.env['LOG_DIR'];
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ReportsDir', () => {
    it('returns default reports path when no env var set', () => {
        const result = reportsDir();

        expect(result).toMatch(/reports$/);
    });

    it('uses QA_TOOLS_REPORTS_DIR env var when set', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/custom/reports';

        expect(reportsDir()).toBe('/custom/reports');
    });
});

describe('LogsDir', () => {
    it('returns default logs path when no env var set', () => {
        const result = logsDir();

        expect(result).toMatch(/logs$/);
    });

    it('uses QA_TOOLS_LOGS_DIR env var when set', () => {
        process.env['QA_TOOLS_LOGS_DIR'] = '/custom/logs';

        expect(logsDir()).toBe('/custom/logs');
    });

    it('uses LOG_DIR env var as fallback', () => {
        process.env['LOG_DIR'] = '/legacy/logs';

        expect(logsDir()).toBe('/legacy/logs');
    });
});

describe('TempDirPath', () => {
    it('returns default temp path when no env var set', () => {
        const result = tempDirPath();

        expect(result).toMatch(/temp$/);
    });

    it('uses QA_TOOLS_TEMP_DIR env var when set', () => {
        process.env['QA_TOOLS_TEMP_DIR'] = '/custom/temp';

        expect(tempDirPath()).toBe('/custom/temp');
    });
});

describe('WriteReport', () => {
    it('writes content to date-subfolder under reports directory', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        const result = writeReport('test.json', '{}');

        expect(result).toMatch(/\/tmp\/test-reports\/\d{4}-\d{2}-\d{2}\/test\.json$/);
    });

    it('logs and re-throws when mkdirSync fails (G1 bug-fix)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
            throw new Error('EACCES: permission denied');
        });

        expect(() => writeReport('test.json', '{}')).toThrow('EACCES');
        expect(warnSpy).toHaveBeenCalled();
    });

    it('logs and re-throws when writeFileSync fails (G1 bug-fix)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
            throw new Error('ENOSPC: no space left');
        });

        expect(() => writeReport('test.json', '{}')).toThrow('ENOSPC');
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe('WriteEphemeral', () => {
    it('writes content to temp category directory', () => {
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        const result = writeEphemeral('previews', 'snap.html', '<html/>');

        expect(result).toBe('/tmp/test-temp/previews/snap.html');
    });

    it('logs and re-throws when mkdirSync fails (G1 bug-fix)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        vi.mocked(fs.mkdirSync).mockImplementationOnce(() => {
            throw new Error('EACCES: permission denied');
        });

        expect(() => writeEphemeral('cache', 'data.json', '{}')).toThrow('EACCES');
        expect(warnSpy).toHaveBeenCalled();
    });

    it('logs and re-throws when writeFileSync fails (G1 bug-fix)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        vi.mocked(fs.writeFileSync).mockImplementationOnce(() => {
            throw new Error('ENOSPC: no space left');
        });

        expect(() => writeEphemeral('cache', 'data.json', '{}')).toThrow('ENOSPC');
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe('EnsureDirs', () => {
    it('creates all required directories', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        process.env['QA_TOOLS_LOGS_DIR'] = '/tmp/test-logs';
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        ensureDirs();

        expect(fs.mkdirSync).toHaveBeenCalledTimes(5);
    });

    it('logs and re-throws when mkdirSync fails (G1 bug-fix)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        process.env['QA_TOOLS_LOGS_DIR'] = '/tmp/test-logs';
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        vi.mocked(fs.mkdirSync).mockImplementation(() => {
            throw new Error('EACCES: permission denied');
        });

        expect(() => ensureDirs()).toThrow('EACCES');
        expect(warnSpy).toHaveBeenCalled();
    });
});

describe('RegisterCleanup', () => {
    it('registers SIGTERM and exit handlers, NOT SIGINT', () => {
        const handlers: Array<string | symbol> = [];
        vi.spyOn(process, 'on').mockImplementation((event: string | symbol) => {
            handlers.push(event);
            return process;
        });
        registerCleanup();

        expect(handlers).not.toContain('SIGINT');
        expect(handlers).toContain('SIGTERM');
        expect(handlers).toContain('exit');
    });

    it('registers cleanupTempDirs as the callback handler', () => {
        const registered: Array<{ event: string | symbol; fn: (...args: unknown[]) => void }> = [];
        vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: (...args: unknown[]) => void) => {
            registered.push({ event, fn: listener });
            return process;
        });
        registerCleanup();

        expect(registered.length).toBeGreaterThanOrEqual(2);

        for (const entry of registered) {
            expect(entry.fn.name).toBe('cleanupTempDirs');
        }
    });

    it('catches error during cleanup gracefully and logs via warn', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        const handlerRef: { current?: () => void } = {};
        vi.spyOn(process, 'on').mockImplementation(
            (_event: string | symbol, listener: (...args: unknown[]) => void) => {
                handlerRef.current = listener;
                return process;
            },
        );
        vi.spyOn(fs, 'existsSync').mockImplementation(() => {
            throw new Error('fail');
        });
        registerCleanup();

        expect(() => handlerRef.current?.()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();
    });

    it('removes all 3 temp subdirectories during cleanup when they exist (G6)', () => {
        const handlerRef: { current?: () => void } = {};
        vi.spyOn(process, 'on').mockImplementation(
            (_event: string | symbol, listener: (...args: unknown[]) => void) => {
                handlerRef.current = listener;
                return process;
            },
        );
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        registerCleanup();
        handlerRef.current?.();

        expect(fs.rmSync).toHaveBeenCalledTimes(3);
    });

    it('does not fail when temp subdirectories do not exist (G4 coverage)', () => {
        const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
        const handlerRef: { current?: () => void } = {};
        vi.spyOn(process, 'on').mockImplementation(
            (_event: string | symbol, listener: (...args: unknown[]) => void) => {
                handlerRef.current = listener;
                return process;
            },
        );
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        registerCleanup();
        handlerRef.current?.();

        expect(fs.rmSync).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
