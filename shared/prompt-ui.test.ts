const mockPrint = vi.hoisted(() => vi.fn());
const mockGetBreadcrumbPath = vi.hoisted(() => vi.fn(() => ''));

vi.mock('./breadcrumbs', async () => ({
    getBreadcrumbPath: mockGetBreadcrumbPath,
}));

vi.mock('./output', async () => ({
    Output: { isTTY: vi.fn(), columns: vi.fn(() => 80) },
    defaultOutput: { print: mockPrint },
}));

vi.mock('./logger', async () => ({
    rootLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        writeFileOnly: vi.fn(),
        filePath: '/tmp/test.log',
    },
    Logger: class {
        info = vi.fn();
        error = vi.fn();
        warn = vi.fn();
        debug = vi.fn();
        writeFileOnly = vi.fn();
        get filePath() {
            return '/tmp/test.log';
        }
    },
}));

vi.mock('./box', async () => ({
    box: vi.fn((lines: string[]) => lines.join('\n')),
    divider: vi.fn(() => '---'),
    visibleWidth: vi.fn((s: string) => s.length),
}));

vi.mock('./palette', async () => ({
    palette: {
        green: (s: string) => s,
        red: (s: string) => s,
        yellow: (s: string) => s,
        blue: (s: string) => s,
        fg: (s: string) => s,
        muted: (s: string) => s,
        border: 'gray',
        purple: { bold: (s: string) => s },
    },
}));

vi.mock('readline-sync', async () => ({ default: { question: vi.fn(() => '') } }));

import readlineSync from 'readline-sync';
import { Output } from './output.js';
import {
    __setConfig,
    getConfig,
    isQuiet,
    badge,
    icon,
    success,
    error,
    warn,
    info,
    helpLine,
    print,
    title,
    divider,
    humanizeError,
    extractErrorMessage,
    printError,
    printSummary,
    onError,
    CancelError,
    tableView,
} from './prompt-ui.js';
import Config from './config.js';

const mockIsTTY = vi.mocked(Output.isTTY);

function makeConfig(overrides: Record<string, unknown> = {}) {
    return Config.create({ quiet: false, onError: 'abort', ...overrides });
}

beforeEach(() => {
    vi.clearAllMocks();
    __setConfig(makeConfig());
    mockIsTTY.mockReturnValue(true);
    mockGetBreadcrumbPath.mockReturnValue('');
});

describe('__setConfig / getConfig / isQuiet', () => {
    it('getConfig returns set config', async () => {
        const c = makeConfig();
        __setConfig(c);
        expect(getConfig()).toBe(c);
    });

    it('isQuiet returns true when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        expect(isQuiet()).toBe(true);
    });

    it('isQuiet returns false when not quiet', async () => {
        __setConfig(makeConfig({ quiet: false }));
        expect(isQuiet()).toBe(false);
    });
});

describe('badge', () => {
    it('returns colored string for ok status', async () => {
        const result = badge(3, 'passed', 'ok');
        expect(result).toContain('3 passed');
    });

    it('returns colored string for error status', async () => {
        const result = badge(1, 'failed', 'error');
        expect(result).toContain('1 failed');
    });

    it('returns colored string for warn status', async () => {
        const result = badge(2, 'warnings', 'warn');
        expect(result).toContain('2 warnings');
    });

    it('returns colored string for info status', async () => {
        const result = badge(5, 'tests', 'info');
        expect(result).toContain('5 tests');
    });

    it('falls back to info color for unknown status', async () => {
        const result = badge(1, 'x', 'unknown' as 'ok');
        expect(result).toContain('1 x');
    });
});

describe('icon', () => {
    it('returns unicode check when TTY', async () => {
        mockIsTTY.mockReturnValue(true);
        __setConfig(makeConfig({ quiet: false }));
        expect(icon('ok')).toBe('\u2713');
    });

    it('returns fallback when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        expect(icon('ok')).toBe('OK ');
    });

    it('returns fallback when not TTY', async () => {
        mockIsTTY.mockReturnValue(false);
        __setConfig(makeConfig({ quiet: false }));
        expect(icon('ok')).toBe('OK ');
    });

    it('returns fallback info for unknown name', async () => {
        __setConfig(makeConfig({ quiet: true }));
        expect(icon('unknown' as 'ok')).toBe('i  ');
    });
});

