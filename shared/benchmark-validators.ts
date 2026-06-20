import { ReportValidator, type ValidationRule } from './report-validator.js';
import { rootLogger } from './logger.js';

interface JsonSchemaBody {
    tests?: unknown;
}

interface JsonArrayItem {
    title?: unknown;
    steps?: unknown;
    expectedResult?: unknown;
}

const BENCHMARK_SCHEMA: ValidationRule[] = [
    { field: 'tests', required: true, type: 'array', minLength: 1 },
    { field: 'tests[0].title', required: true, type: 'string' },
    { field: 'tests[0].classification', required: true, type: 'string' },
    { field: 'tests[0].severity', required: true, type: 'string' },
    { field: 'tests[0].recommendation', required: true, type: 'string', minLength: 10 },
];
const benchmarkValidator = new ReportValidator(BENCHMARK_SCHEMA);

export function validateJsonSchema(body: string, minTests: number): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch (err) {
        rootLogger.warn(
            'benchmark-validators: invalid JSON schema: ' + (err instanceof Error ? err.message : String(err)),
        );
        return 'Invalid JSON';
    }
    const obj = parsed as JsonSchemaBody;
    if (!obj.tests || !Array.isArray(obj.tests)) return 'Missing tests array';
    if (obj.tests.length < minTests) return 'Too few tests: ' + obj.tests.length + ' < ' + minTests;
    const result = benchmarkValidator.validateAll(parsed);
    if (!result.valid) return result.errors[0] || 'Validation failed';
    return null;
}

export function validateJsonArray(body: string, minItems: number): string | null {
    try {
        const parsed: unknown = JSON.parse(body);
        if (!Array.isArray(parsed)) return 'Not an array';
        if (parsed.length < minItems) return 'Too few items: ' + parsed.length + ' < ' + minItems;
        for (let i = 0; i < parsed.length; i++) {
            const item = parsed[i] as JsonArrayItem;
            if (!item.title || typeof item.title !== 'string' || item.title.length < 5)
                return 'item[' + i + '] invalid title';
            if (!Array.isArray(item.steps) || item.steps.length === 0) return 'item[' + i + '] invalid steps';
            if (!item.expectedResult || typeof item.expectedResult !== 'string' || item.expectedResult.length < 10)
                return 'item[' + i + '] invalid expectedResult';
        }
        return null;
    } catch (err) {
        rootLogger.warn(
            'benchmark-validators: invalid JSON array: ' + (err instanceof Error ? err.message : String(err)),
        );
        return 'Invalid JSON';
    }
}

export function validateClassify(body: string, expectedCategory: string): string | null {
    const regex = /^(ASSERTION|TIMEOUT|ENVIRONMENT|FLAKY|APPLICATION|UNKNOWN):\s/;
    if (!regex.test(body)) return 'Invalid format: expected CATEGORY: explanation';
    const category = body.split(':')[0] ?? '';
    if (category !== expectedCategory) return 'Wrong category: expected ' + expectedCategory + ' got ' + category;
    return null;
}
