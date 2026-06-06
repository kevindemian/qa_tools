import { normalizeFieldName, sanitizeCellValue } from './field-names.js';

describe('normalizeFieldName', () => {
    it('preserves canonical Action', async () => {
        expect(normalizeFieldName('Action')).toBe('Action');
    });

    it('preserves canonical Data', async () => {
        expect(normalizeFieldName('Data')).toBe('Data');
    });

    it('preserves canonical Expected Result', async () => {
        expect(normalizeFieldName('Expected Result')).toBe('Expected Result');
    });

    it('normalizes lowercase expected result', async () => {
        expect(normalizeFieldName('expected result')).toBe('Expected Result');
    });

    it('normalizes ExpectedResult (camelCase, no space)', async () => {
        expect(normalizeFieldName('ExpectedResult')).toBe('Expected Result');
    });

    it('normalizes expected_result (underscore)', async () => {
        expect(normalizeFieldName('expected_result')).toBe('Expected Result');
    });

    it('normalizes expected-result (hyphen)', async () => {
        expect(normalizeFieldName('expected-result')).toBe('Expected Result');
    });

    it('normalizes EXPECTED_RESULT (uppercase underscore)', async () => {
        expect(normalizeFieldName('EXPECTED_RESULT')).toBe('Expected Result');
    });

    it('strips trailing \\r from Expected Result\\r', async () => {
        expect(normalizeFieldName('Expected Result\r')).toBe('Expected Result');
    });

    it('strips trailing \\r from Action\\r', async () => {
        expect(normalizeFieldName('Action\r')).toBe('Action');
    });

    it('strips leading/trailing whitespace', async () => {
        expect(normalizeFieldName('  Expected Result  ')).toBe('Expected Result');
    });

    it('passes through unknown field name', async () => {
        expect(normalizeFieldName('RandomField')).toBe('RandomField');
    });

    it('passes through unknown field name with \\r', async () => {
        expect(normalizeFieldName('RandomField\r')).toBe('RandomField');
    });

    it('normalizes ACTION to Action', async () => {
        expect(normalizeFieldName('ACTION')).toBe('Action');
    });

    it('normalizes action to Action', async () => {
        expect(normalizeFieldName('action')).toBe('Action');
    });

    it('normalizes data to Data', async () => {
        expect(normalizeFieldName('data')).toBe('Data');
    });
});

describe('sanitizeCellValue', () => {
    it('preserves normal value without \\r', async () => {
        expect(sanitizeCellValue('hello world')).toBe('hello world');
    });

    it('strips trailing \\r', async () => {
        expect(sanitizeCellValue('value\r')).toBe('value');
    });

    it('preserves intentional \\n (multi-line quoted)', async () => {
        expect(sanitizeCellValue('line1\nline2')).toBe('line1\nline2');
    });

    it('handles null', async () => {
        expect(sanitizeCellValue(null)).toBe('');
    });

    it('handles undefined', async () => {
        expect(sanitizeCellValue(undefined)).toBe('');
    });

    it('handles empty string', async () => {
        expect(sanitizeCellValue('')).toBe('');
    });

    it('strips \\r from middle of value', async () => {
        expect(sanitizeCellValue('foo\rbar')).toBe('foobar');
    });
});