describe('success', () => {
    it('prints green OK message', async () => {
        success('done');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('does not print when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        success('done');
        expect(mockPrint).not.toHaveBeenCalled();
    });
});

describe('error', () => {
    it('prints red error message', async () => {
        error('failed');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints even when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        error('failed');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('warn', () => {
    it('prints yellow warn message', async () => {
        warn('caution');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('info', () => {
    it('prints cyan info message', async () => {
        info('info');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('does not print when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        info('info');
        expect(mockPrint).not.toHaveBeenCalled();
    });
});

describe('helpLine', () => {
    it('prints info line', async () => {
        helpLine('help');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('print', () => {
    it('delegates to output.print', async () => {
        print('hello');
        expect(mockPrint).toHaveBeenCalledWith('hello');
    });
});

describe('title', () => {
    it('uses box with border when not quiet', async () => {
        title('Section');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('uses plain dashes when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        title('Section');
        expect(mockPrint).toHaveBeenCalledWith('--- Section ---');
    });

    it('prepends breadcrumbs when path is non-empty (quiet mode)', async () => {
        mockGetBreadcrumbPath.mockReturnValue('RELEASES');
        __setConfig(makeConfig({ quiet: true }));
        title('Criar versão');
        expect(mockPrint).toHaveBeenCalledWith('--- RELEASES > Criar versão ---');
    });

    it('prepends breadcrumbs when path is non-empty (verbose mode)', async () => {
        mockGetBreadcrumbPath.mockReturnValue('TESTS');
        title('Criar teste');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('divider', () => {
    it('prints a divider', async () => {
        divider();
        expect(mockPrint).toHaveBeenCalledWith('---');
    });
});

describe('humanizeError', () => {
    it('returns known error for rate limit', async () => {
        const result = humanizeError('Rate limit exceeded');
        expect(result?.msg).toContain('Rate limit');
    });

    it('returns known error for 403', async () => {
        const result = humanizeError('forbidden');
        expect(result?.msg).toContain('Sem permissão');
    });

    it('returns known error for connection errors', async () => {
        const result = humanizeError('ECONNRESET');
        expect(result?.msg).toContain('Erro de conexão');
    });

    it('returns null for unknown error', async () => {
        const result = humanizeError('random error');
        expect(result).toBeNull();
    });

    it('returns unknown error for null message', async () => {
        const result = humanizeError(null);
        expect(result?.msg).toBe('Erro desconhecido');
    });

    it('returns unknown error for undefined message', async () => {
        const result = humanizeError(undefined);
        expect(result?.msg).toBe('Erro desconhecido');
    });
});

describe('extractErrorMessage', () => {
    it('extracts from axios errorMessages', async () => {
        const err = { response: { data: { errorMessages: ['Issue type not found'] } } };
        expect(extractErrorMessage(err)).toBe('Issue type not found');
    });

    it('extracts from axios data.message', async () => {
        const err = { response: { data: { message: 'Timeout' } } };
        expect(extractErrorMessage(err)).toBe('Timeout');
    });

    it('extracts from axios string data', async () => {
        const err = { response: { data: 'bad request' } };
        expect(extractErrorMessage(err)).toBe('bad request');
    });

    it('extracts err.message', async () => {
        const err = new Error('generic error');
        expect(extractErrorMessage(err)).toBe('generic error');
    });

    it('returns unknown for null', async () => {
        expect(extractErrorMessage(null)).toBe('Erro desconhecido');
    });

    it('returns unknown for undefined', async () => {
        expect(extractErrorMessage(undefined)).toBe('Erro desconhecido');
    });

    it('handles non-axios error safely', async () => {
        expect(extractErrorMessage({})).toBe('');
    });

    it('appends HTTP status code when available', async () => {
        const err = { response: { status: 429, data: { message: 'Too Many Requests' } } };
        expect(extractErrorMessage(err)).toBe('Too Many Requests (HTTP 429)');
    });

    it('appends URL when config.url is present', async () => {
        const err = {
            response: { data: { errorMessages: ['Not Found'] } },
            config: { url: 'https://jira.example.com/rest/api/2/issue/FOO-123' },
        };
        expect(extractErrorMessage(err)).toBe('Not Found → https://jira.example.com/rest/api/2/issue/FOO-123');
    });

    it('appends both status and URL', async () => {
        const err = {
            response: { status: 400, data: { message: 'Bad Request' } },
            config: { url: 'https://jira.example.com/rest/api/2/issue' },
        };
        expect(extractErrorMessage(err)).toBe('Bad Request (HTTP 400) → https://jira.example.com/rest/api/2/issue');
    });

    it('still works when err.message is fallback and status+url are present', async () => {
        const err = {
            response: { status: 500, data: {} },
            message: 'Internal error',
            config: { url: 'https://jira.example.com/rest/api/2/search' },
        };
        expect(extractErrorMessage(err)).toBe('Internal error (HTTP 500) → https://jira.example.com/rest/api/2/search');
    });
});

describe('printError', () => {
    it('prints known error with hint box when not quiet', async () => {
        __setConfig(makeConfig({ quiet: false }));
        printError('Context', { response: { data: { errorMessages: ['Rate limit atingido'] } } });
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints compact error when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        printError('Context', { response: { data: { errorMessages: ['Rate limit atingido'] } } });
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints unexpected error when unknown', async () => {
        printError('Test', 'something broke');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('printSummary', () => {
    const okResults = [
        { status: 'ok' as const, label: 'test1', message: '' },
        { status: 'ok' as const, label: 'test2', message: '' },
    ];
    const mixedResults = [
        { status: 'ok' as const, label: 'test1', message: '' },
        { status: 'error' as const, label: 'test2', message: 'failed' },
    ];

    it('prints all-pass summary', async () => {
        printSummary(okResults);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints all-pass summary with testExecution', async () => {
        printSummary(okResults, 'EXEC-1');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints mixed summary with errors', async () => {
        printSummary(mixedResults);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints compact summary when quiet', async () => {
        __setConfig(makeConfig({ quiet: true }));
        printSummary(mixedResults);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('handles empty results', async () => {
        printSummary([]);
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('CancelError', () => {
    it('stores cmd and name', async () => {
        const e = new CancelError('/back');
        expect(e.cmd).toBe('/back');
        expect(e.name).toBe('CancelError');
        expect(e.message).toContain('/back');
    });
});

describe('onError', () => {
    it('returns auto action when autoConfirm is true', async () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'skip' }));
        const result = onError('ctx', new Error('fail'));
        expect(result).toBe('skip');
    });

    it('returns abort when autoConfirm and onError=abort', async () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'abort' }));
        const result = onError('ctx', new Error('fail'));
        expect(result).toBe('abort');
    });

    it('throws CancelError when user types navigation cmd', async () => {
        vi.mocked(readlineSync.question).mockReturnValue('/back');
        expect(() => onError('ctx', new Error('fail'))).toThrow('/back');
        vi.mocked(readlineSync.question).mockReturnValue('');
    });
});

describe('tableView', () => {
    it('warns on null data', async () => {
        tableView(null);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('warns on empty data', async () => {
        tableView([]);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('renders table with data', async () => {
        const data = [
            { name: 'test1', status: 'pass' },
            { name: 'test2', status: 'fail' },
        ];
        tableView(data);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('renders table with specific columns', async () => {
        const data = [{ name: 'test1', status: 'pass', extra: 'x' }];
        tableView(data, ['name', 'status']);
        expect(mockPrint).toHaveBeenCalled();
    });

    it('colors status column', async () => {
        const data = [{ name: 'test1', status: 'pass' }];
        tableView(data, ['name', 'status'], 'status');
        expect(mockPrint).toHaveBeenCalled();
    });
});
