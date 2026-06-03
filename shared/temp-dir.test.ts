import * as fs from 'fs';
import { reportsDir, logsDir, tempDirPath, writeReport, writeEphemeral, ensureDirs, registerCleanup } from './temp-dir';

jest.mock(
    'fs',
    (): Pick<typeof fs, 'mkdirSync' | 'writeFileSync' | 'existsSync' | 'rmSync'> => ({
        mkdirSync: jest.fn<ReturnType<typeof fs.mkdirSync>, Parameters<typeof fs.mkdirSync>>(),
        writeFileSync: jest.fn<ReturnType<typeof fs.writeFileSync>, Parameters<typeof fs.writeFileSync>>(),
        existsSync: jest.fn<ReturnType<typeof fs.existsSync>, Parameters<typeof fs.existsSync>>(() => false),
        rmSync: jest.fn<ReturnType<typeof fs.rmSync>, Parameters<typeof fs.rmSync>>(),
    }),
);

beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.QA_TOOLS_REPORTS_DIR;
    delete process.env.QA_TOOLS_LOGS_DIR;
    delete process.env.QA_TOOLS_TEMP_DIR;
    delete process.env.LOG_DIR;
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('reportsDir', () => {
    it('returns default reports path when no env var set', () => {
        const result = reportsDir();
        expect(result).toMatch(/reports$/);
    });

    it('uses QA_TOOLS_REPORTS_DIR env var when set', () => {
        process.env.QA_TOOLS_REPORTS_DIR = '/custom/reports';
        expect(reportsDir()).toBe('/custom/reports');
    });
});

describe('logsDir', () => {
    it('returns default logs path when no env var set', () => {
        const result = logsDir();
        expect(result).toMatch(/logs$/);
    });

    it('uses QA_TOOLS_LOGS_DIR env var when set', () => {
        process.env.QA_TOOLS_LOGS_DIR = '/custom/logs';
        expect(logsDir()).toBe('/custom/logs');
    });

    it('uses LOG_DIR env var as fallback', () => {
        process.env.LOG_DIR = '/legacy/logs';
        expect(logsDir()).toBe('/legacy/logs');
    });
});

describe('tempDirPath', () => {
    it('returns default temp path when no env var set', () => {
        const result = tempDirPath();
        expect(result).toMatch(/temp$/);
    });

    it('uses QA_TOOLS_TEMP_DIR env var when set', () => {
        process.env.QA_TOOLS_TEMP_DIR = '/custom/temp';
        expect(tempDirPath()).toBe('/custom/temp');
    });
});

describe('writeReport', () => {
    it('writes content to date-subfolder under reports directory', () => {
        process.env.QA_TOOLS_REPORTS_DIR = '/tmp/test-reports';
        const result = writeReport('test.json', '{}');
        expect(result).toMatch(/\/tmp\/test-reports\/\d{4}-\d{2}-\d{2}\/test\.json$/);
    });
});

describe('writeEphemeral', () => {
    it('writes content to temp category directory', () => {
        process.env.QA_TOOLS_TEMP_DIR = '/tmp/test-temp';
        const result = writeEphemeral('previews', 'snap.html', '<html/>');
        expect(result).toBe('/tmp/test-temp/previews/snap.html');
    });
});

describe('ensureDirs', () => {
    it('creates all required directories', () => {
        process.env.QA_TOOLS_REPORTS_DIR = '/tmp/test-reports';
        process.env.QA_TOOLS_LOGS_DIR = '/tmp/test-logs';
        process.env.QA_TOOLS_TEMP_DIR = '/tmp/test-temp';
        ensureDirs();
        expect(fs.mkdirSync).toHaveBeenCalled();
    });
});

describe('registerCleanup', () => {
    it('registers SIGINT, SIGTERM, and exit handlers', () => {
        const handlers: Array<string | symbol> = [];
        jest.spyOn(process, 'on').mockImplementation((event: string | symbol) => {
            handlers.push(event);
            return process;
        });
        registerCleanup();
        expect(handlers).not.toContain('SIGINT');
        expect(handlers).toContain('SIGTERM');
        expect(handlers).toContain('exit');
    });

    it('catches error during cleanup gracefully', () => {
        const handlerRef: { current?: () => void } = {};
        jest.spyOn(process, 'on').mockImplementation(
            (_event: string | symbol, listener: (...args: unknown[]) => void) => {
                handlerRef.current = listener;
                return process;
            },
        );
        jest.mocked(fs.existsSync).mockImplementation(() => {
            throw new Error('fail');
        });
        registerCleanup();
        expect(() => handlerRef.current?.()).not.toThrow();
    });

    it('removes subdirectories during cleanup when they exist', () => {
        const handlerRef: { current?: () => void } = {};
        jest.spyOn(process, 'on').mockImplementation(
            (_event: string | symbol, listener: (...args: unknown[]) => void) => {
                handlerRef.current = listener;
                return process;
            },
        );
        jest.mocked(fs.existsSync).mockReturnValue(true);
        registerCleanup();
        handlerRef.current?.();
        expect(fs.rmSync).toHaveBeenCalled();
    });
});
