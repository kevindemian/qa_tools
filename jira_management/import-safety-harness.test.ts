/**
 * Import safety harness — one RED→GREEN regression test per discovered defect.
 *
 * Each test drives the REAL pipeline (createTestsFromCsv / MappingFileGenerator / case01)
 * and mocks ONLY external boundaries (Jira HTTP, filesystem writes). No function under test
 * is mocked. Every test must be RED before its root-cause fix and GREEN after.
 *
 * Run: npx vitest run jira_management/import-safety-harness.test.ts
 */
import os from 'os';
import path from 'path';
import fs from 'fs';

const mockPrompt = vi.hoisted(() => ({
    success: vi.fn<(...args: [string]) => void>(),
    error: vi.fn<(...args: [string]) => void>(),
    warn: vi.fn<(...args: [string]) => void>(),
    info: vi.fn<(...args: [string]) => void>(),
    title: vi.fn<(...args: [string]) => void>(),
    divider: vi.fn<(...args: []) => void>(),
    prompt: vi.fn<(...args: [string]) => string>().mockReturnValue(''),
    confirm: vi.fn<(...args: [string]) => boolean>().mockReturnValue(true),
    ask: vi.fn<(...args: [string]) => Promise<string>>().mockResolvedValue(''),
    askConfirm: vi.fn<(...args: [string]) => Promise<boolean>>().mockResolvedValue(true),
    smartPrompt: vi.fn<(...args: [string]) => Promise<string>>(),
    printError: vi.fn<(...args: [label: string, error: Error]) => void>(),
    printSummary: vi.fn<(...args: [results: object[], header?: string]) => void>(),
    onError: vi.fn<(...args: [context: string, error: Error]) => 'retry' | 'abort' | 'continue'>(),
    ProgressBar: vi.fn<(...args: [total: number]) => object>(),
    Spinner: vi.fn<(...args: [opts: object]) => object>(),
    isQuiet: vi.fn<(...args: []) => boolean>().mockReturnValue(true),
    withSpinner: vi
        .fn<(...args: [label: string, fn: () => Promise<void>]) => Promise<void>>()
        .mockImplementation(async (_label: string, fn: () => Promise<void>) => fn()),
    print: vi.fn<(...args: [string]) => void>(),
    askFilePath: vi.fn<(...args: [string]) => Promise<string>>().mockResolvedValue('/fake/path.csv'),
    extractErrorMessage: vi.fn<(...args: [unknown]) => string>((err: unknown) => String(err)),
}));

vi.mock('../shared/prompt', () => mockPrompt);

vi.mock('../shared/config', async (importOriginal) => {
    const mod = await importOriginal<typeof import('../shared/config.js')>();
    const inst = mod.default.getDefault();
    const realGet = inst.get.bind(inst);
    inst.get = ((key: string): string | undefined =>
        key === 'jiraMode' ? undefined : realGet(key)) as typeof inst.get;
    return mod;
});

vi.mock('../shared/state', () => ({
    load: vi.fn<(...args: []) => object>().mockReturnValue({}),
    update: vi.fn<(...args: [(state: object) => void]) => object>(),
}));

vi.mock('../shared/temp-dir', () => ({
    reportsDir: vi.fn<(...args: []) => string>().mockReturnValue(path.join(os.tmpdir(), 'qa-tools-reports-harness')),
    writeEphemeral: vi.fn<(...args: [string, string, string]) => string>(),
    tempDirPath: vi.fn<(...args: []) => string>().mockReturnValue(path.join(os.tmpdir(), 'qa-tools-temp')),
}));

import CsvResource from './csv_resource.js';
import JiraLinkManager from './jira_link_manager.js';
import createTestsModule from './create_tests.js';
import MappingFileGenerator from './mapping-file-generator.js';

const { createTestsFromCsv } = createTestsModule;
import { createMockLogger } from '../shared/test-utils.js';
import { createMockJiraResource } from '../shared/test-utils/factories/jira-resource-factory.js';

const PROJECT = 'TESTPROJ';
let _harnessSeq = 0;
function harnessTmp(suffix: string): string {
    _harnessSeq += 1;
    return path.join(os.tmpdir(), 'qa-harness-' + suffix + '-' + _harnessSeq + '.csv');
}

function makeJiraResource() {
    const r = createMockJiraResource();
    r.searchJiraIssues.mockResolvedValue({ issues: [], total: 0 });
    r.postJiraResource.mockResolvedValue({ key: 'TEST-1' });
    r.getJiraResource.mockResolvedValue([]);
    return r;
}

function makeArgs(overrides: Record<string, unknown> = {}) {
    return {
        jiraResource: makeJiraResource(),
        jiraResourceXray: makeJiraResource(),
        linkManager: new JiraLinkManager(createMockJiraResource()),
        linkManagerXray: new JiraLinkManager(createMockJiraResource()),
        csvResource: new CsvResource(),
        project_name: PROJECT,
        base_url: 'https://jira',
        sessionLog: createMockLogger(),
        onBusy: vi.fn<(...args: [boolean]) => void>(),
        ...overrides,
    } satisfies Parameters<typeof createTestsFromCsv>[0];
}

