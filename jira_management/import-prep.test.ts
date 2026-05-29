// Mock factories
const mockConfig: Record<string, string | boolean> = {
    autoConfirm: false,
    dryRun: false,
    csvDefaultPath: '/default/path.csv',
    csvPath: '',
    jsonPath: '',
    csvLabels: '',
    jsonLabels: '',
};

jest.mock('../shared/prompt', () => ({
    confirm: jest.fn(),
    prompt: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    print: jest.fn(),
    title: jest.fn(),
    divider: jest.fn(),
    smartPrompt: jest.fn(),
    printSummary: jest.fn(),
    isQuiet: jest.fn().mockReturnValue(true),
    success: jest.fn(),
}));

jest.mock('../shared/config', () => mockConfig);

jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

jest.mock('../shared/logger', () => ({
    rootLogger: {
        child: jest.fn().mockReturnValue({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
    },
}));

jest.mock('fs', () => {
    const actual = jest.requireActual('fs');
    return { ...actual, writeFileSync: jest.fn() };
});

const mockMd = jest.fn((s: string) => s);
jest.mock('../shared/markdown', () => ({ md: mockMd }));

import {
    _checkResumeCheckpoint,
    filterTests,
    validateImportBatch,
    renderPreviewHtml,
    generatePreviewMarkdown,
    escapeHtml,
    showPreview,
    parseJsonTests,
} from './import-prep';
import * as PROMPT from '../shared/prompt';
import * as STATE from '../shared/state';
import * as FS from 'fs';

const makeTestCases = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
        title: `Test ${i + 1}`,
        steps: [{ fields: { Action: 'a' } }],
    }));

const makeCp = (overrides: Record<string, unknown> = {}) => ({
    csvPath: '/path/test.csv',
    project: 'TESTPROJ',
    testCount: 10,
    done: [
        { key: 'T-1', title: 'Test 1' },
        { key: 'T-2', title: 'Test 2' },
    ],
    ts: new Date().toISOString(),
    ...overrides,
});

describe('_checkResumeCheckpoint', () => {
    const tests = makeTestCases(10);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('happy resume: checkpoint exists, age < 24h, done < testCount, confirm true', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        jest.mocked(PROMPT.confirm).mockReturnValue(true);
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(2);
        expect(result.inMemoryTasksId).toEqual(['T-1', 'T-2']);
        expect(result.inMemoryTasksText).toEqual(['Test 1', 'Test 2']);
    });

    it('expired checkpoint: age > 24h -> skip', () => {
        const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp({ ts: oldTs }) });
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
        expect(result.inMemoryTasksId).toEqual([]);
    });

    it('user declines: confirm false -> skip', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        jest.mocked(PROMPT.confirm).mockReturnValue(false);
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
        expect(result.inMemoryTasksId).toEqual([]);
    });

    it('full checkpoint: done.length >= tests.length -> skip', () => {
        const fullDone = Array.from({ length: 10 }, (_, i) => ({ key: `T-${i + 1}`, title: `Test ${i + 1}` }));
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp({ done: fullDone }) });
        const result = _checkResumeCheckpoint(tests, '/path/test.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
    });

    it('no matching checkpoint: sourcePath differs -> skip', () => {
        jest.mocked(STATE.load).mockReturnValue({ _checkpoint: makeCp() });
        const result = _checkResumeCheckpoint(tests, '/different/path.csv', 'csv', 'TESTPROJ');
        expect(result.resumeFrom).toBe(0);
    });
});

describe('filterTests', () => {
    const tests = makeTestCases(5);

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('no matches -> warn + null', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('zzzzzz');
        const result = filterTests(tests);
        expect(result).toBeNull();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Nenhum teste'));
    });

    it('matches + user declines -> warn + null', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('Test');
        jest.mocked(PROMPT.confirm).mockReturnValue(false);
        const result = filterTests(tests);
        expect(result).toBeNull();
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Operação cancelada'));
    });

    it('matches + user accepts -> filtered list', () => {
        jest.mocked(PROMPT.prompt).mockReturnValue('Test 1');
        jest.mocked(PROMPT.confirm).mockReturnValue(true);
        const result = filterTests(tests);
        expect(result).toHaveLength(1);
        expect(result![0]!.title).toBe('Test 1');
    });
});

