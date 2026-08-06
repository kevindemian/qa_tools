import { expect, vi } from 'vitest';
import { pickIssueAndLinkType, type IssuePickerDeps, type PickedIssue } from '../issue-picker.js';

function makeDeps(overrides?: Partial<IssuePickerDeps>): IssuePickerDeps {
    return {
        listLinkTypes: vi.fn().mockResolvedValue([
            { id: '10600', name: 'Tests' },
            { id: '11701', name: 'Relates' },
        ]),
        getIssue: vi.fn().mockResolvedValue({
            key: 'ECSPOL-731',
            fields: { summary: 'Validar login', issuetype: { name: 'Story' } },
        }),
        ask: vi.fn().mockResolvedValue('ECSPOL-731'),
        showSelect: vi.fn().mockResolvedValue('Tests'),
        askConfirm: vi.fn().mockResolvedValue(true),
        warn: vi.fn(),
        info: vi.fn(),
        ...(overrides ?? {}),
    } as IssuePickerDeps;
}

describe('IssuePicker', () => {
    it('flui digitação + validação + confirmação e retorna keys + linkType', async () => {
        expect.hasAssertions();
        const deps = makeDeps();

        const result = await pickIssueAndLinkType(deps);

        expect(result).toEqual({ keys: ['ECSPOL-731'], linkType: 'Tests' });
        expect(deps.showSelect).toHaveBeenCalledWith(
            expect.stringContaining('Tipo de link') as string,
            expect.arrayContaining([expect.objectContaining({ name: 'Tests' })]) as unknown[],
        );
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-731');
        expect(deps.askConfirm).toHaveBeenCalledWith(expect.stringContaining('ECSPOL-731') as string);
    });

    it('key inexistente → warn explícito e não cria link (retorna null)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({
            getIssue: vi.fn().mockRejectedValue(new Error('404 - issue NOPE-1 not found')),
        });

        const result = await pickIssueAndLinkType(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('NOPE-1') as string);
        expect(deps.askConfirm).not.toHaveBeenCalled();
    });

    it('confirmação negada → retorna null (não cria)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ askConfirm: vi.fn().mockResolvedValue(false) });

        const result = await pickIssueAndLinkType(deps);

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

        const result = await pickIssueAndLinkType(deps);

        expect(result).toEqual({ keys: ['ECSPOL-731', 'ECSPOL-732'], linkType: 'Tests' });
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-731');
        expect(deps.getIssue).toHaveBeenCalledWith('ECSPOL-732');
    });

    it('entrada vazia → warn explícito e retorna null', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ ask: vi.fn().mockResolvedValue('') });

        const result = await pickIssueAndLinkType(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalled();
        expect(deps.getIssue).not.toHaveBeenCalled();
    });

    it('sem link types disponíveis → warn explícito e retorna null', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ listLinkTypes: vi.fn().mockResolvedValue([]) });

        const result = await pickIssueAndLinkType(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('tipo de link') as string);
    });

    it('valida formato da key (PROJ-123) e rejeita formato inválido com warn', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ ask: vi.fn().mockResolvedValue('not-a-key') });

        const result = await pickIssueAndLinkType(deps);

        expect(result).toBeNull();
        expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('formato') as string);
        expect(deps.getIssue).not.toHaveBeenCalled();
    });
});

export type { PickedIssue };
