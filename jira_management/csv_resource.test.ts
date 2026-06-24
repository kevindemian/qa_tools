import { writeFileSync, unlinkSync } from 'fs';
import { nonNull } from '../shared/test-utils.js';
import { rootLogger } from '../shared/logger.js';
import CsvResource from './csv_resource.js';

describe('CsvResource', () => {
    let csvResource: InstanceType<typeof CsvResource>;

    beforeEach(() => {
        csvResource = new CsvResource();
    });

    describe('ParseDescription', () => {
        it('extracts description from Description: header', () => {
            const lines = ['Title: Test', 'Description: Verifica feature Y', 'Action,Data,Expected'];

            expect(csvResource.parseDescription(lines)).toBe('Verifica feature Y');
        });

        it('returns empty string when no Description header', () => {
            const lines = ['Title: Test', 'Action,Data,Expected'];

            expect(csvResource.parseDescription(lines)).toBe('');
        });

        it('handles multiline descriptions', () => {
            const lines = ['Title: Test', 'Description: Line 1\\nLine 2', 'Action,Data,Expected'];

            expect(csvResource.parseDescription(lines)).toBe('Line 1\\nLine 2');
        });
    });

    describe('ParsePrecondition', () => {
        it('detects reference type for Jira keys', () => {
            expect(csvResource.parsePrecondition('ECSPOL-PRE-42')).toEqual({
                type: 'reference',
                value: 'ECSPOL-PRE-42',
            });
        });

        it('detects inline type for plain text', () => {
            expect(csvResource.parsePrecondition('User must be logged in')).toEqual({
                type: 'inline',
                value: 'User must be logged in',
            });
        });

        it('returns null for null/undefined/empty', () => {
            expect(csvResource.parsePrecondition(null)).toBeNull();
            expect(csvResource.parsePrecondition(undefined)).toBeNull();
            expect(csvResource.parsePrecondition('')).toBeNull();
            expect(csvResource.parsePrecondition('   ')).toBeNull();
        });

        it('extracts key from KEY-100 (descricao)', () => {
            expect(csvResource.parsePrecondition('ECSPOL-PRE-42 (descricao do pre-cond)')).toEqual({
                type: 'reference',
                value: 'ECSPOL-PRE-42',
            });
        });

        it('extracts key from KEY-100 (with extra parenthetical info)', () => {
            expect(csvResource.parsePrecondition('ABC-123 (some context here)')).toEqual({
                type: 'reference',
                value: 'ABC-123',
            });
        });

        it('returns inline for multi-line text (already extracted)', () => {
            expect(csvResource.parsePrecondition('User must be logged in\nwith admin privileges')).toEqual({
                type: 'inline',
                value: 'User must be logged in\nwith admin privileges',
            });
        });
    });

    describe('ReadBulkCsv with quoted Pre-condition', () => {
        it('parses multi-line quoted Pre-condition', async () => {
            const tmp = '/tmp/test-pre-quoted.csv';
            writeFileSync(
                tmp,
                [
                    'Title: TC - Pre quoted',
                    'Description: Test',
                    'Pre-condition: "User must be logged in',
                    'with admin privileges',
                    'and valid SSL cert"',
                    'Action,Data,Expected',
                    'x,y,z',
                ].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in\nwith admin privileges\nand valid SSL cert',
            });
            expect(nonNull(results[0]).steps).toHaveLength(1);

            unlinkSync(tmp);
        });

        it('parses single-line quoted Pre-condition', async () => {
            const tmp = '/tmp/test-pre-quoted-single.csv';
            writeFileSync(
                tmp,
                [
                    'Title: TC - Pre quoted single',
                    'Description: Test',
                    'Pre-condition: "User must be logged in"',
                    'Action,Data,Expected',
                    'x,y,z',
                ].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in',
            });

            unlinkSync(tmp);
        });

        it('parses unquoted Pre-condition (range mode fallback)', async () => {
            const tmp = '/tmp/test-pre-range.csv';
            writeFileSync(
                tmp,
                [
                    'Title: TC - Pre range',
                    'Description: Test',
                    'Pre-condition: User must be logged in',
                    'Action,Data,Expected',
                    'x,y,z',
                ].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in',
            });

            unlinkSync(tmp);
        });
    });

    describe('ParseGroup', () => {
        it('extracts group from Group: header', () => {
            const lines = ['Title: Test', 'Group: LOGIN-FLOW', 'Action,Data,Expected'];

            expect(csvResource.parseGroup(lines)).toBe('LOGIN-FLOW');
        });

        it('returns null when no Group: header', () => {
            const lines = ['Title: Test', 'Action,Data,Expected'];

            expect(csvResource.parseGroup(lines)).toBeNull();
        });

        it('returns null for whitespace-only Group:', () => {
            const lines = ['Title: Test', 'Group:   ', 'Action,Data,Expected'];

            expect(csvResource.parseGroup(lines)).toBeNull();
        });
    });

    describe('ParseLinkedIssues', () => {
        it('parses single linked issue', () => {
            const lines = ['Title: Test', 'Linked Issues: ECSPOL-100 (is tested by)', 'Action,Data,Expected'];

            expect(csvResource.parseLinkedIssues(lines)).toEqual([{ key: 'ECSPOL-100', linkType: 'is tested by' }]);
        });

        it('parses multiple linked issues', () => {
            const lines = ['Title: Test', 'Linked Issues: ECSPOL-100 (is tested by), ECSPOL-200 (relates to)'];

            expect(csvResource.parseLinkedIssues(lines)).toEqual([
                { key: 'ECSPOL-100', linkType: 'is tested by' },
                { key: 'ECSPOL-200', linkType: 'relates to' },
            ]);
        });

        it('returns empty array when no Linked Issues header', () => {
            const lines = ['Title: Test', 'Action,Data,Expected'];

            expect(csvResource.parseLinkedIssues(lines)).toEqual([]);
        });
    });

    describe('ReadBulkCsv edge cases', () => {
        it('skips block without Title and warns', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-no-title.csv';
            writeFileSync(tmp, 'Action,Data,Expected\nx,y,z\n---\nTitle: Real\nAction,Data,Expected\na,b,c\n', 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(results).toHaveLength(1);
            expect(nonNull(results[0]).title).toBe('Real');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('formato flat'));

            warnSpy.mockRestore();
            unlinkSync(tmp);
        });

        it('parses single-line quoted description', async () => {
            const tmp = '/tmp/test-desc-quoted.csv';
            writeFileSync(tmp, 'Title: TC\nDescription:"Quoted desc"\nAction,Data,Expected\nx,y,z\n', 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toBe('Quoted desc');

            unlinkSync(tmp);
        });

        it('parses multi-line quoted description without closing quote', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-desc-unclosed.csv';
            writeFileSync(
                tmp,
                ['Title: TC', 'Description:"Line 1', 'Line 2', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toContain('Line 1');
            expect(nonNull(results[0]).description).toContain('Line 2');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Description sem aspas de fechamento'));

            warnSpy.mockRestore();
            unlinkSync(tmp);
        });

        it('parses multi-line quoted description with proper closing', async () => {
            const tmp = '/tmp/test-desc-closed.csv';
            writeFileSync(
                tmp,
                ['Title: TC', 'Description:"Line 1', 'Line 2"', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toBe('Line 1\nLine 2');

            unlinkSync(tmp);
        });

        it('parses multi-line description in range mode (no quotes)', async () => {
            const tmp = '/tmp/test-desc-range-multi.csv';
            writeFileSync(
                tmp,
                [
                    'Title: TC',
                    'Description: First line',
                    'Second line',
                    'Third line',
                    'Action,Data,Expected',
                    'x,y,z',
                ].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toBe('First line\nSecond line\nThird line');

            unlinkSync(tmp);
        });

        it('parses description in range mode with stop prefix adjacent', async () => {
            const tmp = '/tmp/test-desc-range.csv';
            writeFileSync(
                tmp,
                ['Title: TC', 'Description:Some desc', 'Group: G1', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toBe('Some desc');
            expect(nonNull(results[0]).group).toBe('G1');

            unlinkSync(tmp);
        });

        it('parses empty description after Description: with metadata on next line', async () => {
            const tmp = '/tmp/test-desc-empty.csv';
            writeFileSync(
                tmp,
                ['Title: TC', 'Description:', 'Pre-condition: LOGIN', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).description).toBe('');
            expect(nonNull(results[0]).precondition).toBeDefined();

            unlinkSync(tmp);
        });

        it('warns on multi-line quoted pre-condition without closing quote', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-pre-unclosed.csv';
            writeFileSync(
                tmp,
                [
                    'Title: TC',
                    'Description: Test',
                    'Pre-condition: "Unclosed',
                    'multiline',
                    'Action,Data,Expected',
                    'x,y,z',
                ].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);

            expect(nonNull(results[0]).precondition).toBeDefined();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Pre-condition sem aspas de fechamento'));

            warnSpy.mockRestore();
            unlinkSync(tmp);
        });

        it('throws on CSV parse error', async () => {
            const errorSpy = vi.spyOn(rootLogger, 'error').mockImplementation(() => {});
            const orig = csvResource['readCsvFromString'];
            csvResource.readCsvFromString = vi
                .fn<(...args: [string]) => Promise<never>>()
                .mockRejectedValue(new Error('CSV parse error'));
            const tmp = '/tmp/test-csv-error.csv';
            writeFileSync(tmp, 'Title: TC\nDescription: Test\nAction,Data,Expected\nx,y,z\n', 'utf-8');

            await expect(csvResource.readBulkCsv(tmp)).rejects.toThrow('CSV parse error');
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Erro ao analisar bloco CSV'));

            csvResource.readCsvFromString = orig;
            errorSpy.mockRestore();
            unlinkSync(tmp);
        });
    });

    describe('ParseLinkedIssues edge cases', () => {
        it('returns empty array when Linked Issues value is empty', () => {
            const lines = ['Title: Test', 'Linked Issues:   ', 'Action,Data,Expected'];

            expect(csvResource.parseLinkedIssues(lines)).toEqual([]);
        });
    });

    describe('DetectSeparator', () => {
        it('returns comma for normal CSV', () => {
            expect(CsvResource.detectSeparator('Action,Data,Expected Result')).toBe(',');
        });

        it('returns semicolon when first line has ; and no comma', () => {
            expect(CsvResource.detectSeparator('Action;Data;Expected Result')).toBe(';');
        });

        it('returns comma when first line has both ; and ,', () => {
            expect(CsvResource.detectSeparator('"Action;Extra",Data,Expected Result')).toBe(',');
        });

        it('returns comma for empty first line', () => {
            expect(CsvResource.detectSeparator('')).toBe(',');
        });
    });

    describe('ReadCsvFromString', () => {
        it('skips CSV row with empty Action field', async () => {
            const csvString = 'Action,Data,Expected Result\n,y,z';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(0);
        });

        it('parses CSV with empty Data field', async () => {
            const csvString = 'Action,Data,Expected Result\nx,,z';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields.Data).toBe('');
            expect(nonNull(result[0]).fields['Expected Result']).toBe('z');
        });

        it('parses CSV with semicolon separator', async () => {
            const csvString = 'Action;Data;Expected Result\nstep1;data1;result1';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields.Action).toBe('step1');
            expect(nonNull(result[0]).fields.Data).toBe('data1');
            expect(nonNull(result[0]).fields['Expected Result']).toBe('result1');
        });

        it('normalizes ExpectedResult (camelCase) header', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const csvString = 'Action,Data,ExpectedResult\nx,y,z';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields['Expected Result']).toBe('z');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('normalizada'));

            warnSpy.mockRestore();
        });

        it('normalizes lowercase expected result header', async () => {
            const csvString = 'action,data,expected result\nx,y,z';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields.Action).toBe('x');
            expect(nonNull(result[0]).fields['Expected Result']).toBe('z');
        });

        it('normalizes header with trailing \\r', async () => {
            const csvString = 'Action,Data,Expected Result\r\nstep1,data1,result1';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields['Expected Result']).toBe('result1');
        });

        it('deduplicates normalization warnings per column', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const csvString = 'Action,ExpectedResult,ExpectedResult\nx,y,z\nw,v,u';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(2);

            // Only 1 warn for normalization (deduped), not 2
            const normalizeWarns = warnSpy.mock.calls.filter((c) => String(c[0]).includes('normalizada')).length;

            expect(normalizeWarns).toBe(1);

            warnSpy.mockRestore();
        });

        it('strips \\r from cell values', async () => {
            const csvString = 'Action,Data,Expected Result\nstep1\r,data1\r,result1\r';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(1);
            expect(nonNull(result[0]).fields.Action).toBe('step1');
            expect(nonNull(result[0]).fields.Data).toBe('data1');
            expect(nonNull(result[0]).fields['Expected Result']).toBe('result1');
        });

        it('preserves \\n inside quoted cell values', async () => {
            const csvString = 'Action,Data,Expected Result\n"line1\nline2",data,result\nstep3,data3,result3';
            const result = await csvResource.readCsvFromString(csvString);

            expect(result).toHaveLength(2);
            expect(nonNull(result[0]).fields.Action).toBe('line1\nline2');
            expect(nonNull(result[1]).fields.Action).toBe('step3');
        });
    });

    describe('_processBulkCsvBlock flat CSV warning', () => {
        it('warns with diagnostic for flat CSV (Title,Action,... header)', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            // Flat CSV format: header row with Title,Action,Data,Expected Result (no ---, no Title:)
            const tmp = '/tmp/test-flat.csv';
            writeFileSync(tmp, 'Title,Action,Data,Expected Result\nTC1,Step1,,Result1\nTC2,Step2,,Result2\n', 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            // No bulk-format blocks found, so 0 results
            expect(results).toHaveLength(0);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('formato flat'));

            warnSpy.mockRestore();
            unlinkSync(tmp);
        });

        it('warns with diagnostic for flat CSV (just Action,Data,...)', async () => {
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-flat-action.csv';
            writeFileSync(tmp, 'Action,Data,Expected Result\nStep1,Data1,Result1\n', 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(results).toHaveLength(0);
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('formato flat'));

            warnSpy.mockRestore();
            unlinkSync(tmp);
        });
    });

    describe('ReadBulkCsv — CRLF normalization', () => {
        it('splits blocks correctly with CRLF line endings', async () => {
            const tmp = '/tmp/test-crlf-bulk.csv';
            const crlf = '\r\n';
            const csvContent =
                [
                    'Title: Test A',
                    'Action,Data,Expected Result',
                    'a1,d1,r1',
                    '---',
                    'Title: Test B',
                    'Action,Data,Expected Result',
                    'a2,d2,r2',
                ].join(crlf) + crlf;
            writeFileSync(tmp, csvContent, 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(results).toHaveLength(2);
            expect(nonNull(results[0]).title).toBe('Test A');
            expect(nonNull(results[1]).title).toBe('Test B');
            expect(nonNull(results[0]).steps).toHaveLength(1);
            expect(nonNull(nonNull(results[0]).steps[0]).fields['Expected Result']).toBe('r1');

            unlinkSync(tmp);
        });

        it('strips BOM character at start of file', async () => {
            const tmp = '/tmp/test-bom-bulk.csv';
            const bom = '\uFEFF';
            const csvContent = bom + 'Title: Com BOM\nAction,Data,Expected Result\na,d,r\n';
            writeFileSync(tmp, csvContent, 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(results).toHaveLength(1);
            expect(nonNull(results[0]).title).toBe('Com BOM');
            expect(nonNull(nonNull(results[0]).steps[0]).fields['Expected Result']).toBe('r');

            unlinkSync(tmp);
        });

        it('handles BOM + CRLF + semicolons combined', async () => {
            const tmp = '/tmp/test-bom-crlf-semi.csv';
            const bom = '\uFEFF';
            const crlf = '\r\n';
            const csvContent =
                bom + ['Title: Combined quirks', 'Action;Data;ExpectedResult', 'step1;d1;r1'].join(crlf) + crlf;
            writeFileSync(tmp, csvContent, 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);

            expect(results).toHaveLength(1);
            expect(nonNull(results[0]).title).toBe('Combined quirks');
            expect(nonNull(nonNull(results[0]).steps[0]).fields['Expected Result']).toBe('r1');
            expect(nonNull(nonNull(results[0]).steps[0]).fields.Action).toBe('step1');

            unlinkSync(tmp);
        });
    });
});
