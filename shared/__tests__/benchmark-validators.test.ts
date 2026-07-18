import { validateJsonSchema, validateJsonArray, validateClassify } from '../quality/benchmark-validators.js';

const VALID_SCHEMA_ITEM = {
    title: 'Login test',
    classification: 'A',
    severity: 'high',
    recommendation: 'Fix this properly now with enough text',
};

const VALID_ARRAY_ITEM = {
    title: 'Login form displays',
    steps: ['Navigate to login page'],
    expectedResult: 'User sees a login form with username and password fields',
};

// ---------------------------------------------------------------------------
// validateJsonSchema
// ---------------------------------------------------------------------------

describe('ValidateJsonSchema', () => {
    it('returns null for valid JSON with 2 test cases', () => {
        const body = JSON.stringify({ tests: [VALID_SCHEMA_ITEM, VALID_SCHEMA_ITEM] });

        expect(validateJsonSchema(body, 1)).toBeNull();
    });

    it('returns error for malformed JSON (parse error)', () => {
        const result = validateJsonSchema('{ broken json', 1);

        expect(result).toBe('Invalid JSON');
    });

    it('returns error when tests array is empty', () => {
        const body = JSON.stringify({ tests: [] });
        const result = validateJsonSchema(body, 1);

        expect(result).toContain('Too few tests');
    });

    it('returns error when test case lacks title field', () => {
        const body = JSON.stringify({
            tests: [
                { classification: 'A', severity: 'high', recommendation: 'Fix this properly now with enough text' },
            ],
        });
        const result = validateJsonSchema(body, 1);

        expect(result).not.toBeNull();
        expect(result).toContain('title');
    });

    it('returns error when test case lacks severity field', () => {
        const body = JSON.stringify({
            tests: [
                { title: 'Login test', classification: 'A', recommendation: 'Fix this properly now with enough text' },
            ],
        });
        const result = validateJsonSchema(body, 1);

        expect(result).not.toBeNull();
        expect(result).toContain('severity');
    });
});

// ---------------------------------------------------------------------------
// validateJsonArray
// ---------------------------------------------------------------------------

describe('ValidateJsonArray', () => {
    it('returns null for valid JSON array', () => {
        const body = JSON.stringify([VALID_ARRAY_ITEM]);

        expect(validateJsonArray(body, 1)).toBeNull();
    });

    it('returns error when array is empty', () => {
        const body = JSON.stringify([]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('Too few items');
    });

    it('returns error when an element lacks steps', () => {
        const body = JSON.stringify([
            {
                title: 'Login form displays',
                expectedResult: 'User sees a login form with username and password fields',
            },
        ]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('invalid steps');
    });

    it('returns error when expectedResult is shorter than 10 characters', () => {
        const body = JSON.stringify([{ title: 'Login form displays', steps: ['Step 1'], expectedResult: 'Short' }]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('invalid expectedResult');
    });

    it('returns error when body is an object instead of an array', () => {
        const body = JSON.stringify({ title: 'not an array' });
        const result = validateJsonArray(body, 1);

        expect(result).toBe('Not an array');
    });
});

// ---------------------------------------------------------------------------
// validateClassify
// ---------------------------------------------------------------------------

describe('ValidateClassify', () => {
    it('returns null when body contains the expected category', () => {
        expect(validateClassify('ASSERTION: expected true got false', 'ASSERTION')).toBeNull();
    });

    it('returns error when body contains a different category', () => {
        const result = validateClassify('TIMEOUT: request timed out after 30s', 'ASSERTION');

        expect(result).toContain('Wrong category');
        expect(result).toContain('ASSERTION');
        expect(result).toContain('TIMEOUT');
    });

    it('returns error for empty body', () => {
        const result = validateClassify('', 'ASSERTION');

        expect(result).toContain('Invalid format');
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateJsonSchema
// ---------------------------------------------------------------------------

describe('ValidateJsonSchema — edge cases', () => {
    it('returns error when tests field is not an array', () => {
        const body = JSON.stringify({ tests: 'not-an-array' });

        expect(validateJsonSchema(body, 1)).toBe('Missing tests array');
    });

    it('returns error when tests field is null', () => {
        const body = JSON.stringify({ tests: null });

        expect(validateJsonSchema(body, 1)).toBe('Missing tests array');
    });

    it('returns error when minTests is higher than available test count', () => {
        const body = JSON.stringify({ tests: [VALID_SCHEMA_ITEM] });
        const result = validateJsonSchema(body, 10);

        expect(result).toContain('Too few tests');
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateJsonArray
// ---------------------------------------------------------------------------

describe('ValidateJsonArray — edge cases', () => {
    it('returns error when title is shorter than 5 characters', () => {
        const body = JSON.stringify([
            { title: 'AB', steps: ['Step 1'], expectedResult: 'Long enough expected result text here' },
        ]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('invalid title');
    });

    it('returns error when title field is missing', () => {
        const body = JSON.stringify([{ steps: ['Step 1'], expectedResult: 'Long enough expected result text here' }]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('invalid title');
    });

    it('returns error when steps is not an array', () => {
        const body = JSON.stringify([
            { title: 'Valid title', steps: 'not-an-array', expectedResult: 'Long enough expected result text here' },
        ]);
        const result = validateJsonArray(body, 1);

        expect(result).toContain('invalid steps');
    });
});

// ---------------------------------------------------------------------------
// Edge cases for validateClassify
// ---------------------------------------------------------------------------

describe('ValidateClassify — edge cases', () => {
    it('accepts any of the valid category prefixes', () => {
        expect(validateClassify('TIMEOUT: connection dropped', 'TIMEOUT')).toBeNull();
        expect(validateClassify('ENVIRONMENT: missing env var', 'ENVIRONMENT')).toBeNull();
        expect(validateClassify('FLAKY: intermittently fails', 'FLAKY')).toBeNull();
        expect(validateClassify('APPLICATION: null pointer', 'APPLICATION')).toBeNull();
        expect(validateClassify('UNKNOWN: no clear cause', 'UNKNOWN')).toBeNull();
    });

    it('returns error when body has no colon separator', () => {
        const result = validateClassify('ASSERTION without colon', 'ASSERTION');

        expect(result).toContain('Invalid format');
    });

    it('returns error when body contains only whitespace', () => {
        const result = validateClassify('   ', 'ASSERTION');

        expect(result).toContain('Invalid format');
    });
});
