export interface ValidationRule {
    field: string;
    required: boolean;
    type: 'string' | 'number' | 'array' | 'object';
    minLength?: number;
    pattern?: RegExp;
}

interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export class ReportValidator {
    constructor(private readonly schema: ValidationRule[]) {}

    validate(data: unknown): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (typeof data !== 'object' || data === null) {
            return { valid: false, errors: ['Expected object, got ' + typeof data], warnings: [] };
        }

        const obj = data as Record<string, unknown>;

        for (const rule of this.schema) {
            this.applyRule(obj, rule, rule.field, errors, warnings);
        }

        this.checkConsistency(obj, warnings);

        return { valid: errors.length === 0, errors, warnings };
    }

    validateAll(data: unknown): ValidationResult {
        const result = this.validate(data);
        if (!result.valid) return result;

        const obj = data as Record<string, unknown>;
        const tests = obj['tests'];
        if (!Array.isArray(tests) || tests.length <= 1) return result;

        const arrayRules = this.schema.filter((r) => /\[\d+]\./.test(r.field));
        if (arrayRules.length === 0) return result;

        const errors: string[] = [...result.errors];
        const warnings: string[] = [...result.warnings];

        for (let i = 1; i < tests.length; i++) {
            for (const rule of arrayRules) {
                const indexedField = rule.field.replace(/\[\d+]\./, `[${i}].`);
                this.applyRule(obj, rule, indexedField, errors, warnings);
            }
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    private applyRule(
        obj: Record<string, unknown>,
        rule: ValidationRule,
        fieldPath: string,
        errors: string[],
        warnings: string[],
    ): void {
        const value = this.resolveField(obj, fieldPath);

        if (value === undefined || value === null) {
            if (rule.required) {
                errors.push('Campo obrigatório "' + fieldPath + '" ausente');
            }
            return;
        }

        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
            errors.push('Campo "' + fieldPath + '" esperava ' + rule.type + ', recebeu ' + actualType);
            return;
        }

        if (rule.type === 'string') {
            const str = value as string;
            if (rule.minLength !== undefined && str.length < rule.minLength) {
                warnings.push('Campo "' + fieldPath + '" muito curto (' + str.length + ' < ' + rule.minLength + ')');
            }
            if (rule.pattern && !rule.pattern.test(str)) {
                errors.push('Campo "' + fieldPath + '" não corresponde ao padrão esperado');
            }
        }

        if (rule.type === 'array') {
            const arr = value as unknown[];
            if (rule.minLength !== undefined && arr.length < rule.minLength) {
                warnings.push('Campo "' + fieldPath + '" muito pequeno (' + arr.length + ' < ' + rule.minLength + ')');
            }
        }
    }

    private checkConsistency(data: Record<string, unknown>, warnings: string[]): void {
        const tests = data['tests'];
        if (!Array.isArray(tests)) return;
        for (let i = 0; i < tests.length; i++) {
            const t = tests[i];
            if (typeof t !== 'object' || t === null) continue;
            const tc = t as Record<string, unknown>;
            if (tc.severity === 'high' && typeof tc.recommendation === 'string' && tc.recommendation.length < 20) {
                warnings.push(
                    'testes[' +
                        i +
                        '].recommendation: severity=high mas recommendation é muito curta (' +
                        tc.recommendation.length +
                        ' < 20)',
                );
            }
            if (typeof tc.recommendation === 'string' && tc.recommendation.length < 10) {
                warnings.push('testes[' + i + '].recommendation: muito curta (' + tc.recommendation.length + ' < 10)');
            }
        }
    }

    private resolveField(obj: Record<string, unknown>, fieldPath: string): unknown {
        const parts = fieldPath.split('.');
        let current: unknown = obj;
        for (const part of parts) {
            const arrMatch = part.match(/^(\w+)\[(\d+)]$/);
            if (arrMatch) {
                const key = arrMatch[1]!;
                const idx = parseInt(arrMatch[2]!, 10);
                if (typeof current !== 'object' || current === null) return undefined;
                const arr = (current as Record<string, unknown>)[key];
                if (!Array.isArray(arr)) return undefined;
                current = arr[idx];
            } else {
                if (typeof current !== 'object' || current === null) return undefined;
                current = (current as Record<string, unknown>)[part];
            }
        }
        return current;
    }
}