/** A minimal valid single-test CSV referencing one precondition and one linked issue. */
function writeValidCsv(refs: { precondition?: string; linked?: string }): string {
    const lines = [
        'Title: TC import safety',
        'Description: harness',
        refs.precondition ? 'Pre-condition: ' + refs.precondition : '',
        refs.linked ? 'Linked Issues: ' + refs.linked : '',
        'Action,Data,Expected Result',
        'Click,,ok',
        '',
    ].filter((l) => l !== '');
    const tmp = harnessTmp('valid');
    fs.writeFileSync(tmp, lines.join('\n'), 'utf-8');
    return tmp;
}

describe('Import safety harness lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env['AUTO_CONFIRM'] = 'true';
        delete process.env['DRY_RUN'];
    });

    afterEach(() => {
        delete process.env['AUTO_CONFIRM'];
        delete process.env['DRY_RUN'];
    });

    it('exposes createTestsFromCsv as the import entry point', () => {
        expect.hasAssertions();
        expect(typeof createTestsFromCsv).toBe('function');
    });
});

describe('D2/D3 — empty and missing CSV must surface explicit, distinguishable failure', () => {
    it('d2: empty CSV -> explicit failure (not undefined)', async () => {
        expect.hasAssertions();

        const empty = harnessTmp('empty');
        fs.writeFileSync(empty, 'Title: x\nAction,Data,Expected Result\n', 'utf-8');

        const result = (await createTestsFromCsv(makeArgs({ csvPath: empty }))) as unknown;

        // Before fix: returns `undefined` (silent). After fix: explicit error result.
        expect(result).toBeDefined();
        expect((result as { ok?: boolean }).ok).toBeFalsy();
    });

    it('d3: missing CSV file -> explicit failure, distinguishable from empty', async () => {
        expect.hasAssertions();

        const missing = harnessTmp('does-not-exist');

        const result = (await createTestsFromCsv(makeArgs({ csvPath: missing }))) as unknown;

        expect(result).toBeDefined();

        const r = result as { ok?: boolean; reason?: string };

        expect(r.ok).toBeFalsy();
        expect(r.reason).toBe('missing');
    });
});

describe('D5 — missing referenced Jira key must be reported explicitly (never silent skip)', () => {
    it('d5a: missing precondition key blocks import and names the key', async () => {
        expect.hasAssertions();

        const csv = writeValidCsv({ precondition: 'ECSPOL-0000' });
        const linkManager = new JiraLinkManager(createMockJiraResource());
        vi.spyOn(linkManager, 'associatePrecondition').mockImplementation(async (_k: string, key: string) => {
            if (key === 'ECSPOL-0000') throw new Error('Issue ECSPOL-0000 does not exist');
            return Promise.resolve(null);
        });

        const result = (await createTestsFromCsv(
            makeArgs({ csvPath: csv, linkManager, linkManagerXray: linkManager }),
        )) as unknown;

        const r = result as { ok?: boolean; result?: { status?: string; failedLinks?: string[] } };

        expect(r.ok).toBeTruthy();
        expect(r.result?.status).toBe('error');
        expect(Array.isArray(r.result?.failedLinks)).toBeTruthy();
        expect(r.result?.failedLinks).toContain('ECSPOL-0000');
    });

    it('d5b: missing linked-issue key blocks import and names the key', async () => {
        expect.hasAssertions();

        const csv = writeValidCsv({ linked: 'ECSPOL-0000 (is a test for)' });
        const linkManager = new JiraLinkManager(createMockJiraResource());
        vi.spyOn(linkManager, 'linkIssues').mockImplementation(
            (_k: string, issues: Array<{ key: string; linkType: string }>): Promise<void> => {
                if (issues.some((i) => i.key === 'ECSPOL-0000')) throw new Error('Issue ECSPOL-0000 does not exist');
                return Promise.resolve();
            },
        );

        const result = (await createTestsFromCsv(
            makeArgs({ csvPath: csv, linkManager, linkManagerXray: linkManager }),
        )) as unknown;

        const r = result as { ok?: boolean; result?: { status?: string; failedLinks?: string[] } };

        expect(r.ok).toBeTruthy();
        expect(r.result?.status).toBe('error');
        expect(Array.isArray(r.result?.failedLinks)).toBeTruthy();
        expect(r.result?.failedLinks).toContain('ECSPOL-0000');
    });
});

describe('D6 — mapping-file generation must surface write/dir failure', () => {
    it('d6: generate() throws when output directory cannot be created', () => {
        expect.hasAssertions();

        const gen = new MappingFileGenerator();
        const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
            throw new Error('EACCES permission denied');
        });

        expect(() =>
            gen.generate(
                '/some/source.csv',
                PROJECT,
                ['TEST-1'],
                [{ title: 'TC', steps: [{ fields: { Action: 'x' } }] }],
            ),
        ).toThrow(/permission denied/);

        existsSpy.mockRestore();
        spy.mockRestore();
    });
});
