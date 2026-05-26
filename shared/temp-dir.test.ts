jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return {
        ...actual,
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(() => false),
        rmSync: jest.fn(),
    };
});

afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.QA_TOOLS_REPORTS_DIR;
    delete process.env.QA_TOOLS_LOGS_DIR;
    delete process.env.QA_TOOLS_TEMP_DIR;
    delete process.env.LOG_DIR;
});

describe('reportsDir', () => {
    it('returns default reports path when no env var set', () => {
        const { reportsDir } = require('./temp-dir');
        const result = reportsDir();
        expect(result).toMatch(/reports$/);
    });

    it('uses QA_TOOLS_REPORTS_DIR env var when set', () => {
        process.env.QA_TOOLS_REPORTS_DIR = '/custom/reports';
        const { reportsDir } = require('./temp-dir');
        expect(reportsDir()).toBe('/custom/reports');
    });
});

describe('logsDir', () => {
    it('returns default logs path when no env var set', () => {
        const { logsDir } = require('./temp-dir');
        const result = logsDir();
        expect(result).toMatch(/logs$/);
    });

    it('uses QA_TOOLS_LOGS_DIR env var when set', () => {
        process.env.QA_TOOLS_LOGS_DIR = '/custom/logs';
        const { logsDir } = require('./temp-dir');
        expect(logsDir()).toBe('/custom/logs');
    });

    it('uses LOG_DIR env var as fallback', () => {
        process.env.LOG_DIR = '/legacy/logs';
        const { logsDir } = require('./temp-dir');
        expect(logsDir()).toBe('/legacy/logs');
    });
});

describe('tempDirPath', () => {
    it('returns default temp path when no env var set', () => {
        const { tempDirPath } = require('./temp-dir');
        const result = tempDirPath();
        expect(result).toMatch(/temp$/);
    });

    it('uses QA_TOOLS_TEMP_DIR env var when set', () => {
        process.env.QA_TOOLS_TEMP_DIR = '/custom/temp';
        const { tempDirPath } = require('./temp-dir');
        expect(tempDirPath()).toBe('/custom/temp');
    });
});

describe('writeReport', () => {
    it('writes content to reports directory', () => {
        const { writeReport } = require('./temp-dir');
        process.env.QA_TOOLS_REPORTS_DIR = '/tmp/test-reports';
        const result = writeReport('test.json', '{}');
        expect(result).toBe('/tmp/test-reports/test.json');
    });
});

describe('writeEphemeral', () => {
    it('writes content to temp category directory', () => {
        const { writeEphemeral } = require('./temp-dir');
        process.env.QA_TOOLS_TEMP_DIR = '/tmp/test-temp';
        const result = writeEphemeral('previews', 'snap.html', '<html/>');
        expect(result).toBe('/tmp/test-temp/previews/snap.html');
    });
});

describe('ensureDirs', () => {
    it('creates all required directories', () => {
        const fs = require('fs');
        const { ensureDirs } = require('./temp-dir');
        process.env.QA_TOOLS_REPORTS_DIR = '/tmp/test-reports';
        process.env.QA_TOOLS_LOGS_DIR = '/tmp/test-logs';
        process.env.QA_TOOLS_TEMP_DIR = '/tmp/test-temp';
        ensureDirs();
        expect(fs.mkdirSync).toHaveBeenCalled();
    });
});

describe('registerCleanup', () => {
    it('registers SIGINT, SIGTERM, and exit handlers', () => {
        const handlers: string[] = [];
        jest.spyOn(process, 'on').mockImplementation(
            (event: string | symbol, _listener: (...args: unknown[]) => void) => {
                handlers.push(event as string);
                return process;
            },
        );
        const { registerCleanup } = require('./temp-dir');
        registerCleanup();
        expect(handlers).toContain('SIGINT');
        expect(handlers).toContain('SIGTERM');
        expect(handlers).toContain('exit');
    });
});
