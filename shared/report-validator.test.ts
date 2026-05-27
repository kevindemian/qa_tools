import { ReportValidator, type ValidationRule } from './report-validator';

const testSchema: ValidationRule[] = [
    { field: 'title', required: true, type: 'string', minLength: 3 },
    { field: 'tests', required: true, type: 'array', minLength: 1 },
    { field: 'tests[0].title', required: true, type: 'string' },
    {
        field: 'tests[0].classification',
        required: true,
        type: 'string',
        pattern: /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION)$/,
    },
    { field: 'tests[0].severity', required: true, type: 'string', pattern: /^(high|medium|low)$/ },
    { field: 'optionalField', required: false, type: 'string' },
];

describe('ReportValidator', () => {
    let validator: ReportValidator;

    beforeEach(() => {
        validator = new ReportValidator(testSchema);
    });

    it('validates a complete valid object', () => {
        const data = {
            title: 'Failure Analysis',
            tests: [{ title: 'Login fails', classification: 'ASSERTION', severity: 'high' }],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('returns error for missing required field', () => {
        const data = { tests: [] };
        const result = validator.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Campo obrigatório "title" ausente');
    });

    it('returns error for wrong type', () => {
        const data = { title: 123, tests: [] };
        const result = validator.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Campo "title" esperava string, recebeu number');
    });

    it('returns error for regex mismatch', () => {
        const data = {
            title: 'Analysis',
            tests: [{ title: 'Login fails', classification: 'INVALID', severity: 'high' }],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Campo "tests[0].classification" não corresponde ao padrão esperado');
    });

    it('returns warning for short string', () => {
        const data = {
            title: 'AB',
            tests: [{ title: 'Login fails', classification: 'ASSERTION', severity: 'high' }],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
        expect(result.warnings).toContain('Campo "title" muito curto (2 < 3)');
    });

    it('returns errors for empty array with nested required fields', () => {
        const data = { title: 'Analysis', tests: [] };
        const result = validator.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Campo obrigatório "tests[0].title" ausente');
        expect(result.warnings).toContain('Campo "tests" muito pequeno (0 < 1)');
    });

    it('handles null input', () => {
        const result = validator.validate(null);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Expected object, got object');
    });

    it('passes for optional field missing', () => {
        const data = {
            title: 'Analysis',
            tests: [{ title: 'Login fails', classification: 'ASSERTION', severity: 'high' }],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
    });

    it('resolves nested array field', () => {
        const data = {
            title: 'Analysis',
            tests: [
                { title: 'Login fails', classification: 'ASSERTION', severity: 'high' },
                { title: 'Logout fails', classification: 'TIMEOUT', severity: 'medium' },
            ],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
    });
});

describe('validateAll', () => {
    let validator: ReportValidator;
    const allSchema: ValidationRule[] = [
        { field: 'tests', required: true, type: 'array', minLength: 1 },
        { field: 'tests[0].title', required: true, type: 'string', minLength: 3 },
        { field: 'tests[0].classification', required: true, type: 'string', pattern: /^(A|B)$/ },
    ];

    beforeEach(() => {
        validator = new ReportValidator(allSchema);
    });

    it('passes single test (no-op vs validate)', () => {
        const data = { tests: [{ title: 'Alpha', classification: 'A' }] };
        expect(validator.validateAll(data).valid).toBe(true);
    });

    it('validates all elements, not just [0]', () => {
        const data = {
            tests: [
                { title: 'Alpha', classification: 'A' },
                { title: 'Beta', classification: 'B' },
                { title: 'Gamma', classification: 'A' },
            ],
        };
        const result = validator.validateAll(data);
        expect(result.valid).toBe(true);
    });

    it('rejects when second element fails pattern validation', () => {
        const data = {
            tests: [
                { title: 'Alpha', classification: 'A' },
                { title: 'Beta', classification: 'C' },
                { title: 'Gamma', classification: 'A' },
            ],
        };
        const result = validator.validateAll(data);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('tests[1].classification'))).toBe(true);
    });

    it('returns base result on empty tests array', () => {
        const data = { tests: [] };
        const result = validator.validateAll(data);
        expect(result.valid).toBe(false);
    });

    it('early-returns base result for single-element array', () => {
        const data = { tests: [{ title: 'Alpha', classification: 'A' }] };
        const result = validator.validateAll(data);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
    });

    it('early-returns base result when schema has no array rules', () => {
        const noArrayRules = new ReportValidator([{ field: 'title', required: true, type: 'string' }]);
        const data = { title: 'test', tests: [{ x: 1 }, { x: 2 }] };
        const result = noArrayRules.validateAll(data);
        expect(result.valid).toBe(true);
    });
});

describe('checkConsistency', () => {
    let validator: ReportValidator;

    beforeEach(() => {
        const schema: ValidationRule[] = [
            { field: 'tests', required: true, type: 'array', minLength: 1 },
            { field: 'tests[0].title', required: true, type: 'string' },
            { field: 'tests[0].severity', required: true, type: 'string', pattern: /^(high|medium|low)$/ },
            { field: 'tests[0].recommendation', required: false, type: 'string', minLength: 10 },
        ];
        validator = new ReportValidator(schema);
    });

    it('warns when high severity has short recommendation', () => {
        const data = {
            tests: [{ title: 'Test', severity: 'high', recommendation: 'Fix' }],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
        expect(result.warnings.some((w) => w.includes('severity=high'))).toBe(true);
    });

    it('does not warn when high severity has long recommendation', () => {
        const data = {
            tests: [
                {
                    title: 'Test',
                    severity: 'high',
                    recommendation: 'Fix the login logic by adding proper validation checks',
                },
            ],
        };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
        expect(result.warnings.filter((w) => w.includes('severity=high'))).toHaveLength(0);
    });
});

describe('resolveField — deep nesting', () => {
    let validator: ReportValidator;

    beforeEach(() => {
        const schema: ValidationRule[] = [{ field: 'metadata.tests[0].title', required: true, type: 'string' }];
        validator = new ReportValidator(schema);
    });

    it('resolves 3-level path with array index', () => {
        const data = { metadata: { tests: [{ title: 'Deep test' }] } };
        const result = validator.validate(data);
        expect(result.valid).toBe(true);
    });

    it('reports missing deeply nested field', () => {
        const data = { metadata: { tests: [{}] } };
        const result = validator.validate(data);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('metadata.tests[0].title'))).toBe(true);
    });
});
