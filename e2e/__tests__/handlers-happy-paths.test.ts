vi.mock('../../shared/ui/prompt.js', () => ({
    __setConfig: vi.fn(),
    __setOraDep: vi.fn(),
    isQuiet: vi.fn<() => boolean>().mockReturnValue(true),
    __setSelectMod: vi.fn(),
    __setInputMod: vi.fn(),
    __setConfirmMod: vi.fn(),
    __setEditorMod: vi.fn(),
    badge: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    helpLine: vi.fn(),
    print: vi.fn(),
    title: vi.fn(),
    divider: vi.fn(),
    humanizeError: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
    extractErrorMessage: vi.fn((e: unknown) => (e instanceof Error ? e.message : String(e))),
    printError: vi.fn(),
    printSummary: vi.fn(),
    onError: vi.fn(),
    tableView: vi.fn(),
    CancelError: class extends Error {},
    ProgressBar: class {
        update(): void {}
        stop(): void {}
    },
    withSpinner: vi.fn(async (_label: string, fn: () => Promise<unknown>) => fn()),
    prompt: vi.fn<(...args: []) => string>().mockReturnValue(''),
    confirm: vi.fn<(...args: []) => boolean>().mockReturnValue(true),
    smartPrompt: vi.fn<(...args: []) => Promise<string>>().mockResolvedValue('v2.0.0'),
    showSelect: vi.fn<(...args: []) => Promise<string>>().mockResolvedValue(''),
    askFilePath: vi.fn<(...args: []) => Promise<string>>().mockResolvedValue(''),
    ask: vi.fn<(...args: []) => Promise<string>>().mockResolvedValue(''),
    askMultiline: vi.fn<(...args: []) => Promise<string>>().mockResolvedValue(''),
    askConfirm: vi.fn<(...args: []) => Promise<boolean>>().mockResolvedValue(true),
}));
vi.mock('../../shared/state', () => ({
    load: vi.fn<(...args: []) => { [key: string]: unknown }>().mockReturnValue({}),
    update: vi.fn<(...args: [{ [key: string]: unknown }]) => void>(),
}));
vi.mock('../../shared/open', () => ({ openWithOsOrFallback: vi.fn<(...args: [string]) => void>() }));
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as promptModule from '../../shared/ui/prompt.js';
import * as stateModule from '../../shared/state.js';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-hp-'));
const tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-git-'));

fs.writeFileSync(
    path.resolve(path.join(tmpGitDir, 'package.json')),
    JSON.stringify({ name: 'test', version: '1.0.0', scripts: {} }),
);
const rnDir = path.join(tmpGitDir, 'release_notes');
fs.mkdirSync(path.resolve(rnDir), { recursive: true });
fs.writeFileSync(path.resolve(path.join(rnDir, 'ReleaseNotes.txt')), '');

const jsonFixture = path.join(tmpHome, 'cases.json');
fs.writeFileSync(
    path.resolve(jsonFixture),
    JSON.stringify([{ title: 'TC E2E', description: 'e2e', steps: [{ Action: 'Step1', 'Expected Result': 'R1' }] }]),
);

import nock from 'nock';
import JiraResource from '../../jira_management/jira_resource.js';
import JiraLinkManager from '../../jira_management/jira_link_manager.js';
import CsvResource from '../../jira_management/csv_resource.js';
import { rootLogger } from '../../shared/logger.js';
import { SessionContext } from '../../shared/session-context.js';
import { setDataHub } from '../../shared/data-hub/global-hub.js';
import { makeDataHubMock } from '../../shared/test-utils/factories/data-hub-mock.js';
import case02 from '../../jira_management/commands/case02.js';
import case03 from '../../jira_management/commands/case03.js';
import case04 from '../../jira_management/commands/case04.js';
import case05 from '../../jira_management/commands/case05.js';
import case06 from '../../jira_management/commands/case06.js';
import case07 from '../../jira_management/commands/case07.js';
import case08 from '../../jira_management/commands/case08.js';
import case09 from '../../jira_management/commands/case09.js';
import case10 from '../../jira_management/commands/case10.js';
import case11 from '../../jira_management/commands/case11.js';
import case12 from '../../jira_management/commands/case12.js';
import case13 from '../../jira_management/commands/case13.js';
import case14 from '../../jira_management/commands/case14.js';
import case15 from '../../jira_management/commands/case15.js';
import case16 from '../../jira_management/commands/case16.js';
import PackageVersionManager from '../../jira_management/package_version_manager.js';

