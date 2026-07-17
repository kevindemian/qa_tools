vi.mock('readline-sync', () => ({ question: vi.fn() }));
vi.mock('../output', () => ({
    defaultOutput: { print: vi.fn() },
}));
vi.mock('../box', () => ({
    box: vi.fn<(...args: [string[]]) => string>((lines) => lines.filter(Boolean).join('\n')),
    divider: () => '',
}));
vi.mock('../prompt-format', () => ({
    isQuiet: vi.fn(() => false),
    getConfig: vi.fn(),
    icon: vi.fn(() => '!'),
    error: vi.fn(),
    warn: vi.fn(),
    divider: vi.fn(),
    MSG_UNKNOWN_ERROR: 'Erro desconhecido',
    MSG_UNEXPECTED: 'Erro inesperado',
    SUMMARY_BOX_WIDTH: 72,
    STACK_TRACE_LINES: 4,
}));

import { humanizeError, extractErrorMessage, printError, CancelError, onError } from '../prompt-errors.js';
import { getConfig, isQuiet } from '../prompt-format.js';
import { defaultOutput as output } from '../output.js';
import { createMockConfigInstance } from '../test-utils/factories/index.js';

describe('HumanizeError', () => {
    it('returns unknown error for null input', () => {
        expect(humanizeError(null)?.msg).toBe('Erro desconhecido');
    });

    it('returns unknown error for undefined input', () => {
        expect(humanizeError(undefined)?.msg).toBe('Erro desconhecido');
    });

    it('returns known error for rate limit', () => {
        const r = humanizeError('rate limit exceeded');

        expect(r?.msg).toBe('Rate limit atingido');
    });

    it('returns known error for project not found', () => {
        const r = humanizeError('project "FOO" not found');

        expect(r?.msg).toBe('Projeto não encontrado');
    });

    it('returns known error for unauthorized', () => {
        const r = humanizeError('401 Unauthorized');

        expect(r?.msg).toBe('Token inválido ou expirado');
    });

    it('returns known error for connection reset', () => {
        const r = humanizeError('ECONNRESET');

        expect(r?.msg).toBe('Erro de conexão');
    });

    it('returns null for unknown error', () => {
        const r = humanizeError('some random error');

        expect(r).toBeNull();
    });
});

describe('ExtractErrorMessage', () => {
    it('returns unknown for null', () => {
        expect(extractErrorMessage(null)).toBeTruthy();
    });

    it('extracts axios error message', () => {
        const err = { response: { data: { errorMessages: ['Something broke'] } } };

        expect(extractErrorMessage(err)).toMatch(/Something broke/);
    });

    it('extracts plain Error message', () => {
        expect(extractErrorMessage(new Error('fail'))).toMatch(/fail/);
    });

    it('includes HTTP status and URL', () => {
        const err = {
            response: { status: 404, data: { message: 'Not Found' } },
            config: { url: 'https://jira.example.com' },
        };
        const msg = extractErrorMessage(err);

        expect(msg).toMatch(/Not Found/);
        expect(msg).toMatch(/HTTP 404/);
    });
});

describe('PrintError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints error box with context and message', () => {
        printError('contexto', new Error('something failed'));

        expect(output['print']).toHaveBeenCalledWith(expect.any(String));
    });

    it('prints single line when quiet', () => {
        vi.mocked(isQuiet).mockReturnValue(true);
        printError('ctx', new Error('err'));

        expect(output['print']).toHaveBeenCalledWith(expect.stringMatching(/ctx/));
    });
});

describe('CancelError', () => {
    it('stores command name', () => {
        const e = new CancelError('/exit');

        expect(e.cmd).toBe('/exit');
        expect(e.message).toMatch('/exit');
        expect(e.name).toBe('CancelError');
    });
});

describe('OnError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getConfig).mockReturnValue(createMockConfigInstance());
    });

    it('returns abort when autoConfirm and onError is abort', () => {
        const mockConfig = createMockConfigInstance();
        mockConfig.get = function <T = string>(k: string): T {
            return (k === 'autoConfirm' ? 'true' : 'abort') as T;
        };
        vi.mocked(getConfig).mockReturnValue(mockConfig);
        const r = onError('ctx', new Error('fail'));

        expect(r).toBe('abort');
    });

    it('returns skip when autoConfirm and onError is skip', () => {
        const mockConfig = createMockConfigInstance();
        mockConfig.get = function <T = string>(k: string): T {
            return (k === 'autoConfirm' ? 'true' : 'skip') as T;
        };
        vi.mocked(getConfig).mockReturnValue(mockConfig);
        const r = onError('ctx', new Error('fail'));

        expect(r).toBe('skip');
    });
});