describe('validateImportBatch', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(STATE.load).mockReturnValue({});
    });

    it('warnings <= 5 displayed', () => {
        const testsWithWarnings = makeTestCases(3).map((t) => ({
            ...t,
            steps: [{ fields: { Action: '' } }],
        }));
        const result = validateImportBatch(testsWithWarnings, '/path.csv', 'csv', 'TESTPROJ');
        expect(result).toBeDefined();
        expect(result!.resumeFrom).toBe(0);
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('Avisos'));
    });

    it('warnings > 5 with truncated message', () => {
        const manyWarnings = Array.from({ length: 10 }, (_, i) => ({
            title: 'TC' + i,
            steps: [{ fields: { Action: '' } }],
        }));
        validateImportBatch(manyWarnings, '/path.csv', 'csv', 'TESTPROJ');
        expect(PROMPT.warn).toHaveBeenCalledWith(expect.stringContaining('e mais'));
    });

    it('errors displayed -> returns undefined', () => {
        const invalidTests = [{ title: '', steps: [{ fields: { Action: 'x' } }] }];
        const result = validateImportBatch(invalidTests, '/path.csv', 'csv', 'TESTPROJ');
        expect(result).toBeUndefined();
        expect(PROMPT.error).toHaveBeenCalledWith(expect.stringContaining('Erros'));
    });
});

describe('escapeHtml', () => {
    it('escapes & < > "', () => {
        expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
    });

    it('passes through safe strings', () => {
        expect(escapeHtml('hello world 123')).toBe('hello world 123');
    });

    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('renderPreviewHtml', () => {
    const tests = [
        {
            title: 'Login test',
            description: 'Verifica login com credenciais validas',
            steps: [
                { fields: { Action: 'Navegar para /login', Data: '', 'Expected Result': 'Formulario exibido' } },
                {
                    fields: {
                        Action: 'Preencher email',
                        Data: 'user@test.com',
                        'Expected Result': 'Campos preenchidos',
                    },
                },
            ],
            precondition: { type: 'inline' as const, value: 'Usuario existe no banco' },
            group: 'Auth',
            linkedIssues: [{ key: 'US-123', linkType: 'Tests' }],
        },
        {
            title: 'Logout test',
            description: '',
            steps: [{ fields: { Action: 'Clicar em Sair', Data: '', 'Expected Result': 'Redirecionado para /login' } }],
            group: '',
            linkedIssues: [],
        },
    ];

    it('contains title and summary cards', () => {
        const html = renderPreviewHtml(tests, ['smoke', 'regression'], 3, 1);
        expect(html).toContain('Preview of tests to be created');
        expect(html).toContain('<div class="summary">');
        expect(html).toContain('Tests</div><div class="val">2');
        expect(html).toContain('Steps</div><div class="val">3');
        expect(html).toContain('Groups</div><div class="val">1');
        expect(html).toContain('Labels</div><div class="val sub">');
    });

    it('renders empty labels gracefully', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).not.toContain('Labels');
        expect(html).not.toContain('Groups</div><div class="val">');
    });

    it('renders test cards with title and steps', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toContain('Login test');
        expect(html).toContain('Logout test');
        expect(html).toContain('Navegar para /login');
        expect(html).toContain('Formulario exibido');
        expect(html).toContain('user@test.com');
    });

    it('renders precondition and links in meta', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toContain('Usuario existe no banco');
        expect(html).toContain('US-123');
    });

    it('shows empty state for missing description', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toContain('<div class="desc empty">');
    });

    it('renders group badge', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toContain('<span class="badge group">Auth</span>');
    });

    it('contains footer', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toContain('Generated by QA Tools — import-prep');
    });

    it('html is valid full document', () => {
        const html = renderPreviewHtml(tests, [], 3, 0);
        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain('</html>');
    });
});

