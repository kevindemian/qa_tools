import { parseQuotedValue, isPreconditionKey, extractPreconditionKey } from './quoted-string.js';

describe('parseQuotedValue', () => {
    it('returns unquoted value as-is', () => {
        const result = parseQuotedValue('hello', ['hello'], 0);

        expect(result.value).toBe('hello');
        expect(result.endIndex).toBe(1);
    });

    it('unquotes simple quoted value', () => {
        const result = parseQuotedValue('"hello"', ['"hello"'], 0);

        expect(result.value).toBe('hello');
    });

    it('unquotes with escaped double-quotes', () => {
        const result = parseQuotedValue('"he""llo"', ['"he""llo"'], 0);

        expect(result.value).toBe('he"llo');
    });

    it('handles multi-line quoted value', () => {
        const lines = ['"hello', 'world"', 'next'];
        const result = parseQuotedValue('"hello', lines, 0);

        expect(result.value).toBe('hello\nworld');
        expect(result.endIndex).toBe(2);
    });

    it('handles multi-line with escaped quotes', () => {
        const lines = ['"he""llo', 'wo""rld"', 'next'];
        const result = parseQuotedValue('"he""llo', lines, 0);

        expect(result.value).toBe('he"llo\nwo"rld');
        expect(result.endIndex).toBe(2);
    });

    it('returns raw value when unquoted and stop indexes not relevant', () => {
        const lines = ['plain', 'value', 'next'];
        const result = parseQuotedValue('plain', lines, 0);

        expect(result.value).toBe('plain');
        expect(result.endIndex).toBe(1);
    });

    it('returns raw value when value is empty string', () => {
        const result = parseQuotedValue('', [''], 0);

        expect(result.value).toBe('');
        expect(result.endIndex).toBe(1);
    });
});

describe('isPreconditionKey', () => {
    it('returns true for valid project keys', () => {
        expect(isPreconditionKey('ABC-123')).toBeTruthy();
        expect(isPreconditionKey('PREC-001')).toBeTruthy();
        expect(isPreconditionKey('ECSPOL-PRE-42')).toBeTruthy();
        expect(isPreconditionKey('PROJECT-1')).toBeTruthy();
    });

    it('returns false for invalid keys', () => {
        expect(isPreconditionKey('abc-123')).toBeFalsy();
        expect(isPreconditionKey('123-ABC')).toBeFalsy();
        expect(isPreconditionKey('ABC 123')).toBeFalsy();
        expect(isPreconditionKey('')).toBeFalsy();
        expect(isPreconditionKey('ABC-123 (description)')).toBeFalsy();
    });
});

describe('extractPreconditionKey', () => {
    it('extracts key from the beginning of a string', () => {
        expect(extractPreconditionKey('ECSPOL-PRE-42 (descricao)')).toBe('ECSPOL-PRE-42');
        expect(extractPreconditionKey('ABC-123: something')).toBe('ABC-123');
    });

    it('returns null when no key found', () => {
        expect(extractPreconditionKey('just a description')).toBeNull();
        expect(extractPreconditionKey('')).toBeNull();
        expect(extractPreconditionKey('123-ABC')).toBeNull();
    });

    it('handles keys with multiple hyphens', () => {
        expect(extractPreconditionKey('ECSPOL-PRE-42')).toBe('ECSPOL-PRE-42');
    });
});
