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
            const value = this.resolveField(obj, rule.field);

            if (value === undefined || value === null) {
                if (rule.required) {
                    errors.push('Campo obrigatório "' + rule.field + '" ausente');
                }
                continue;
            }

            const actualType = Array.isArray(value) ? 'array' : typeof value;
            if (actualType !== rule.type) {
                errors.push('Campo "' + rule.field + '" esperava ' + rule.type + ', recebeu ' + actualType);
                continue;
            }

            if (rule.type === 'string') {
                const str = value as string;
                if (rule.minLength !== undefined && str.length < rule.minLength) {
                    warnings.push(
                        'Campo "' + rule.field + '" muito curto (' + str.length + ' < ' + rule.minLength + ')',
                    );
                }
                if (rule.pattern && !rule.pattern.test(str)) {
                    errors.push('Campo "' + rule.field + '" não corresponde ao padrão esperado');
                }
            }

            if (rule.type === 'array') {
                const arr = value as unknown[];
                if (rule.minLength !== undefined && arr.length < rule.minLength) {
                    warnings.push(
                        'Campo "' + rule.field + '" muito pequeno (' + arr.length + ' < ' + rule.minLength + ')',
                    );
                }
            }
        }

        return { valid: errors.length === 0, errors, warnings };
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
