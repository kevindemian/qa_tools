import { exportTestsCsv, exportTestsJson } from './report-export.js';
import type { FlatTest } from './result_parser.js';

describe('exportTestsCsv', () => {
    it('returns header row for empty test list', () => {
        const csv = exportTestsCsv([]);
        expect(csv).toContain('#,Test,Status,Duration,Suite,Error');
    });

    it('exports basic test data as CSV', () => {
        const tests: FlatTest[] = [
            { title: 'Login', state: 'passed', duration: 100 },
            { title: 'Logout', state: 'failed', duration: 200, error: 'Timeout' },
        ];
        const csv = exportTestsCsv(tests);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[0]).toBe('#,Test,Status,Duration,Suite,Error');
        expect(lines[1]).toContain('Login');
        expect(lines[1]).toContain('passed');
        expect(lines[1]).toContain('100');
        expect(lines[2]).toContain('Logout');
        expect(lines[2]).toContain('failed');
        expect(lines[2]).toContain('Timeout');
    });

    it('escapes fields containing commas with quotes', () => {
        const tests: FlatTest[] = [{ title: 'Test, with, commas', state: 'passed', duration: 100 }];
        const csv = exportTestsCsv(tests);
        expect(csv).toContain('"Test, with, commas"');
    });

    it('escapes fields containing double quotes', () => {
        const tests: FlatTest[] = [{ title: 'Test says "hello"', state: 'passed', duration: 100 }];
        const csv = exportTestsCsv(tests);
        expect(csv).toContain('"Test says ""hello"""');
    });

    it('includes suite from fullTitle', () => {
        const tests: FlatTest[] = [{ title: 'Test', state: 'passed', duration: 100, fullTitle: 'SuiteA > Test' }];
        const csv = exportTestsCsv(tests);
        expect(csv).toContain('SuiteA');
    });

    it('uses custom delimiter when provided', () => {
        const tests: FlatTest[] = [{ title: 'Test', state: 'passed', duration: 100 }];
        const csv = exportTestsCsv(tests, { delimiter: ';' });
        expect(csv).toContain('#;Test;Status;Duration;Suite;Error');
    });

    it('handles test with missing error field', () => {
        const tests: FlatTest[] = [{ title: 'Test', state: 'passed', duration: 100 }];
        const csv = exportTestsCsv(tests);
        expect(csv).toContain('Test,passed,100,,');
    });
});

describe('exportTestsJson', () => {
    it('returns valid JSON for test list', () => {
        const tests: FlatTest[] = [{ title: 'Test', state: 'passed', duration: 100 }];
        const json = exportTestsJson(tests);
        expect(JSON.parse(json)).toHaveLength(1);
        expect(JSON.parse(json)).toContainEqual(expect.objectContaining({ title: 'Test' }));
    });

    it('returns pretty-printed JSON with indentation', () => {
        const tests: FlatTest[] = [{ title: 'Test', state: 'passed', duration: 100 }];
        const json = exportTestsJson(tests);
        expect(json).toContain('\n  ');
    });

    it('wraps empty array as JSON array', () => {
        const json = exportTestsJson([]);
        expect(json).toBe('[]');
    });
});
