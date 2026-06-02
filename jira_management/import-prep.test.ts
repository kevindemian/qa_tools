// Mock factories
const mockConfig: Record<string, unknown> = {
    autoConfirm: false,
    dryRun: false,
    csvDefaultPath: '/default/path.csv',
    csvPath: '',
    jsonPath: '',
    csvLabels: '',
    jsonLabels: '',
    get: jest.fn((key: string) => {
        const val = mockConfig[key] as string | undefined;
        return val || undefined;
    }),
};

jest.mock('../shared/config', () => mockConfig);

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
    const actual = jest.requireActual<typeof import('fs')>('fs');
    return { ...actual, writeFileSync: jest.fn<() => void, [string, string]>() };
});

const mockMd = jest.fn<(s: string) => string, [string]>((s: string) => s);
const mockMdToHtml = jest.fn<(s: string) => string, [string]>((s: string) => '<html>' + s + '</html>');
jest.mock('../shared/markdown', () => ({ md: mockMd, mdToHtml: mockMdToHtml }));

import {
    _checkResumeCheckpoint,
    filterTests,
    validateImportBatch,
    generatePreviewMarkdown,
    showPreview,
    parseJsonTests,
} from './import-prep';
import * as PROMPT from '../shared/prompt';
import * as STATE from '../shared/state';
import * as FS from 'fs';
import { nonNull } from '../shared/test-utils';
import CsvResource from './csv_resource';
import { rootLogger } from '../shared/logger';

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
        expect(nonNull(nonNull(result)[0]).title).toBe('Test 1');
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
        expect(nonNull(result).resumeFrom).toBe(0);
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

