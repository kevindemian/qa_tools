import CsvResource from './csv_resource';

describe('CsvResource', () => {
    let csvResource: InstanceType<typeof CsvResource>;

    beforeEach(() => {
        csvResource = new CsvResource();
    });

    describe('parseDescription', () => {
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

    describe('parsePrecondition', () => {
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

    describe('readBulkCsv with quoted Pre-condition', () => {
        it('parses multi-line quoted Pre-condition', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-pre-quoted.csv';
            fs.writeFileSync(
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
            expect(results[0]!.precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in\nwith admin privileges\nand valid SSL cert',
            });
            expect(results[0]!.steps.length).toBe(1);
            fs.unlinkSync(tmp);
        });

        it('parses single-line quoted Pre-condition', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-pre-quoted-single.csv';
            fs.writeFileSync(
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
            expect(results[0]!.precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in',
            });
            fs.unlinkSync(tmp);
        });

        it('parses unquoted Pre-condition (range mode fallback)', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-pre-range.csv';
            fs.writeFileSync(
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
            expect(results[0]!.precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in',
            });
            fs.unlinkSync(tmp);
        });
    });

    describe('parseGroup', () => {
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

    describe('parseLinkedIssues', () => {
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

    describe('readBulkCsv edge cases', () => {
        it('skips block without Title and warns', async () => {
            const fs = require('fs');
            const loggerModule = require('../shared/logger');
            const warnSpy = jest.spyOn(loggerModule.rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-no-title.csv';
            fs.writeFileSync(
                tmp,
                'Action,Data,Expected\nx,y,z\n---\nTitle: Real\nAction,Data,Expected\na,b,c\n',
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);
            expect(results).toHaveLength(1);
            expect(results[0]!.title).toBe('Real');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Pulando bloco sem Title'));
            warnSpy.mockRestore();
            fs.unlinkSync(tmp);
        });

        it('parses single-line quoted description', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-desc-quoted.csv';
            fs.writeFileSync(tmp, 'Title: TC\nDescription:"Quoted desc"\nAction,Data,Expected\nx,y,z\n', 'utf-8');
            const results = await csvResource.readBulkCsv(tmp);
            expect(results[0]!.description).toBe('Quoted desc');
            fs.unlinkSync(tmp);
        });

        it('parses multi-line quoted description without closing quote', async () => {
            const fs = require('fs');
            const loggerModule = require('../shared/logger');
            const warnSpy = jest.spyOn(loggerModule.rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-desc-unclosed.csv';
            fs.writeFileSync(
                tmp,
                ['Title: TC', 'Description:"Line 1', 'Line 2', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);
            expect(results[0]!.description).toContain('Line 1');
            expect(results[0]!.description).toContain('Line 2');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Description sem aspas de fechamento'));
            warnSpy.mockRestore();
            fs.unlinkSync(tmp);
        });

        it('parses multi-line quoted description with proper closing', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-desc-closed.csv';
            fs.writeFileSync(
                tmp,
                ['Title: TC', 'Description:"Line 1', 'Line 2"', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);
            expect(results[0]!.description).toBe('Line 1\nLine 2');
            fs.unlinkSync(tmp);
        });

        it('parses multi-line description in range mode (no quotes)', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-desc-range-multi.csv';
            fs.writeFileSync(
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
            expect(results[0]!.description).toBe('First line\nSecond line\nThird line');
            fs.unlinkSync(tmp);
        });

        it('parses description in range mode with stop prefix adjacent', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-desc-range.csv';
            fs.writeFileSync(
                tmp,
                ['Title: TC', 'Description:Some desc', 'Group: G1', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);
            expect(results[0]!.description).toBe('Some desc');
            expect(results[0]!.group).toBe('G1');
            fs.unlinkSync(tmp);
        });

        it('parses empty description after Description: with metadata on next line', async () => {
            const fs = require('fs');
            const tmp = '/tmp/test-desc-empty.csv';
            fs.writeFileSync(
                tmp,
                ['Title: TC', 'Description:', 'Pre-condition: LOGIN', 'Action,Data,Expected', 'x,y,z'].join('\n'),
                'utf-8',
            );
            const results = await csvResource.readBulkCsv(tmp);
            expect(results[0]!.description).toBe('');
            expect(results[0]!.precondition).toBeDefined();
            fs.unlinkSync(tmp);
        });

        it('warns on multi-line quoted pre-condition without closing quote', async () => {
            const fs = require('fs');
            const loggerModule = require('../shared/logger');
            const warnSpy = jest.spyOn(loggerModule.rootLogger, 'warn').mockImplementation(() => {});
            const tmp = '/tmp/test-pre-unclosed.csv';
            fs.writeFileSync(
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
            expect(results[0]!.precondition).toBeDefined();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Pre-condition sem aspas de fechamento'));
            warnSpy.mockRestore();
            fs.unlinkSync(tmp);
        });

        it('throws on CSV parse error', async () => {
            const loggerModule = require('../shared/logger');
            const errorSpy = jest.spyOn(loggerModule.rootLogger, 'error').mockImplementation(() => {});
            const orig = csvResource.readCsvFromString;
            csvResource.readCsvFromString = jest.fn().mockRejectedValue(new Error('CSV parse error')) as never;
            const fs = require('fs');
            const tmp = '/tmp/test-csv-error.csv';
            fs.writeFileSync(tmp, 'Title: TC\nDescription: Test\nAction,Data,Expected\nx,y,z\n', 'utf-8');
            await expect(csvResource.readBulkCsv(tmp)).rejects.toThrow('CSV parse error');
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Erro ao analisar bloco CSV'));
            csvResource.readCsvFromString = orig;
            errorSpy.mockRestore();
            fs.unlinkSync(tmp);
        });
    });

    describe('parseLinkedIssues edge cases', () => {
        it('returns empty array when Linked Issues value is empty', () => {
            const lines = ['Title: Test', 'Linked Issues:   ', 'Action,Data,Expected'];
            expect(csvResource.parseLinkedIssues(lines)).toEqual([]);
        });
    });

    describe('readCsvFromString', () => {
        it('parses CSV with empty Action field', async () => {
            const csvString = 'Action,Data,Expected Result\n,y,z';
            const result = await csvResource.readCsvFromString(csvString);
            expect(result).toHaveLength(1);
            expect(result[0]!.fields.Action).toBe('');
            expect(result[0]!.fields.Data).toBe('y');
            expect(result[0]!.fields['Expected Result']).toBe('z');
        });

        it('parses CSV with empty Data field', async () => {
            const csvString = 'Action,Data,Expected Result\nx,,z';
            const result = await csvResource.readCsvFromString(csvString);
            expect(result).toHaveLength(1);
            expect(result[0]!.fields.Data).toBe('');
            expect(result[0]!.fields['Expected Result']).toBe('z');
        });
    });
});
