import { normalizeFieldName, sanitizeCellValue } from '../field-names.js';

describe('NormalizeFieldName', () => {
    it('preserves canonical Action', () => {
        expect(normalizeFieldName('Action')).toBe('Action');
    });

    it('preserves canonical Data', () => {
        expect(normalizeFieldName('Data')).toBe('Data');
    });

    it('preserves canonical Expected Result', () => {
        expect(normalizeFieldName('Expected Result')).toBe('Expected Result');
    });

    it('normalizes lowercase expected result', () => {
        expect(normalizeFieldName('expected result')).toBe('Expected Result');
    });

    it('normalizes ExpectedResult (camelCase, no space)', () => {
        expect(normalizeFieldName('ExpectedResult')).toBe('Expected Result');
    });

    it('normalizes expected_result (underscore)', () => {
        expect(normalizeFieldName('expected_result')).toBe('Expected Result');
    });

    it('normalizes expected-result (hyphen)', () => {
        expect(normalizeFieldName('expected-result')).toBe('Expected Result');
    });

    it('normalizes EXPECTED_RESULT (uppercase underscore)', () => {
        expect(normalizeFieldName('EXPECTED_RESULT')).toBe('Expected Result');
    });

    it('strips trailing \\r from Expected Result\\r', () => {
        expect(normalizeFieldName('Expected Result\r')).toBe('Expected Result');
    });

    it('strips trailing \\r from Action\\r', () => {
        expect(normalizeFieldName('Action\r')).toBe('Action');
    });

    it('strips leading/trailing whitespace', () => {
        expect(normalizeFieldName('  Expected Result  ')).toBe('Expected Result');
    });

    it('passes through unknown field name', () => {
        expect(normalizeFieldName('RandomField')).toBe('RandomField');
    });

    it('passes through unknown field name with \\r', () => {
        expect(normalizeFieldName('RandomField\r')).toBe('RandomField');
    });

    it('normalizes ACTION to Action', () => {
        expect(normalizeFieldName('ACTION')).toBe('Action');
    });

    it('normalizes action to Action', () => {
        expect(normalizeFieldName('action')).toBe('Action');
    });

    it('normalizes data to Data', () => {
        expect(normalizeFieldName('data')).toBe('Data');
    });
});

describe('SanitizeCellValue', () => {
    it('preserves normal value without \\r', () => {
        expect(sanitizeCellValue('hello world')).toBe('hello world');
    });

    it('strips trailing \\r', () => {
        expect(sanitizeCellValue('value\r')).toBe('value');
    });

    it('preserves intentional \\n (multi-line quoted)', () => {
        expect(sanitizeCellValue('line1\nline2')).toBe('line1\nline2');
    });

    it('handles null', () => {
        expect(sanitizeCellValue(null)).toBe('');
    });

    it('handles undefined', () => {
        expect(sanitizeCellValue(undefined)).toBe('');
    });

    it('handles empty string', () => {
        expect(sanitizeCellValue('')).toBe('');
    });

    it('strips \\r from middle of value', () => {
        expect(sanitizeCellValue('foo\rbar')).toBe('foobar');
    });
});
