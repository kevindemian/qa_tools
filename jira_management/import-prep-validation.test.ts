import { _runValidationRules, _printValidationMessages } from './import-prep-validation';

const mockWarn = jest.fn();
const mockError = jest.fn();

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    },
}));

jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    info: jest.fn(),
    warn: (...args: unknown[]) => {
        mockWarn(...args);
    },
    error: (...args: unknown[]) => {
        mockError(...args);
    },
}));

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../shared/config', () => ({
    get: jest.fn(),
}));

describe('_runValidationRules', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('passes valid tests with no warnings', () => {
        const tests = [
            { title: 'TC1', steps: [{ fields: { Action: 'Step1' } }] },
            { title: 'TC2', steps: [{ fields: { Action: 'Step2' } }] },
        ];
        const { errors, warnings } = _runValidationRules(tests);
        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(0);
    });

    it('detects duplicate titles', () => {
        const tests = [
            { title: 'Duplicated', steps: [{ fields: { Action: 'Step1' } }] },
            { title: 'Duplicated', steps: [{ fields: { Action: 'Step2' } }] },
        ];
        const { warnings } = _runValidationRules(tests);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('Titulo duplicado');
    });

    it('warns on step without Action', () => {
        const tests = [{ title: 'TC1', steps: [{ fields: { Action: '' } }] }];
        const { warnings } = _runValidationRules(tests);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('sem Action');
    });

    it('reports schema errors on invalid test', () => {
        // @ts-expect-error — R9: testing schema validation with intentionally invalid types
        const tests: import('../shared/types').TestCase[] = [{ title: 123, steps: 'invalid' }];
        const { errors } = _runValidationRules(tests);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('_printValidationMessages', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prints warnings up to MAX_WARNINGS_TO_SHOW', () => {
        _printValidationMessages([], ['warn1', 'warn2']);
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Avisos'));
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('warn1'));
    });

    it('prints truncated message when warnings exceed limit', () => {
        const warnings = Array.from({ length: 10 }, (_, i) => 'warn' + i);
        _printValidationMessages([], warnings);
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('e mais'));
    });

    it('prints errors and advice', () => {
        _printValidationMessages(['err1'], []);
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Erros'));
        expect(mockError).toHaveBeenCalledWith(expect.stringContaining('err1'));
        expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('Corrija'));
    });

    it('handles empty warnings and errors', () => {
        _printValidationMessages([], []);
        expect(mockWarn).not.toHaveBeenCalledWith(expect.stringContaining('Avisos'));
        expect(mockError).not.toHaveBeenCalledWith(expect.stringContaining('Erros'));
    });
});
