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
                { fields: { Action: 'Navegar para /login', Data: '', ExpectedResult: 'Formulario exibido' } },
                { fields: { Action: 'Preencher email', Data: 'user@test.com', ExpectedResult: 'Campos preenchidos' } },
            ],
            precondition: { type: 'inline' as const, value: 'Usuario existe no banco' },
            group: 'Auth',
            linkedIssues: [{ key: 'US-123', linkType: 'Tests' }],
        },
        {
            title: 'Logout test',
            description: '',
            steps: [{ fields: { Action: 'Clicar em Sair', Data: '', ExpectedResult: 'Redirecionado para /login' } }],
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
                { fields: { Action: 'a', Data: '', ExpectedResult: 'b' } },
                { fields: { Action: 'c', Data: '', ExpectedResult: 'd' } },
            ],
            precondition: { type: 'inline' as const, value: 'Usuario existe' },
            group: 'Auth',
            linkedIssues: [{ key: 'US-123', linkType: 'Tests' }],
        },
        {
            title: 'Logout test',
            description: '',
            steps: [{ fields: { Action: 'x', Data: '', ExpectedResult: 'y' } }],
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

describe('showPreview', () => {
    const tests = [
        {
            title: 'Login test',
            description: 'desc',
            steps: [{ fields: { Action: 'Acao', Data: '', ExpectedResult: 'OK' } }],
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
