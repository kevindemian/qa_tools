import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config-accessor.js', () => ({
    default: { get: vi.fn(() => '') },
    get: vi.fn(() => ''),
}));
vi.mock('../ui/output.js', () => ({
    defaultOutput: { print: vi.fn() },
    Output: { isTTY: () => false },
}));
vi.mock('../ui/box.js', () => ({
    box: vi.fn<(...args: [string[]]) => string>((lines) => lines.filter(Boolean).join('\n')),
}));
vi.mock('../ui/prompt-ui.js', () => ({
    isQuiet: vi.fn(() => false),
}));
vi.mock('../ui/prompt-errors.js', () => ({
    extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
    humanizeError: vi.fn(() => null),
}));
vi.mock('../logger.js', () => ({
    rootLogger: { warn: vi.fn() },
}));

import Config from '../config-accessor.js';
import { summarizeContext, renderStepError, showStepError, buildAutoConfirmHandler } from '../ui/error-report.js';
import { defaultOutput as output } from '../ui/output.js';
import { rootLogger } from '../logger.js';

const baseStepInfo = {
    step: 'step-1',
    label: 'Step 1 de "Teste"',
    totalSteps: 2,
    completedSteps: [] as Array<{ step: string; ok: boolean; detail: string; duration: number }>,
    currentInput: { fields: { summary: 'Teste', project: { key: 'ECSPOL' }, issuetype: { name: 'Test' } } },
};

function mockOnError(value: string): void {
    vi.mocked(Config.get).mockReturnValue(value);
}

describe('summarizeContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns dash for null and undefined', () => {
        expect(summarizeContext(null)).toBe('—');
        expect(summarizeContext(undefined)).toBe('—');
    });

    it('summarizes a Jira payload with project, title and type', () => {
        const summary = summarizeContext({
            fields: {
                project: { key: 'ECSPOL' },
                summary: 'Validar notificação de erro',
                issuetype: { name: 'Bug' },
                labels: ['regressão', 'crítica'],
            },
        });
        expect(summary).toContain('Projeto: ECSPOL');
        expect(summary).toContain('Título: Validar notificação de erro');
        expect(summary).toContain('Tipo: Bug');
        expect(summary).toContain('Labels: regressão, crítica');
    });

    it('summarizes a step input with action, data and expected result', () => {
        const summary = summarizeContext({
            fields: {
                Action: 'Clicar em salvar',
                Data: 'form válido',
                'Expected Result': 'mensagem de sucesso exibida',
            },
        });
        expect(summary).toContain('Ação: Clicar em salvar');
        expect(summary).toContain('Dados: form válido');
        expect(summary).toContain('Resultado: mensagem de sucesso exibida');
    });

    it('falls back to truncated JSON for unknown shapes', () => {
        const big = { data: 'x'.repeat(1000) };
        const summary = summarizeContext(big);
        expect(summary.length).toBeLessThanOrEqual(300);
        expect(summary.endsWith('...')).toBe(true);
    });

    it('never throws on circular input', () => {
        const circular: Record<string, unknown> = { self: null };
        circular['self'] = circular;
        expect(() => summarizeContext(circular)).not.toThrow();
    });
});

describe('showStepError / buildAutoConfirmHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(output.print).mockClear();
    });

    it('resolves skip for ON_ERROR=skip', async () => {
        mockOnError('skip');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('skip');
        expect(output.print).toHaveBeenCalled();
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('pulando'));
    });

    it('resolves skip for ON_ERROR=continue', async () => {
        mockOnError('continue');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('skip');
    });

    it('resolves abort for ON_ERROR=abort', async () => {
        mockOnError('abort');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('abort');
    });

    it('resolves retry for ON_ERROR=retry', async () => {
        mockOnError('retry');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('retry');
    });

    it('resolves rollback for ON_ERROR=rollback', async () => {
        mockOnError('rollback');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('rollback');
    });

    it('defaults to abort for unknown ON_ERROR values', async () => {
        mockOnError('mystery');
        const decision = await showStepError(new Error('boom'), baseStepInfo);
        expect(decision).toBe('abort');
        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('desconhecido'));
    });

    it('buildAutoConfirmHandler returns the deterministic handler', async () => {
        mockOnError('skip');
        const handler = buildAutoConfirmHandler();
        const decision = await handler(new Error('boom'), baseStepInfo);
        expect(decision).toBe('skip');
    });
});

describe('renderStepError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints a clean error box without raw JSON dump', () => {
        vi.mocked(output.print).mockClear();
        renderStepError(new Error('rate limit exceeded'), baseStepInfo);
        expect(output.print).toHaveBeenCalled();
        const firstCall = vi.mocked(output.print).mock.calls[0] ?? [];
        const boxed = String(firstCall[0] ?? '');
        expect(boxed).toContain('falhou');
        expect(boxed).not.toContain('"fields"');
    });

    it('renders previous completed steps', () => {
        const info = {
            ...baseStepInfo,
            completedSteps: [
                { step: 'step-1', ok: true, detail: 'ok', duration: 10 },
                { step: 'step-2', ok: false, detail: 'falhou', duration: 10 },
            ],
        };
        renderStepError(new Error('boom'), info);
        expect(output.print).toHaveBeenCalled();
    });

    it('still logs structured warning when quiet', () => {
        vi.mocked(output.print).mockClear();
        renderStepError(new Error('boom'), { ...baseStepInfo, currentInput: null });
        expect(rootLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('step-error'),
            expect.objectContaining({ step: 'step-1' }),
        );
    });
});
