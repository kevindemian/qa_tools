import { CsvRowSchema, TestCaseSchema, ImportJsonSchema, JiraPayloadSchema } from './csv-import-schema.js';

describe('CsvRowSchema', () => {
    it('accepts valid CSV row', async () => {
        const data = { fields: { Action: 'Click login', Data: 'user@test.com', 'Expected Result': 'Dashboard' } };
        const result = CsvRowSchema.parse(data);
        expect(result.fields.Action).toBe('Click login');
    });

    it('rejects row without Action', async () => {
        expect(() => CsvRowSchema.parse({ fields: { Action: '', Data: '', 'Expected Result': '' } })).toThrow();
    });

    it('defaults Data and Expected Result when missing', async () => {
        const result = CsvRowSchema.parse({ fields: { Action: 'Click' } });
        expect(result.fields.Data).toBe('');
        expect(result.fields['Expected Result']).toBe('');
    });
});

describe('TestCaseSchema', () => {
    it('accepts valid test case', async () => {
        const data = {
            title: 'Login test',
            steps: [{ fields: { Action: 'Enter user', Data: 'admin', 'Expected Result': 'Logged in' } }],
        };
        expect(TestCaseSchema.parse(data)).toEqual(data);
    });

    it('rejects empty title', async () => {
        expect(() => TestCaseSchema.parse({ title: '', steps: [{ fields: { Action: 'x' } }] })).toThrow();
    });

    it('rejects empty steps', async () => {
        expect(() => TestCaseSchema.parse({ title: 'Test', steps: [] })).toThrow();
    });

    it('rejects missing steps', async () => {
        expect(() => TestCaseSchema.parse({ title: 'Test' })).toThrow();
    });

    it('accepts full test case with all fields', async () => {
        const data = {
            title: 'Full test',
            description: 'Description text',
            steps: [{ fields: { Action: 'Click' } }],
            precondition: { type: 'inline' as const, value: 'User exists' },
            group: 'smoke',
            linkedIssues: [{ key: 'PROJ-1', linkType: 'Tests' }],
        };
        const result = TestCaseSchema.parse(data);
        expect(result.precondition?.type).toBe('inline');
        expect(result.linkedIssues).toHaveLength(1);
    });
});

describe('ImportJsonSchema', () => {
    it('accepts valid JSON array', async () => {
        const data = [
            {
                title: 'TC1',
                steps: [{ Action: 'Click', Data: '', 'Expected Result': 'Done' }],
            },
        ];
        const result = ImportJsonSchema.parse(data);
        expect(result).toHaveLength(1);
        expect(result[0]?.title).toBe('TC1');
        expect(result[0]?.steps).toHaveLength(1);
    });

    it('rejects empty array', async () => {
        expect(() => ImportJsonSchema.parse([])).toThrow();
    });

    it('rejects item without title', async () => {
        expect(() => ImportJsonSchema.parse([{ steps: [{ Action: 'Click' }] }])).toThrow();
    });

    it('accepts linkedIssues as strings or objects', async () => {
        const data = [
            {
                title: 'TC1',
                steps: [{ Action: 'Click' }],
                linkedIssues: ['PROJ-1', { key: 'PROJ-2', linkType: 'Tests' }],
            },
        ];
        const result = ImportJsonSchema.parse(data);
        expect(result[0]?.linkedIssues).toHaveLength(2);
    });
});

describe('JiraPayloadSchema', () => {
    it('accepts valid Jira payload', async () => {
        const data = {
            fields: {
                project: { key: 'PROJ' },
                summary: 'Test case title',
                description: 'Test description',
                issuetype: { name: 'Test' },
            },
        };
        expect(JiraPayloadSchema.parse(data)).toEqual(data);
    });

    it('accepts payload with labels', async () => {
        const data = {
            fields: {
                project: { key: 'PROJ' },
                summary: 'Test',
                description: '',
                issuetype: { name: 'Test' },
                labels: ['smoke', 'regression'],
            },
        };
        const result = JiraPayloadSchema.parse(data);
        expect(result.fields.labels).toHaveLength(2);
    });

    it('rejects wrong issuetype', async () => {
        expect(() =>
            JiraPayloadSchema.parse({
                fields: {
                    project: { key: 'PROJ' },
                    summary: 'Test',
                    description: '',
                    issuetype: { name: 'Bug' },
                },
            }),
        ).toThrow();
    });

    it('rejects empty summary', async () => {
        expect(() =>
            JiraPayloadSchema.parse({
                fields: {
                    project: { key: 'PROJ' },
                    summary: '',
                    description: '',
                    issuetype: { name: 'Test' },
                },
            }),
        ).toThrow();
    });
});