describe('generatePreviewMarkdown', () => {
    const tests = [
        {
            title: 'Login test',
            description: 'Verifica login valido',
            steps: [
                { fields: { Action: 'a', Data: '', 'Expected Result': 'b' } },
                { fields: { Action: 'c', Data: 'd', 'Expected Result': 'e' } },
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

    it('renders steps in Gira-like format (bullet per field)', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('### Steps');
        expect(md).toContain('**Step 1**');
        expect(md).toContain('- **Action:** a');
        expect(md).toContain('- **Expected Result:** b');
        expect(md).toContain('**Step 2**');
        expect(md).toContain('- **Action:** c');
        expect(md).toContain('- **Data:** d');
        expect(md).toContain('- **Expected Result:** e');
        expect(md).toContain('- **Action:** x');
        expect(md).toContain('- **Expected Result:** y');
    });

    it('renders Data field only when present', () => {
        const md = generatePreviewMarkdown(tests);
        expect(md).not.toContain('- **Data:** \n');
    });

    it('shows fallback for empty descriptions', () => {
        const noDesc = [{ title: 'No desc', steps: [{ fields: { Action: 'a' } }] }];
        const md = generatePreviewMarkdown(noDesc);
        expect(md).toContain('**Description:** —');
    });

    it('shows "No steps defined" when steps array is empty', () => {
        const noSteps = [{ title: 'Empty', steps: [] }];
        const md = generatePreviewMarkdown(noSteps);
        expect(md).toContain('_No steps defined._');
    });

    describe('with options', () => {
        const single = [{ title: 'TC1', steps: [{ fields: { Action: 'a', Data: '', 'Expected Result': 'r' } }] }];

        it('includes document title when provided', () => {
            const md = generatePreviewMarkdown(single, { documentTitle: 'My Doc' });
            expect(md).toMatch(/^# My Doc/);
        });

        it('includes timestamp when showTimestamp is true', () => {
            const md = generatePreviewMarkdown(single, { showTimestamp: true });
            expect(md).toContain('*Generated on ');
        });

        it('includes summary with labels, totalSteps, groupsCount', () => {
            const md = generatePreviewMarkdown(single, {
                labels: ['smoke', 'regression'],
                totalSteps: 1,
                groupsCount: 0,
            });
            expect(md).toContain('1 teste(s), 1 step(s)');
            expect(md).toContain('**Labels:** smoke, regression');
        });

        it('includes keys in headings when provided', () => {
            const md = generatePreviewMarkdown(single, { keys: ['K-100'] });
            expect(md).toContain('## K-100 — TC1');
        });
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
        const actualFs = jest.requireActual<typeof import('fs')>('fs');
        const tmp = '/tmp/test-expected-result-alias.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(result).toHaveLength(2);
        expect(nonNull(nonNull(result[0]).steps[0]).fields['Expected Result']).toBe('Result1');
        expect(nonNull(nonNull(result[1]).steps[0]).fields['Expected Result']).toBe('Result2');

        expect(rootLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ExpectedResult'));

        actualFs.unlinkSync(tmp);
    });

    it('prefers canonical Expected Result over alias', () => {
        const jsonContent = JSON.stringify([
            {
                title: 'TC1',
                steps: [{ Action: 'Step1', 'Expected Result': 'Canonical', ExpectedResult: 'Alias' }],
            },
        ]);
        const actualFs = jest.requireActual<typeof import('fs')>('fs');
        const tmp = '/tmp/test-expected-result-canonical.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(nonNull(nonNull(result[0]).steps[0]).fields['Expected Result']).toBe('Canonical');

        actualFs.unlinkSync(tmp);
    });

    it('handles missing both Expected Result and ExpectedResult', () => {
        const jsonContent = JSON.stringify([
            {
                title: 'TC1',
                steps: [{ Action: 'Step1' }],
            },
        ]);
        const actualFs = jest.requireActual<typeof import('fs')>('fs');
        const tmp = '/tmp/test-expected-result-missing.json';
        actualFs.writeFileSync(tmp, jsonContent, 'utf-8');

        const result = parseJsonTests(tmp);
        expect(nonNull(nonNull(result[0]).steps[0]).fields['Expected Result']).toBe('');

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

    const mockOpen = jest.fn<Promise<boolean>, [string]>();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(PROMPT.isQuiet).mockReturnValue(true);
        mockOpen.mockResolvedValue(true);
    });

    it('prints title and generates MD files', async () => {
        await showPreview(tests, ['smoke'], 2, 1, mockOpen);
        expect(PROMPT.title).toHaveBeenCalledWith('Preview dos testes a serem criados');
        expect(mockMdToHtml).toHaveBeenCalledWith(expect.any(String), 'Preview — QA Tools');
        expect(FS.writeFileSync).toHaveBeenCalledTimes(2);
        const calls = jest.mocked(FS.writeFileSync).mock.calls;
        expect(nonNull(calls[0])[0]).toContain('qa-preview.md');
        expect(nonNull(calls[1])[0]).toContain('qa-preview.html');
    });

    it('opens browser when available', async () => {
        mockOpen.mockResolvedValue(true);
        await showPreview(tests, ['smoke'], 2, 1, mockOpen);
        expect(mockOpen).toHaveBeenCalledTimes(1);
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('aberto no navegador'));
        expect(PROMPT.print).not.toHaveBeenCalled();
    });

    it('falls back to terminal when browser unavailable', async () => {
        mockOpen.mockResolvedValue(false);
        await showPreview(tests, ['smoke'], 2, 1, mockOpen);
        expect(PROMPT.print).toHaveBeenCalled();
        expect(mockMd).toHaveBeenCalled();
        expect(PROMPT.divider).toHaveBeenCalled();
        expect(PROMPT.info).toHaveBeenCalledWith(expect.stringContaining('Nao foi possivel abrir'));
    });

    it('saves both .md and .html files', async () => {
        await showPreview(tests, ['smoke'], 2, 1, mockOpen);
        expect(FS.writeFileSync).toHaveBeenCalledTimes(2);
        const calls = jest.mocked(FS.writeFileSync).mock.calls.map((c) => c[0] as string);
        expect(calls.some((p) => p.endsWith('.md'))).toBe(true);
        expect(calls.some((p) => p.endsWith('.html'))).toBe(true);
    });
});

describe('csv -> preview pipeline (e2e)', () => {
    const fs = jest.requireActual<typeof import('fs')>('fs');
    // CsvResource is imported at top level — no requireActual needed

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
        loggerWarn = jest.spyOn(rootLogger, 'warn').mockImplementation(() => {});
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
        const md = generatePreviewMarkdown(tests, {
            labels: ['smoke', 'regression'],
            totalSteps,
            groupsCount,
        });

        expect(md).toContain('Login credenciais válidas');
        expect(md).toContain('Logout');
        expect(md).toContain('- **Action:** Navegar para /login');
        expect(md).toContain('- **Expected Result:** Formulário exibido');
        expect(md).toContain('- **Action:** Preencher email');
        expect(md).toContain('- **Action:** Clicar em Sair');
        expect(md).toContain('- **Expected Result:** Redirecionado para /login');
        expect(md).toContain('US-100');
        expect(md).toContain('EPIC-42');
        expect(md).toContain('Verifica o fluxo completo de login');
        expect(md).toContain('**Group:** Auth');
        expect(md).toContain('**Labels:** smoke, regression');
        expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('ExpectedResult'));

        fs.unlinkSync(tmp);
    });

    it('golden-path CSV (LF, comma, correct header) produces clean preview without normalization warning', async () => {
        loggerWarn.mockClear();
        const tmp = '/tmp/csv-e2e-golden.csv';
        fs.writeFileSync(tmp, buildGoldenCsv(), 'utf-8');

        const tests = await csvResource.readBulkCsv(tmp);
        expect(tests).toHaveLength(1);
        expect(nonNull(tests[0]).title).toBe('Golden test');

        const md = generatePreviewMarkdown(tests);
        expect(md).toContain('Golden test');
        expect(md).toContain('- **Expected Result:** result1');
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
