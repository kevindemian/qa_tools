const mockPrint = vi.hoisted(() => vi.fn());
const mockGetBreadcrumbPath = vi.hoisted(() => vi.fn(() => ''));

vi.mock('./breadcrumbs', () => ({
    getBreadcrumbPath: mockGetBreadcrumbPath,
}));

vi.mock('./output', () => ({
    Output: { isTTY: vi.fn(), columns: vi.fn(() => 80) },
    defaultOutput: { print: mockPrint },
}));

vi.mock('./logger', () => ({
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

vi.mock('./box', () => ({
    box: vi.fn((lines: string[]) => lines.join('\n')),
    divider: vi.fn(() => '---'),
    visibleWidth: vi.fn((s: string) => s.length),
}));

vi.mock('./palette', () => ({
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

vi.mock('readline-sync', () => ({ default: { question: vi.fn(() => '') } }));

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

const mockIsTTY = vi.spyOn(Output, 'isTTY');

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
    it('getConfig returns set config', () => {
        const c = makeConfig();
        __setConfig(c);

        expect(getConfig()).toBe(c);
    });

    it('isQuiet returns true when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));

        expect(isQuiet()).toBeTruthy();
    });

    it('isQuiet returns false when not quiet', () => {
        __setConfig(makeConfig({ quiet: false }));

        expect(isQuiet()).toBeFalsy();
    });
});

describe('Badge', () => {
    it('returns colored string for ok status', () => {
        const result = badge(3, 'passed', 'ok');

        expect(result).toContain('3 passed');
    });

    it('returns colored string for error status', () => {
        const result = badge(1, 'failed', 'error');

        expect(result).toContain('1 failed');
    });

    it('returns colored string for warn status', () => {
        const result = badge(2, 'warnings', 'warn');

        expect(result).toContain('2 warnings');
    });

    it('returns colored string for info status', () => {
        const result = badge(5, 'tests', 'info');

        expect(result).toContain('5 tests');
    });

    it('falls back to info color for unknown status', () => {
        const result = badge(1, 'x', 'unknown' as 'ok');

        expect(result).toContain('1 x');
    });
});

describe('Icon', () => {
    it('returns unicode check when TTY', () => {
        mockIsTTY.mockReturnValue(true);
        __setConfig(makeConfig({ quiet: false }));

        expect(icon('ok')).toBe('\u2713');
    });

    it('returns fallback when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));

        expect(icon('ok')).toBe('OK ');
    });

    it('returns fallback when not TTY', () => {
        mockIsTTY.mockReturnValue(false);
        __setConfig(makeConfig({ quiet: false }));

        expect(icon('ok')).toBe('OK ');
    });

    it('returns fallback info for unknown name', () => {
        __setConfig(makeConfig({ quiet: true }));

        expect(icon('unknown' as 'ok')).toBe('i  ');
    });
});

describe('Success', () => {
    it('prints green OK message', () => {
        success('done');

        expect(mockPrint).toHaveBeenCalled();
    });

    it('does not print when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        success('done');

        expect(mockPrint).not.toHaveBeenCalled();
    });
});

describe('Error', () => {
    it('prints red error message', () => {
        error('failed');

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints even when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        error('failed');

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('Warn', () => {
    it('prints yellow warn message', () => {
        warn('caution');

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('Info', () => {
    it('prints cyan info message', () => {
        info('info');

        expect(mockPrint).toHaveBeenCalled();
    });

    it('does not print when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        info('info');

        expect(mockPrint).not.toHaveBeenCalled();
    });
});

describe('HelpLine', () => {
    it('prints info line', () => {
        helpLine('help');

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('Print', () => {
    it('delegates to output.print', () => {
        print('hello');

        expect(mockPrint).toHaveBeenCalledWith('hello');
    });
});

describe('Title', () => {
    it('uses box with border when not quiet', () => {
        title('Section');

        expect(mockPrint).toHaveBeenCalled();
    });

    it('uses plain dashes when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        title('Section');

        expect(mockPrint).toHaveBeenCalledWith('--- Section ---');
    });

    it('prepends breadcrumbs when path is non-empty (quiet mode)', () => {
        mockGetBreadcrumbPath.mockReturnValue('RELEASES');
        __setConfig(makeConfig({ quiet: true }));
        title('Criar versão');

        expect(mockPrint).toHaveBeenCalledWith('--- RELEASES > Criar versão ---');
    });

    it('prepends breadcrumbs when path is non-empty (verbose mode)', () => {
        mockGetBreadcrumbPath.mockReturnValue('TESTS');
        title('Criar teste');

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('Divider', () => {
    it('prints a divider', () => {
        divider();

        expect(mockPrint).toHaveBeenCalledWith('---');
    });
});

describe('HumanizeError', () => {
    it('returns known error for rate limit', () => {
        const result = humanizeError('Rate limit exceeded');

        expect(result?.msg).toContain('Rate limit');
    });

    it('returns known error for 403', () => {
        const result = humanizeError('forbidden');

        expect(result?.msg).toContain('Sem permissão');
    });

    it('returns known error for connection errors', () => {
        const result = humanizeError('ECONNRESET');

        expect(result?.msg).toContain('Erro de conexão');
    });

    it('returns null for unknown error', () => {
        const result = humanizeError('random error');

        expect(result).toBeNull();
    });

    it('returns unknown error for null message', () => {
        const result = humanizeError(null);

        expect(result?.msg).toBe('Erro desconhecido');
    });

    it('returns unknown error for undefined message', () => {
        const result = humanizeError(undefined);

        expect(result?.msg).toBe('Erro desconhecido');
    });
});

describe('ExtractErrorMessage', () => {
    it('extracts from axios errorMessages', () => {
        const err = { response: { data: { errorMessages: ['Issue type not found'] } } };

        expect(extractErrorMessage(err)).toBe('Issue type not found');
    });

    it('extracts from axios data.message', () => {
        const err = { response: { data: { message: 'Timeout' } } };

        expect(extractErrorMessage(err)).toBe('Timeout');
    });

    it('extracts from axios string data', () => {
        const err = { response: { data: 'bad request' } };

        expect(extractErrorMessage(err)).toBe('bad request');
    });

    it('extracts err.message', () => {
        const err = new Error('generic error');

        expect(extractErrorMessage(err)).toBe('generic error');
    });

    it('returns unknown for null', () => {
        expect(extractErrorMessage(null)).toBe('Erro desconhecido');
    });

    it('returns unknown for undefined', () => {
        expect(extractErrorMessage(undefined)).toBe('Erro desconhecido');
    });

    it('handles non-axios error safely', () => {
        expect(extractErrorMessage({})).toBe('');
    });

    it('appends HTTP status code when available', () => {
        const err = { response: { status: 429, data: { message: 'Too Many Requests' } } };

        expect(extractErrorMessage(err)).toBe('Too Many Requests (HTTP 429)');
    });

    it('appends URL when config.url is present', () => {
        const err = {
            response: { data: { errorMessages: ['Not Found'] } },
            config: { url: 'https://jira.example.com/rest/api/2/issue/FOO-123' },
        };

        expect(extractErrorMessage(err)).toBe('Not Found → https://jira.example.com/rest/api/2/issue/FOO-123');
    });

    it('appends both status and URL', () => {
        const err = {
            response: { status: 400, data: { message: 'Bad Request' } },
            config: { url: 'https://jira.example.com/rest/api/2/issue' },
        };

        expect(extractErrorMessage(err)).toBe('Bad Request (HTTP 400) → https://jira.example.com/rest/api/2/issue');
    });

    it('still works when err.message is fallback and status+url are present', () => {
        const err = {
            response: { status: 500, data: {} },
            message: 'Internal error',
            config: { url: 'https://jira.example.com/rest/api/2/search' },
        };

        expect(extractErrorMessage(err)).toBe('Internal error (HTTP 500) → https://jira.example.com/rest/api/2/search');
    });
});

describe('PrintError', () => {
    it('prints known error with hint box when not quiet', () => {
        __setConfig(makeConfig({ quiet: false }));
        printError('Context', { response: { data: { errorMessages: ['Rate limit atingido'] } } });

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints compact error when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        printError('Context', { response: { data: { errorMessages: ['Rate limit atingido'] } } });

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints unexpected error when unknown', () => {
        printError('Test', 'something broke');

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('PrintSummary', () => {
    const okResults = [
        { status: 'ok' as const, label: 'test1', message: '' },
        { status: 'ok' as const, label: 'test2', message: '' },
    ];
    const mixedResults = [
        { status: 'ok' as const, label: 'test1', message: '' },
        { status: 'error' as const, label: 'test2', message: 'failed' },
    ];

    it('prints all-pass summary', () => {
        printSummary(okResults);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints all-pass summary with testExecution', () => {
        printSummary(okResults, 'EXEC-1');

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints mixed summary with errors', () => {
        printSummary(mixedResults);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('prints compact summary when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        printSummary(mixedResults);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('handles empty results', () => {
        printSummary([]);

        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('CancelError', () => {
    it('stores cmd and name', () => {
        const e = new CancelError('/back');

        expect(e.cmd).toBe('/back');
        expect(e.name).toBe('CancelError');
        expect(e.message).toContain('/back');
    });
});

describe('OnError', () => {
    it('returns auto action when autoConfirm is true', () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'skip' }));
        const result = onError('ctx', new Error('fail'));

        expect(result).toBe('skip');
    });

    it('returns abort when autoConfirm and onError=abort', () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'abort' }));
        const result = onError('ctx', new Error('fail'));

        expect(result).toBe('abort');
    });

    it('throws CancelError when user types navigation cmd', () => {
        vi.spyOn(readlineSync, 'question').mockReturnValue('/back');

        expect(() => onError('ctx', new Error('fail'))).toThrow('/back');

        vi.spyOn(readlineSync, 'question').mockReturnValue('');
    });
});

describe('TableView', () => {
    it('warns on null data', () => {
        tableView(null);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('warns on empty data', () => {
        tableView([]);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('renders table with data', () => {
        const data = [
            { name: 'test1', status: 'pass' },
            { name: 'test2', status: 'fail' },
        ];
        tableView(data);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('renders table with specific columns', () => {
        const data = [{ name: 'test1', status: 'pass', extra: 'x' }];
        tableView(data, ['name', 'status']);

        expect(mockPrint).toHaveBeenCalled();
    });

    it('colors status column', () => {
        const data = [{ name: 'test1', status: 'pass' }];
        tableView(data, ['name', 'status'], 'status');

        expect(mockPrint).toHaveBeenCalled();
    });
});