const E2E_TOKEN = process.env['E2E_JIRA_TOKEN'] ?? 'e2e-token';
const HOST = 'http://localhost:1996';
const API = HOST + '/rest/api/2';

describe('Handlers Happy Paths', () => {
    beforeAll(() => {
        nock.cleanAll();
        process.env['HOME'] = tmpHome;
        process.env['JIRA_BASE_URL'] = HOST;
        process.env['JIRA_PERSONAL_TOKEN'] = E2E_TOKEN;
        process.env['XRAY_BASE_URL'] = HOST;
        process.env['QUIET'] = 'true';
        // The repo's .env.test forces JIRA_MODE=cloud. These e2e suites mock the
        // Jira Server HTTP surface via nock (issue links, custom fields), so the
        // real Config must resolve to server mode. We set it explicitly so the
        // production code runs with the mode its mocks represent (no internal
        // mock/theater). This is the external boundary, not internal logic.
        process.env['JIRA_MODE'] = 'server';
        nock.disableNetConnect();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        // Phase 0.8: handlers resolve a DataHub via resolveSessionContext(); provide one.
        setDataHub(makeDataHubMock());
        nock.cleanAll();
        // Clear mockResolvedValueOnce queue (clearAllMocks does NOT clear it)
        getPrompt().ask.mockReset();
        getPrompt().ask.mockResolvedValue('');
        getPrompt().prompt.mockReset();
        getPrompt().prompt.mockReturnValue('');
        getPrompt().confirm.mockReset();
        getPrompt().confirm.mockReturnValue(true);
        nock.disableNetConnect();
        vi.spyOn(console, 'log').mockImplementation(vi.fn<(...args: []) => void>());
        vi.spyOn(process.stdout, 'write').mockImplementation(
            vi.fn<(...args: [string | Uint8Array]) => boolean>().mockReturnValue(true),
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        nock.cleanAll();
        nock.enableNetConnect();
    });

    afterAll(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
        [tmpHome, tmpGitDir].forEach((d) => {
            if (fs.existsSync(d)) {
                fs.rmSync(d, { recursive: true, force: true });
            }
        });
    });

    function buildContext() {
        const jira = new JiraResource(E2E_TOKEN, API);
        const jiraXray = new JiraResource(E2E_TOKEN, HOST);
        const lm = new JiraLinkManager(jira);
        const lmXray = new JiraLinkManager(jiraXray);
        const csv = new CsvResource();
        const ctx = new SessionContext();
        ctx.project_name = 'ECSPOL';
        ctx.inMemoryTasksId = ['IMT-1', 'IMT-2'];
        ctx.inMemoryTasksText = ['Memory Test 1', 'Memory Test 2'];
        ctx.createPackageManager = vi.fn<(...args: [string]) => PackageVersionManager>((dir: string) => {
            return new PackageVersionManager(dir);
        });
        return {
            jiraResource: jira,
            jiraResourceXray: jiraXray,
            linkManager: lm,
            linkManagerXray: lmXray,
            csvResource: csv,
            ctx,
            pushHistory: vi.fn<(...args: [string, string, string]) => void>(
                (op: string, detail: string, status: string) => ctx.pushHistory(op, detail, status),
            ),
            printSessionSummary: vi.fn<(...args: []) => () => void>(),
            base_url: HOST,
            sessionLog: rootLogger.child({ session: 'e2e-hp' }),
            dataHub: { computed: { metricsRuns: [] } as never, raw: {} as never, saveMetricsStore: vi.fn() } as never,
        };
    }

    const getPrompt = () => vi.mocked(promptModule);

    // ──────────────────────────────────────────────
    // case02 — List versions  (GET project + versions)
    // ──────────────────────────────────────────────
    describe('Case02 — list versions', () => {
        it('happy path: project found, 2 versions returned', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/project/123/versions').reply(200, [
                { name: 'v1.0.0', released: true, description: 'First' },
                { name: 'v2.0.0', released: false, releaseDate: '2099-01-01', description: 'Next' },
            ]);
            const c = buildContext();
            const mod = case02;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('listar-versoes', '2 versão(oes)', 'ok');
            expect(nock.isDone()).toBeTruthy();
        });

        it('no versions found — empty array', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/project/123/versions').reply(200, []);
            const c = buildContext();
            const mod = case02;
            await mod.handler(c);

            // pushHistory é chamado apenas quando há versões (results.length > 0)
            expect(c.pushHistory).not.toHaveBeenCalled();
            expect(nock.isDone()).toBeTruthy();
        });

        it('project not found — returns early without pushHistory', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(404);
            const c = buildContext();
            const mod = case02;
            await mod.handler(c);

            expect(c.pushHistory).not.toHaveBeenCalled();
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case03 — Create version  (postJiraResource → POST /version)
    // ──────────────────────────────────────────────
    describe('Case03 — create version', () => {
        it('happy path: creates version', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            // createVersion → getVersionId → getProjectId + getProjectVersions, then POST
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/project/123/versions').reply(200, []);
            api.post('/version').reply(201, { name: 'v2.0.0', id: '99' });
            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            getPrompt().ask.mockResolvedValueOnce('Release notes');
            const c = buildContext();
            const mod = case03;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('criar-versão', 'v2.0.0', 'ok');
            expect(nock.isDone()).toBeTruthy();
        });

        it('empty name — returns early without history', async () => {
            expect.hasAssertions();

            getPrompt().ask.mockResolvedValueOnce('');
            const c = buildContext();
            const mod = case03;
            await mod.handler(c);

            expect(c.pushHistory).not.toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────
    // case04 — Assign fixVersion  (uses in-memory tasks + updateFixVersions)
    // ──────────────────────────────────────────────
    describe('Case04 — assign fixVersion', () => {
        it('happy path with in-memory tasks: updateFixVersions for each', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            // Handler calls updateFixVersions per task (in a for loop)
            // Each call → getVersionId → getProjectId + getProjectVersions
            api.get('/project/ECSPOL').times(2).reply(200, { id: '123' });
            api.get('/project/123/versions')
                .times(2)
                .reply(200, [{ name: 'v2.0.0', id: '99' }]);
            api.put('/issue/IMT-1').reply(204);
            api.put('/issue/IMT-2').reply(204);

            getPrompt().askConfirm.mockResolvedValueOnce(true); // use in-memory // pagination
            getPrompt().ask.mockResolvedValueOnce('v2.0.0'); // version
            getPrompt().askConfirm.mockResolvedValueOnce(true); // confirm fixVersion
            getPrompt().askConfirm.mockResolvedValueOnce(false); // no sprint

            const c = buildContext();
            const mod = case04;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('atribuir-fixversion', expect.stringContaining('2/2'), 'ok');
            expect(c.ctx.results.filter((r: { status: string }) => r.status === 'ok')).toHaveLength(2);
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case05 — Update package + release notes  (getReleaseTasks + PackageVersionManager)
    // ──────────────────────────────────────────────
    describe('Case05 — update package + release notes', () => {
        it('happy path: fetches tasks, updates package.json and release notes', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/search')
                .query(true)
                .reply(200, {
                    issues: [
                        { key: 'TEST-1', fields: { summary: 'Login' } },
                        { key: 'TEST-2', fields: { summary: 'Logout' } },
                    ],
                    total: 2,
                });
            getPrompt().ask.mockResolvedValueOnce(tmpGitDir);
            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            const c = buildContext();
            const mod = case05;
            await mod.handler(c);

            const pkg: { [key: string]: unknown } = JSON.parse(
                fs.readFileSync(path.resolve(path.join(tmpGitDir, 'package.json')), 'utf8'),
            ) as { [key: string]: unknown };
            const rn = fs.readFileSync(path.resolve(path.join(rnDir, 'ReleaseNotes.txt')), 'utf8');

            expect(pkg['version']).toBe('2.0.0');
            expect(rn).toContain('TEST-1');
            expect(rn).toContain('TEST-2');
            expect(c.pushHistory).toHaveBeenCalledWith('atualizar-package', expect.stringContaining('2.0.0'), 'ok');
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case06 — Check task status  (checkReleaseTasksStatus)
    // ──────────────────────────────────────────────
    describe('Case06 — check task status', () => {
        it('happy path: all tasks done', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/search')
                .query(true)
                .reply(200, {
                    issues: [{ key: 'TEST-1', fields: { status: { name: 'Done' } } }],
                    total: 1,
                });
            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            const c = buildContext();
            const mod = case06;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('verificar-status', 'v2.0.0', 'ok');
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case07 — Close tasks  (getReleaseTasks + moveCardsToDone)
    // ──────────────────────────────────────────────
    describe('Case07 — close tasks', () => {
        it('happy path: close 2 tasks from New → approve → use test case', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/search')
                .query(true)
                .reply(200, {
                    issues: [
                        { key: 'TEST-1', fields: { summary: 'Login' } },
                        { key: 'TEST-2', fields: { summary: 'Logout' } },
                    ],
                    total: 2,
                });
            // moveCardsToDone for each task:
            api.get('/issue/TEST-1').reply(200, { key: 'TEST-1', fields: { status: { name: 'New' } } });
            api.get('/issue/TEST-2').reply(200, { key: 'TEST-2', fields: { status: { name: 'New' } } });
            api.get('/issue/TEST-1/transitions').reply(200, {
                transitions: [
                    { id: '21', name: 'Approve', to: { name: 'Approve' } },
                    { id: '31', name: 'Use Test Case', to: { name: 'Use Test Case' } },
                ],
            });
            api.get('/issue/TEST-2/transitions').reply(200, {
                transitions: [
                    { id: '21', name: 'Approve', to: { name: 'Approve' } },
                    { id: '31', name: 'Use Test Case', to: { name: 'Use Test Case' } },
                ],
            });
            // New → approve, approve → use test case
            api.post('/issue/TEST-1/transitions').times(2).reply(204);
            api.post('/issue/TEST-2/transitions').times(2).reply(204);

            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            getPrompt().askConfirm.mockResolvedValueOnce(true);

            const c = buildContext();
            const mod = case07;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('fechar-tarefas', '2 tarefa(s)', 'ok');
            expect(nock.isDone()).toBeTruthy();
        });

        it('no tasks found — returns early', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            api.get('/search').query(true).reply(200, { issues: [], total: 0 });
            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            getPrompt().askConfirm.mockResolvedValueOnce(true);
            const c = buildContext();
            const mod = case07;
            await mod.handler(c);

            expect(c.pushHistory).not.toHaveBeenCalled();
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case08 — Publish version  (releaseVersion)
    // ──────────────────────────────────────────────
    describe('Case08 — publish version', () => {
        it('happy path: releases version', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            // releaseVersion → getVersionId → getProjectId + getProjectVersions
            // Then checkReleaseTasksStatus → getProjectId (2nd time) + searchJiraIssues
            api.get('/project/ECSPOL').times(2).reply(200, { id: '123' });
            api.get('/project/123/versions').reply(200, [{ name: 'v2.0.0', id: '99' }]);
            api.get('/search')
                .query(true)
                .reply(200, {
                    issues: [{ key: 'TEST-1', fields: { status: { name: 'Done' } } }],
                    total: 1,
                });
            api.put('/version/99').reply(200);

            getPrompt().ask.mockResolvedValueOnce('v2.0.0');
            getPrompt().askConfirm.mockResolvedValueOnce(true);

            const c = buildContext();
            const mod = case08;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('publicar-versão', 'v2.0.0', 'ok');
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case09 — Switch project  (local — no HTTP)
    // ──────────────────────────────────────────────
    describe('Case09 — switch project', () => {
        it('updates ctx.project_name and persists to state', async () => {
            expect.hasAssertions();

            getPrompt().ask.mockResolvedValueOnce('NEWPROJ');
            const c = buildContext();
            const mod = case09;
            await mod.handler(c);

            expect(c.ctx.project_name).toBe('NEWPROJ');
            expect(c.pushHistory).toHaveBeenCalledWith('trocar-projeto', 'NEWPROJ', 'ok');
            expect(stateModule.update).toHaveBeenCalledWith(expect.any(Function));
        });
    });

    // ──────────────────────────────────────────────
    // case10 — Change git directory  (local — no HTTP)
    // ──────────────────────────────────────────────
    describe('Case10 — change git directory', () => {
        it('sets git directory and packageManager', async () => {
            expect.hasAssertions();

            getPrompt().ask.mockResolvedValueOnce(tmpGitDir);
            const c = buildContext();
            const mod = case10;
            await mod.handler(c);

            expect(c.ctx.git_directory).toBe(tmpGitDir);
            expect(c.ctx.packageManager).toBeDefined();
        });
    });

    // ──────────────────────────────────────────────
    // case11 — Generate CSV/JSON template  (local — copies file)
    // ──────────────────────────────────────────────
    describe('Case11 — generate CSV/JSON template', () => {
        it('copies CSV template file to target path', async () => {
            expect.hasAssertions();

            const dest = path.join(tmpHome, 'template.csv');
            getPrompt().ask.mockResolvedValueOnce('CSV').mockResolvedValueOnce(dest);
            const c = buildContext();
            const mod = case11;
            await mod.handler(c);

            expect(fs.existsSync(path.resolve(dest))).toBeTruthy();
            expect(c.pushHistory).toHaveBeenCalledWith('gerar-template', 'CSV: ' + dest, 'ok');
        });

        it('copies JSON template file to target path', async () => {
            expect.hasAssertions();

            const dest = path.join(tmpHome, 'template.json');
            getPrompt().ask.mockResolvedValueOnce('JSON').mockResolvedValueOnce(dest);
            const c = buildContext();
            const mod = case11;
            await mod.handler(c);

            expect(fs.existsSync(path.resolve(dest))).toBeTruthy();
            expect(c.pushHistory).toHaveBeenCalledWith('gerar-template', 'JSON: ' + dest, 'ok');
        });
    });

    // ──────────────────────────────────────────────
    // case12 — Diagnose connection  (3 GET endpoints)
    // ──────────────────────────────────────────────
    describe('Case12 — diagnose connection', () => {
        it('all 3 endpoints respond 200', async () => {
            expect.hasAssertions();

            const { api, xray } = freshScope();
            api.get('/myself').reply(200, { displayName: 'Bot' });
            xray.get('/').reply(200, { info: 'xray-ok' });
            api.get('/project/ECSPOL').reply(200, { id: '123', name: 'ECSPOL' });
            const c = buildContext();
            const mod = case12;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('3/4'), 'ok');
            expect(nock.isDone()).toBeTruthy();
        });

        it('one endpoint fails with 401', async () => {
            expect.hasAssertions();

            const { api, xray } = freshScope();
            api.get('/myself').reply(200, { displayName: 'Bot' });
            xray.get('/').reply(401);
            api.get('/project/ECSPOL').reply(200, { id: '123' });
            const c = buildContext();
            const mod = case12;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/4'), 'error');
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case13 — Create Test Execution  (uses in-memory tasks, helper → HTTP)
    // ──────────────────────────────────────────────
    describe('Case13 — create Test Execution', () => {
        it('happy path with in-memory tasks', async () => {
            expect.hasAssertions();

            const { api } = freshScope();
            // createTestExecution → findExistingTe(GET /search), GET /issuetype, POST /issue
            api.get('/search').query(true).reply(200, { issues: [], total: 0 });
            api.get('/issuetype').reply(200, [
                { id: '11200', name: 'Epic' },
                { id: '11802', name: 'Test Execution' },
            ]);
            api.post('/issue').reply(201, { key: 'EXEC-1', id: '20001' });
            // Server mode: create() resolves the Xray Server custom field to attach tests.
            api.get('/field').reply(200, [
                {
                    id: 'customfield_10010',
                    name: 'Test Execution Tests',
                    schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
                },
            ]);
            // createWithLinks → GET /issue/EXEC-1 to check existing links, then link tests via issue links.
            api.get('/issue/EXEC-1').reply(200, { key: 'EXEC-1', id: '20001', fields: { issuelinks: [] } });
            // createIssueLink → GET /issueLinkType (cached), POST /issueLink per test key.
            api.get('/issueLinkType').reply(200, {
                issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
            });
            api.post('/issueLink').times(2).reply(201);
            // showResults → getTestCaseSummaries
            api.get('/issue/IMT-1')
                .query(true)
                .reply(200, { key: 'IMT-1', fields: { summary: 'Memory Test 1' } });
            api.get('/issue/IMT-2')
                .query(true)
                .reply(200, { key: 'IMT-2', fields: { summary: 'Memory Test 2' } });

            getPrompt().askConfirm.mockResolvedValueOnce(true); // use in-memory // pagination
            getPrompt().ask.mockResolvedValueOnce('1'); // option 1 — create new TE
            getPrompt().ask.mockResolvedValueOnce(''); // name (default '')
            getPrompt().ask.mockResolvedValueOnce(''); // title
            getPrompt().ask.mockResolvedValueOnce(''); // description

            const c = buildContext();
            const mod = case13;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'EXEC-1', 'ok');
            // Server mode: tests are associated to the TE via the "Tests" issue link.
            expect(nock.isDone()).toBeTruthy();
        });
    });

    // ──────────────────────────────────────────────
    // case14 — Change Cypress directory  (local — no HTTP)
    // ──────────────────────────────────────────────
    describe('Case14 — change Cypress directory', () => {
        it('sets cypress dir in state', async () => {
            expect.hasAssertions();

            const tmpCypress = path.join(os.tmpdir(), 'cypress');
            getPrompt().ask.mockResolvedValueOnce(tmpCypress);
            const c = buildContext();
            const mod = case14;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('config-tests', tmpCypress, 'ok');
            expect(stateModule.update).toHaveBeenCalledWith(expect.any(Function));
        });
    });

    // ──────────────────────────────────────────────
    // case15 — Import JSON tests  (createTestsFromJson + optional TE)
    // ──────────────────────────────────────────────
    describe('Case15 — import JSON tests', () => {
        it('happy path: creates test from JSON then Test Execution', async () => {
            expect.hasAssertions();

            const { api, xray } = freshScope();
            // createTestsFromJson creates 1 test from JSON fixture:
            // 1. POST /issue to create the test case
            // 1a. GET /search (skipExisting check in createIssue)
            api.get('/search').query(true).reply(200, { issues: [] });
            // 2. POST /issue to create the test case
            api.post('/issue').reply(201, { key: 'TEST-1', id: '10001' });
            // 3. POST /test/{key}/steps via jiraResourceXray (baseURL = HOST)
            xray.post('/test/TEST-1/steps').reply(201);
            // Then TE creation (confirm=true):
            // findExistingTe in TestExecutionCreator.create() → GET /search
            api.get('/search').query(true).reply(200, { issues: [], total: 0 });
            // 2nd GET /search: findExistingTe inside create()
            api.get('/search').query(true).reply(200, { issues: [], total: 0 });
            api.get('/issuetype').reply(200, [
                { id: '11200', name: 'Epic' },
                { id: '11802', name: 'Test Execution' },
            ]);
            api.post('/issue').reply(201, { key: 'EXEC-1', id: '20001' });
            // Server mode: create() resolves the Xray Server custom field to attach tests.
            api.get('/field').reply(200, [
                {
                    id: 'customfield_10010',
                    name: 'Test Execution Tests',
                    schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
                },
            ]);
            // createWithLinks → GET /issue/EXEC-1 to check existing links, then link tests via issue links.
            api.get('/issue/EXEC-1').reply(200, { key: 'EXEC-1', id: '20001', fields: { issuelinks: [] } });
            // createIssueLink → GET /issueLinkType (cached), POST /issueLink per test key.
            api.get('/issueLinkType').reply(200, {
                issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
            });
            api.post('/issueLink').reply(201);
            // showResults → getTestCaseSummaries
            api.get('/issue/TEST-1')
                .query(true)
                .reply(200, { key: 'TEST-1', fields: { summary: 'TC E2E' } });

            getPrompt().ask.mockResolvedValueOnce(jsonFixture); // json path // pagination
            getPrompt().ask.mockResolvedValueOnce('1'); // option 1 — create new TE
            getPrompt().ask.mockResolvedValueOnce(''); // name (default '')
            getPrompt().ask.mockResolvedValueOnce(''); // title
            getPrompt().ask.mockResolvedValueOnce(''); // description

            const c = buildContext();
            c.ctx.packageManager = undefined;
            const mod = case15;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('importar-json', '1 testes', 'ok');
            expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'EXEC-1', 'ok');
            // Server mode: tests are associated to the TE via the "Tests" issue link.
            expect(nock.isDone()).toBeTruthy();
        }, 15000);
    });

    // ──────────────────────────────────────────────
    // case16 — Change JSON directory  (local — no HTTP)
    // ──────────────────────────────────────────────
    describe('Case16 — change JSON directory', () => {
        it('sets json dir', async () => {
            expect.hasAssertions();

            const tmpJson = path.join(os.tmpdir(), 'json');
            getPrompt().ask.mockResolvedValueOnce(tmpJson);
            const c = buildContext();
            const mod = case16;
            await mod.handler(c);

            expect(c.pushHistory).toHaveBeenCalledWith('config-json-dir', tmpJson, 'ok');
        });
    });

    // ──────────────────────────────────────────────
    // Helpers — keep at bottom
    // ──────────────────────────────────────────────
    function freshScope() {
        nock.cleanAll();
        nock.disableNetConnect();
        const api = nock(API).defaultReplyHeaders({ 'Content-Type': 'application/json' });
        const xray = nock(HOST).defaultReplyHeaders({ 'Content-Type': 'application/json' });
        return { api, xray };
    }
});