describe('generatePreviewMarkdown', () => {
    const tests = [
        {
            title: 'Login test',
            description: 'Verifica login valido',
            steps: [
                { fields: { Action: 'a', Data: '', 'Expected Result': 'b' } },
                { fields: { Action: 'c', Data: '', 'Expected Result': 'd' } },
            ],
            precondition: { type: 'inline' as const, value: 'Usuario existe' },
            group: 'Auth',
            linkedIssues: [{ key: 'US-123', linkType: 'Tests' }],
        },
        {
            title: 'Logout test',
            description: '',
            steps: [{ fields: { Action: 'x', Data: '', 'Expected Result': 'y' } }],
            group: '',
            linkedIssues: [],
        },
    ];

    it('renders test sections with headings', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('## Test 1 — Login test');
        expect(md).toContain('## Test 2 — Logout test');
        expect(md).toContain('---');
    });

    it('includes description', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('**Description:** Verifica login valido');
        expect(md).toContain('**Description:** —');
    });

    it('includes metadata (group, precondition, links)', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('**Group:** Auth');
        expect(md).toContain('**Pre-cond:** Usuario existe');
        expect(md).toContain('**Links:** US-123');
    });

    it('renders steps table with action/data/expected', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('| # | Action | Data | Expected |');
        expect(md).toContain('|---|--------|------|----------|');
        expect(md).toContain('| 1 | a |  | b |');
        expect(md).toContain('| 2 | c |  | d |');
        expect(md).toContain('| 1 | x |  | y |');
    });

    it('shows fallback for empty descriptions', () => {
        const noDesc = [{ title: 'No desc', steps: [{ fields: { Action: 'a' } }] }];
        const md = generatePreviewMarkdown(noDesc);
        expect(md).toContain('**Description:** —');
    });
});

describe('parseJsonTests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('accepts ExpectedResult alias and warns once', () => {
        const jsonContent = JSON.stringify([
            {
                title: 'TC1',
                steps: [{ Action: 'Step1', ExpectedResult: 'Result1' }],
            },
            {
                title: 'TC2',
                steps: [{ Action: 'Step2', ExpectedResult: 'Result2' }],
            },
        ]);
        // writeFileSync is mocked in this file — use actual fs for temp file
        const actualFs = jest.requireActual('fs');
        const tmp = '/tmp/test-expected-result-alias.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(result).toHaveLength(2);
        expect(result[0]!.steps[0]!.fields['Expected Result']).toBe('Result1');
        expect(result[1]!.steps[0]!.fields['Expected Result']).toBe('Result2');

        const loggerModule = require('../shared/logger');
        expect(loggerModule.rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ExpectedResult'));

        actualFs.unlinkSync(tmp);
    });

    it('prefers canonical Expected Result over alias', () => {
        const jsonContent = JSON.stringify([
            {
                title: 'TC1',
                steps: [{ Action: 'Step1', 'Expected Result': 'Canonical', ExpectedResult: 'Alias' }],
            },
        ]);
        const actualFs = jest.requireActual('fs');
        const tmp = '/tmp/test-expected-result-canonical.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(result[0]!.steps[0]!.fields['Expected Result']).toBe('Canonical');

        actualFs.unlinkSync(tmp);
    });

    it('handles missing both Expected Result and ExpectedResult', () => {
        const jsonContent = JSON.stringify([
            {
                title: 'TC1',
                steps: [{ Action: 'Step1' }],
            },
        ]);
        const actualFs = jest.requireActual('fs');
        const tmp = '/tmp/test-expected-result-missing.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(result[0]!.steps[0]!.fields['Expected Result']).toBe('');

        actualFs.unlinkSync(tmp);
    });
});

describe('showPreview', () => {
    const tests = [
        {
            title: 'Login test',
            description: 'desc',
            steps: [{ fields: { Action: 'Acao', Data: '', 'Expected Result': 'OK' } }],
            group: 'Auth',
        },
    ];

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(PROMPT.isQuiet).mockReturnValue(true);
    });

    it('prints title and markdown table', () => {
        showPreview(tests, ['smoke'], 2, 1);
        expect(PROMPT.title).toHaveBeenCalledWith('Preview dos testes a serem criados');
        expect(PROMPT.print).toHaveBeenCalled();
        expect(mockMd).toHaveBeenCalled();
        expect(PROMPT.divider).toHaveBeenCalled();
    });

    it('prints total info', () => {
        showPreview(tests, ['smoke'], 2, 1);
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Total:'));
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('2 step(s)'));
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('1 grupo(s)'));
    });

    it('prints labels when provided', () => {
        showPreview(tests, ['smoke', 'regression'], 2, 1);
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Labels'));
    });

    it('writes HTML sidecar to tmpdir', () => {
        showPreview(tests, ['smoke'], 2, 1);
        expect(FS.writeFileSync).toHaveBeenCalledTimes(1);
        const args = jest.mocked(FS.writeFileSync).mock.calls[0];
        expect(args![0]).toContain('qa-preview.html');
        expect(args![1]).toContain('Login test');
        expect(args![2]).toBe('utf8');
    });
});

