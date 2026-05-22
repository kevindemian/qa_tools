// @ts-nocheck
const CsvResource = require('./csv_resource');

describe('CsvResource', () => {
    let csvResource;

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
            expect(results[0].precondition).toEqual({
                type: 'inline',
                value: 'User must be logged in\nwith admin privileges\nand valid SSL cert',
            });
            expect(results[0].steps.length).toBe(1);
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
            expect(results[0].precondition).toEqual({
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
            expect(results[0].precondition).toEqual({
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
});
