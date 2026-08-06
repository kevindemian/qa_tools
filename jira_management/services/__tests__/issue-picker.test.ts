import { expect, vi } from 'vitest';
import { pickIssueKeys, type IssuePickerDeps, type PickedIssue } from '../issue-picker.js';

function makeDeps(overrides?: Partial<IssuePickerDeps>): IssuePickerDeps {
    return {
        getIssue: vi.fn().mockResolvedValue({
            key: 'ECSPOL-731',
            fields: { summary: 'Validar login', issuetype: { name: 'Story' } },
        }),
        ask: vi.fn().mockResolvedValue('ECSPOL-731'),
        askConfirm: vi.fn().mockResolvedValue(true),
        warn: vi.fn(),
        info: vi.fn(),
        ...(overrides ?? {}),
    } as IssuePickerDeps;
}

describe('IssuePicker', () => {
    it('flui digitação + validação + confirmação e retorna as keys', async () => {
        expect.hasAssertions();
        const deps = makeDeps();

        const result = await pickIssueKeys(deps);

        expect(result).toEqual(['ECSPOL-731']);
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-731');
        expect(deps.askConfirm).toHaveBeenCalledWith(expect.stringContaining('ECSPOL-731') as string);
    });

    it('usa confirmLabel na mensagem de confirmação quando fornecido', async () => {
        expect.hasAssertions();
        const deps = makeDeps();

        const result = await pickIssueKeys(deps, { confirmLabel: 'Test Coverage' });

        expect(result).toEqual(['ECSPOL-731']);
        expect(deps.askConfirm).toHaveBeenCalledWith(expect.stringContaining('Test Coverage') as string);
    });

    it('key inexistente → warn explícito e retorna null (não executa ação)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({
            getIssue: vi.fn().mockRejectedValue(new Error('404 - issue NOPE-1 not found')),
        });

        const result = await pickIssueKeys(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('NOPE-1') as string);
        expect(deps.askConfirm).not.toHaveBeenCalled();
    });

    it('confirmação negada → retorna null (não executa)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ askConfirm: vi.fn().mockResolvedValue(false) });

        const result = await pickIssueKeys(deps);

        expect(result).toBeNull();
        expect(deps.askConfirm).toHaveBeenCalled();
    });

    it('multi-keys separadas por vírgula são validadas e confirmadas', async () => {
        expect.hasAssertions();
        const deps = makeDeps({
            ask: vi.fn().mockResolvedValue('ECSPOL-731, ECSPOL-732'),
            getIssue: vi.fn((key: string) =>
                Promise.resolve({
                    key,
                    fields: { summary: 'sum-' + key, issuetype: { name: 'Story' } },
                }),
            ),
        });

        const result = await pickIssueKeys(deps);

        expect(result).toEqual(['ECSPOL-731', 'ECSPOL-732']);
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-731');
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-732');
    });

    it('entrada vazia → warn explícito e retorna null', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ ask: vi.fn().mockResolvedValue('') });

        const result = await pickIssueKeys(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalled();
        expect(deps.getIssue).not.toHaveBeenCalled();
    });

    it('valida formato da key (PROJ-123) e rejeita formato inválido com warn', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ ask: vi.fn().mockResolvedValue('not-a-key') });

        const result = await pickIssueKeys(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('formato') as string);
        expect(deps.getIssue).not.toHaveBeenCalled();
    });
});

export type { PickedIssue };
