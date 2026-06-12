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

describe('reportsDir', () => {
    it('returns default reports path when no env var set', () => {
        const result = reportsDir();
        expect(result).toMatch(/reports$/);
    });

    it('uses QA_TOOLS_REPORTS_DIR env var when set', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/custom/reports';
        expect(reportsDir()).toBe('/custom/reports');
    });
});

describe('logsDir', () => {
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

describe('tempDirPath', () => {
    it('returns default temp path when no env var set', () => {
        const result = tempDirPath();
        expect(result).toMatch(/temp$/);
    });

    it('uses QA_TOOLS_TEMP_DIR env var when set', () => {
        process.env['QA_TOOLS_TEMP_DIR'] = '/custom/temp';
        expect(tempDirPath()).toBe('/custom/temp');
    });
});

describe('writeReport', () => {
    it('writes content to date-subfolder under reports directory', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        const result = writeReport('test.json', '{}');
        expect(result).toMatch(/\/tmp\/test-reports\/\d{4}-\d{2}-\d{2}\/test\.json$/);
    });
});

describe('writeEphemeral', () => {
    it('writes content to temp category directory', () => {
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        const result = writeEphemeral('previews', 'snap.html', '<html/>');
        expect(result).toBe('/tmp/test-temp/previews/snap.html');
    });
});

describe('ensureDirs', () => {
    it('creates all required directories', () => {
        process.env['QA_TOOLS_REPORTS_DIR'] = '/tmp/test-reports';
        process.env['QA_TOOLS_LOGS_DIR'] = '/tmp/test-logs';
        process.env['QA_TOOLS_TEMP_DIR'] = '/tmp/test-temp';
        ensureDirs();
        expect(fs.mkdirSync).toHaveBeenCalled();
    });
});

describe('registerCleanup', () => {
    it('registers SIGINT, SIGTERM, and exit handlers', () => {
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

    it('catches error during cleanup gracefully', () => {
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
    });

    it('removes subdirectories during cleanup when they exist', () => {
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
        expect(fs.rmSync).toHaveBeenCalled();
    });
});