describe('csv -> preview pipeline (e2e)', () => {
    const fs = jest.requireActual('fs');
    const CsvResource = jest.requireActual('../jira_management/csv_resource').default;

    const crlf = '\r\n';
    const bom = '\uFEFF';

    /** Build a realistic bulk CSV with all known quirks: BOM, CRLF, ; separator, ExpectedResult camelCase, multi-line Description. */
    function buildFixtureCsv(): string {
        return (
            bom +
            [
                'Title: Login credenciais válidas',
                'Description: "Verifica o fluxo completo de login',
                'incluindo validação de campos"',
                'Pre-condition: US-100 (Relates)',
                'Linked Issues: EPIC-42 (is epic of)',
                'Group: Auth',
                'Action;Data;ExpectedResult',
                'Navegar para /login;;Formulário exibido',
                'Preencher email;user@test.com;Campo preenchido',
                '',
                '---',
                '',
                'Title: Logout',
                'Action;Data;ExpectedResult',
                'Clicar em Sair;;Redirecionado para /login',
            ].join(crlf) +
            crlf
        );
    }

    /** Build a golden-path CSV (no quirks): LF, , separator, Expected Result (correct). */
    function buildGoldenCsv(): string {
        return ['Title: Golden test', 'Action,Data,Expected Result', 'step1,data1,result1'].join('\n') + '\n';
    }

    let csvResource: InstanceType<typeof CsvResource>;
    let loggerWarn: jest.SpyInstance;

    beforeAll(() => {
        csvResource = new CsvResource();
        loggerWarn = jest.spyOn(require('../shared/logger').rootLogger, 'warn').mockImplementation(() => {});
    });

    afterAll(() => {
        loggerWarn.mockRestore();
    });

    it('parses all-quirks CSV and renders preview with correct content', async () => {
        const tmp = '/tmp/csv-e2e-quirks.csv';
        fs.writeFileSync(tmp, buildFixtureCsv(), 'utf-8');

        const tests = await csvResource.readBulkCsv(tmp);
        expect(tests).toHaveLength(2);

        const totalSteps = tests.reduce((s: number, t: { steps: unknown[] }) => s + t.steps.length, 0);
        const groupsCount = new Set(tests.map((t: { group?: string }) => t.group).filter(Boolean)).size;
        const html = renderPreviewHtml(tests, ['smoke', 'regression'], totalSteps, groupsCount);

        expect(html).toContain('Login credenciais válidas');
        expect(html).toContain('Logout');
        expect(html).toContain('Navegar para /login');
        expect(html).toContain('Formulário exibido');
        expect(html).toContain('Preencher email');
        expect(html).toContain('Campo preenchido');
        expect(html).toContain('Redirecionado para /login');
        expect(html).toContain('Clicar em Sair');
        expect(html).toContain('US-100');
        expect(html).toContain('EPIC-42');
        expect(html).toContain('Verifica o fluxo completo de login');
        expect(html).toContain('<span class="badge group">Auth</span>');
        expect(html).toContain('Tests</div><div class="val">2');
        expect(html).toContain('Steps</div><div class="val">3');
        expect(html).toContain('Groups</div><div class="val">1');
        expect(html).toContain('Labels</div><div class="val sub">');
        expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('ExpectedResult'));

        fs.unlinkSync(tmp);
    });

    it('golden-path CSV (LF, comma, correct header) produces clean preview without normalization warning', async () => {
        loggerWarn.mockClear();
        const tmp = '/tmp/csv-e2e-golden.csv';
        fs.writeFileSync(tmp, buildGoldenCsv(), 'utf-8');

        const tests = await csvResource.readBulkCsv(tmp);
        expect(tests).toHaveLength(1);
        expect(tests[0]!.title).toBe('Golden test');

        const html = renderPreviewHtml(tests, [], 1, 0);
        expect(html).toContain('Golden test');
        expect(html).toContain('result1');
        expect(loggerWarn).not.toHaveBeenCalledWith(expect.stringContaining('normalizada'));

        fs.unlinkSync(tmp);
    });

    it('flat CSV (no Title:) yields 0 results with diagnostic warning', async () => {
        loggerWarn.mockClear();
        const tmp = '/tmp/csv-e2e-flat.csv';
        fs.writeFileSync(tmp, 'Title,Action,Data,Expected Result\nTC1,Step1,,Result1\n', 'utf-8');

        const tests = await csvResource.readBulkCsv(tmp);
        expect(tests).toHaveLength(0);
        expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('formato flat'));

        fs.unlinkSync(tmp);
    });
});
