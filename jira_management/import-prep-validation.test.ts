import { _runValidationRules, _printValidationMessages } from './import-prep-validation.js';

const mockWarn = vi.fn();
const mockError = vi.fn();

vi.mock('../shared/logger', () => ({
    rootLogger: {
        child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('../shared/prompt', () => ({
    confirm: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => {
        mockWarn(...args);
    },
    error: (...args: unknown[]) => {
        mockError(...args);
    },
}));

vi.mock('../shared/state', () => ({
    load: vi.fn().mockReturnValue({}),
    update: vi.fn(),
}));

vi.mock('../shared/config-accessor.js', () => ({
    get: vi.fn(),
}));

describe('RunValidationRules', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        const tests = [{ title: 123, steps: 'invalid' }];
        const { errors } = _runValidationRules(tests);

        expect(errors.length).toBeGreaterThan(0);
    });
});

describe('PrintValidationMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
