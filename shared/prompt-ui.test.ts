const mockPrint = jest.fn();

jest.mock('./output', () => ({
    Output: { isTTY: jest.fn(), columns: jest.fn(() => 80) },
    defaultOutput: { print: mockPrint },
}));

jest.mock('./logger', () => ({
    rootLogger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        writeFileOnly: jest.fn(),
        filePath: '/tmp/test.log',
    },
    Logger: class {
        info = jest.fn();
        error = jest.fn();
        warn = jest.fn();
        debug = jest.fn();
        writeFileOnly = jest.fn();
        get filePath() {
            return '/tmp/test.log';
        }
    },
}));

jest.mock('./box', () => ({
    box: jest.fn((lines: string[]) => lines.join('\n')),
    divider: jest.fn(() => '---'),
    visibleWidth: jest.fn((s: string) => s.length),
}));

jest.mock('./palette', () => ({
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

jest.mock('readline-sync', () => ({ question: jest.fn(() => '') }));

import readlineSync from 'readline-sync';
import { Output } from './output';
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
} from './prompt-ui';
import Config from './config';

const mockIsTTY = Output.isTTY as jest.Mock;

function makeConfig(overrides: Record<string, unknown> = {}) {
    return Config.create({ quiet: false, onError: 'abort', ...overrides });
}

beforeEach(() => {
    jest.clearAllMocks();
    __setConfig(makeConfig());
    mockIsTTY.mockReturnValue(true);
});

describe('__setConfig / getConfig / isQuiet', () => {
    it('getConfig returns set config', () => {
        const c = makeConfig();
        __setConfig(c);
        expect(getConfig()).toBe(c);
    });

    it('isQuiet returns true when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        expect(isQuiet()).toBe(true);
    });

    it('isQuiet returns false when not quiet', () => {
        __setConfig(makeConfig({ quiet: false }));
        expect(isQuiet()).toBe(false);
    });
});

describe('badge', () => {
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

describe('icon', () => {
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

describe('success', () => {
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

describe('error', () => {
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

describe('warn', () => {
    it('prints yellow warn message', () => {
        warn('caution');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('info', () => {
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

describe('helpLine', () => {
    it('prints info line', () => {
        helpLine('help');
        expect(mockPrint).toHaveBeenCalled();
    });
});

describe('print', () => {
    it('delegates to output.print', () => {
        print('hello');
        expect(mockPrint).toHaveBeenCalledWith('hello');
    });
});

describe('title', () => {
    it('uses box with border when not quiet', () => {
        title('Section');
        expect(mockPrint).toHaveBeenCalled();
    });

    it('uses plain dashes when quiet', () => {
        __setConfig(makeConfig({ quiet: true }));
        title('Section');
        expect(mockPrint).toHaveBeenCalledWith('--- Section ---');
    });
});

describe('divider', () => {
    it('prints a divider', () => {
        divider();
        expect(mockPrint).toHaveBeenCalledWith('---');
    });
});

describe('humanizeError', () => {
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

describe('extractErrorMessage', () => {
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
});

describe('printError', () => {
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

describe('printSummary', () => {
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

describe('onError', () => {
    it('returns auto action when autoConfirm is true', async () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'skip' }));
        const result = await onError('ctx', new Error('fail'));
        expect(result).toBe('skip');
    });

    it('returns abort when autoConfirm and onError=abort', async () => {
        __setConfig(makeConfig({ autoConfirm: true, onError: 'abort' }));
        const result = await onError('ctx', new Error('fail'));
        expect(result).toBe('abort');
    });

    it('throws CancelError when user types navigation cmd', async () => {
        (readlineSync.question as jest.Mock).mockReturnValue('/back');
        await expect(onError('ctx', new Error('fail'))).rejects.toThrow('/back');
        (readlineSync.question as jest.Mock).mockReturnValue('');
    });
});

describe('tableView', () => {
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
