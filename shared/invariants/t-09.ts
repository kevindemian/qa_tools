import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail } from '../artifact-validator.js';

export const invariantNumericConsistency: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    if (typeof artifact !== 'object' || artifact === null)
        return [pass('T-09', 'No numeric consistency check applicable')];
    const obj = artifact as Record<string, unknown>;
    const numericKeys = Object.keys(obj).filter((k) => /count|total|size|num|number_of/i.test(k));
    if (numericKeys.length === 0) return [pass('T-09', 'No numeric fields to validate')];
    for (const key of numericKeys) {
        const value = Reflect.get(obj, key);
        if (typeof value !== 'number') continue;
        const arrayKey = key.replace(/count|_count|total|_total|num_|number_of_/i, '').replace(/_$/, '') + 's';
        const array = Reflect.get(obj, arrayKey) as unknown[] | undefined;
        if (Array.isArray(array) && array.length !== value) {
            return [fail('T-09', `Field "${key}" = ${value} but "${arrayKey}" has ${array.length} elements`)];
        }
    }
    return [pass('T-09', 'Numeric data consistent')];
};
