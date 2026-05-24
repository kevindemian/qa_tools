import type { TestCase } from '../shared/types';
import TestCaseValidator from './test-case-validator';

describe('TestCaseValidator', () => {
    let validator: TestCaseValidator;

    beforeEach(() => {
        validator = new TestCaseValidator();
    });

    it('returns empty result for empty test list', () => {
        const result = validator.validate([]);
        expect(result).toEqual({ errors: [], warnings: [] });
    });

    it('returns no errors or warnings for valid test with title and steps', () => {
        const tests: TestCase[] = [{ title: 'Login valido', steps: [{ fields: { Action: 'Preencher usuario' } }] }];
        const result = validator.validate(tests);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
    });

    it('returns error for empty title', () => {
        const tests: TestCase[] = [{ title: '', steps: [{ fields: { Action: 'Click' } }] }];
        const result = validator.validate(tests);
        expect(result.errors).toContain('Teste 1: Titulo vazio');
    });

    it('returns warning for duplicate titles', () => {
        const tests: TestCase[] = [
            { title: 'TC1', steps: [{ fields: { Action: 'Abrir pagina' } }] },
            { title: 'TC1', steps: [{ fields: { Action: 'Fechar pagina' } }] },
        ];
        const result = validator.validate(tests);
        expect(result.warnings).toContain('Teste 2: Titulo duplicado "TC1"');
    });

    it('returns error when no steps defined', () => {
        const tests: TestCase[] = [{ title: 'TC1', steps: [] }];
        const result = validator.validate(tests);
        expect(result.errors).toContain('Teste 1 "TC1": Nenhum step definido');
    });

    it('returns warning for step without Action', () => {
        const tests: TestCase[] = [{ title: 'TC1', steps: [{ fields: {} }] }];
        const result = validator.validate(tests);
        expect(result.warnings).toContain('Teste 1 "TC1": Step 1 sem Action');
    });

    it('returns correct errors and warnings for multiple tests with mixed issues', () => {
        const tests: TestCase[] = [
            { title: '', steps: [{ fields: { Action: 'Click' } }] },
            { title: 'TC2', steps: [{ fields: {} }] },
            { title: 'TC2', steps: [{ fields: { Action: 'Type' } }] },
            { title: 'TC3', steps: [] },
        ];
        const result = validator.validate(tests);
        expect(result.errors).toEqual(['Teste 1: Titulo vazio', 'Teste 4 "TC3": Nenhum step definido']);
        expect(result.warnings).toEqual(['Teste 2 "TC2": Step 1 sem Action', 'Teste 3: Titulo duplicado "TC2"']);
    });

    it('handles null title gracefully', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing null fields
        const tests: any = [
            { title: null, steps: [{ fields: { Action: 'Click' } }] },
            { steps: [{ fields: { Action: 'Click' } }] },
        ];
        const result = validator.validate(tests as TestCase[]);
        expect(result.errors).toEqual(['Teste 1: Titulo vazio', 'Teste 2: Titulo vazio']);
    });

    it('handles null or undefined steps gracefully', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing null/undefined steps
        const tests: any = [
            { title: 'TC1', steps: null },
            { title: 'TC2', steps: undefined },
        ];
        const result = validator.validate(tests as TestCase[]);
        expect(result.errors).toEqual(['Teste 1 "TC1": Nenhum step definido', 'Teste 2 "TC2": Nenhum step definido']);
    });

    it('uses "(sem titulo)" fallback when steps missing and title is empty', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing edge case
        const tests: any = [
            { title: '', steps: [] },
            { title: '', steps: null },
        ];
        const result = validator.validate(tests as TestCase[]);
        expect(result.errors).toEqual([
            'Teste 1: Titulo vazio',
            'Teste 1 "(sem titulo)": Nenhum step definido',
            'Teste 2: Titulo vazio',
            'Teste 2 "(sem titulo)": Nenhum step definido',
        ]);
    });
});
