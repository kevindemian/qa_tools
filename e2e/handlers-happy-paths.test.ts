jest.mock('../shared/prompt', () => {
    const actual = jest.requireActual('../shared/prompt');
    return {
        ...actual,
        prompt: jest.fn().mockReturnValue(''),
        confirm: jest.fn().mockReturnValue(true),
        smartPrompt: jest.fn().mockReturnValue('v2.0.0'),
    };
});
jest.mock('../shared/state', () => ({
    load: jest.fn().mockReturnValue({}),
    update: jest.fn(),
}));

import fs from 'fs';
import path from 'path';
import os from 'os';

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-hp-'));
const tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-git-'));

fs.writeFileSync(path.join(tmpGitDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0', scripts: {} }));
const rnDir = path.join(tmpGitDir, 'release_notes');
fs.mkdirSync(rnDir, { recursive: true });
fs.writeFileSync(path.join(rnDir, 'ReleaseNotes.txt'), '');

const templateSrc = path.join(__dirname, '../jira_management/test_steps_template.csv');
if (!fs.existsSync(templateSrc)) {
    fs.writeFileSync(templateSrc, 'Title,Action,Data,Expected Result\nExemplo,Step1,,Result1\n');
}

const jsonFixture = path.join(tmpHome, 'cases.json');
fs.writeFileSync(
    jsonFixture,
    JSON.stringify([{ title: 'TC E2E', description: 'e2e', steps: [{ Action: 'Step1', ExpectedResult: 'R1' }] }]),
);

jest.setTimeout(30000);

import nock from 'nock';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import CsvResource from '../jira_management/csv_resource';
import { rootLogger } from '../shared/logger';
import { SessionContext } from '../shared/session-context';

const HOST = 'http://localhost:1996';
const API = HOST + '/rest/api/2';

beforeAll(() => {
    process.env.HOME = tmpHome;
    process.env.JIRA_BASE_URL = HOST;
    process.env.JIRA_PERSONAL_TOKEN = 'e2e-token';
    process.env.XRAY_BASE_URL = HOST;
    process.env.QUIET = 'true';
    nock.disableNetConnect();
});

afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    [tmpHome, tmpGitDir].forEach((d) => {
        try {
            fs.rmSync(d, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    });
});

beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    nock.disableNetConnect();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
    jest.restoreAllMocks();
    nock.cleanAll();
    nock.enableNetConnect();
});

function buildContext() {
    const jira = new JiraResource('e2e-token', API);
    const jiraXray = new JiraResource('e2e-token', HOST);
    const lm = new JiraLinkManager(jira);
    const lmXray = new JiraLinkManager(jiraXray);
    const csv = new CsvResource();
    const ctx = new SessionContext();
    ctx.project_name = 'ECSPOL';
    ctx.inMemoryTasksId = ['IMT-1', 'IMT-2'];
    ctx.inMemoryTasksText = ['Memory Test 1', 'Memory Test 2'];
    ctx.createPackageManager = jest.fn((dir: string) => {
        const PackageVersionManager = require('../jira_management/package_version_manager');
        return new PackageVersionManager(dir);
    });
    return {
        jiraResource: jira,
        jiraResourceXray: jiraXray,
        linkManager: lm,
        linkManagerXray: lmXray,
        csvResource: csv,
        ctx,
        pushHistory: jest.fn((op: string, detail: string, status: string) => ctx.pushHistory(op, detail, status)),
        printSessionSummary: jest.fn(),
        base_url: HOST,
        sessionLog: rootLogger.child({ session: 'e2e-hp' }),
    };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require to ensure jest.mock hoisting
const getPrompt = () =>
    require('../shared/prompt') as { prompt: jest.Mock; confirm: jest.Mock; smartPrompt: jest.Mock };

// ──────────────────────────────────────────────
// case02 — List versions  (GET project + versions)
// ──────────────────────────────────────────────
describe('case02 — list versions', () => {
    it('happy path: project found, 2 versions returned', async () => {
        const { api } = freshScope();
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        api.get('/project/123/versions').reply(200, [
            { name: 'v1.0.0', released: true, description: 'First' },
            { name: 'v2.0.0', released: false, releaseDate: '2099-01-01', description: 'Next' },
        ]);
        const c = buildContext();
        const mod = require('../jira_management/commands/case02');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('listar-versoes', '2 versão(oes)', 'ok');
        expect(nock.isDone()).toBe(true);
    });

    it('no versions found — empty array', async () => {
        const { api } = freshScope();
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        api.get('/project/123/versions').reply(200, []);
        const c = buildContext();
        const mod = require('../jira_management/commands/case02');
        await mod.handler(c);
        // pushHistory é chamado apenas quando há versões (results.length > 0)
        expect(c.pushHistory).not.toHaveBeenCalled();
        expect(nock.isDone()).toBe(true);
    });

    it('project not found — catches error and pushes error history', async () => {
        const { api } = freshScope();
        api.get('/project/ECSPOL').reply(404);
        const c = buildContext();
        const mod = require('../jira_management/commands/case02');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('listar-versoes', 'erro', 'error');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case03 — Create version  (postJiraResource → POST /version)
// ──────────────────────────────────────────────
describe('case03 — create version', () => {
    it('happy path: creates version', async () => {
        const { api } = freshScope();
        // createVersion → getVersionId → getProjectId + getProjectVersions, then POST
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        api.get('/project/123/versions').reply(200, []);
        api.post('/version').reply(201, { name: 'v2.0.0', id: '99' });
        getPrompt().prompt.mockReturnValueOnce('v2.0.0');
        getPrompt().prompt.mockReturnValueOnce('Release notes');
        const c = buildContext();
        const mod = require('../jira_management/commands/case03');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('criar-versão', 'v2.0.0', 'ok');
        expect(nock.isDone()).toBe(true);
    });

    it('empty name — returns early without history', async () => {
        getPrompt().prompt.mockReturnValueOnce('');
        const c = buildContext();
        const mod = require('../jira_management/commands/case03');
        await mod.handler(c);
        expect(c.pushHistory).not.toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// case04 — Assign fixVersion  (uses in-memory tasks + updateFixVersions)
// ──────────────────────────────────────────────
describe('case04 — assign fixVersion', () => {
    it('happy path with in-memory tasks: updateFixVersions for each', async () => {
        const { api } = freshScope();
        // Handler calls updateFixVersions per task (in a for loop)
        // Each call → getVersionId → getProjectId + getProjectVersions
        api.get('/project/ECSPOL').times(2).reply(200, { id: '123' });
        api.get('/project/123/versions')
            .times(2)
            .reply(200, [{ name: 'v2.0.0', id: '99' }]);
        api.put('/issue/IMT-1').reply(204);
        api.put('/issue/IMT-2').reply(204);

        getPrompt().confirm.mockReturnValueOnce(true); // use in-memory
        getPrompt().confirm.mockReturnValueOnce(true); // confirm fixVersion
        getPrompt().confirm.mockReturnValueOnce(false); // no sprint

        const c = buildContext();
        const mod = require('../jira_management/commands/case04');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('atribuir-fixversion', expect.stringContaining('2/2'), 'ok');
        expect(c.ctx.results.filter((r: { status: string }) => r.status === 'ok')).toHaveLength(2);
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case05 — Update package + release notes  (getReleaseTasks + PackageVersionManager)
// ──────────────────────────────────────────────
describe('case05 — update package + release notes', () => {
    it('happy path: fetches tasks, updates package.json and release notes', async () => {
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
        getPrompt().smartPrompt.mockReturnValueOnce(tmpGitDir);
        getPrompt().smartPrompt.mockReturnValueOnce('v2.0.0');
        const c = buildContext();
        const mod = require('../jira_management/commands/case05');
        await mod.handler(c);

        const pkg = JSON.parse(fs.readFileSync(path.join(tmpGitDir, 'package.json'), 'utf8'));
        const rn = fs.readFileSync(path.join(rnDir, 'ReleaseNotes.txt'), 'utf8');

        expect(pkg.version).toBe('2.0.0');
        expect(rn).toContain('TEST-1');
        expect(rn).toContain('TEST-2');
        expect(c.pushHistory).toHaveBeenCalledWith('atualizar-package', expect.stringContaining('2.0.0'), 'ok');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case06 — Check task status  (checkReleaseTasksStatus)
// ──────────────────────────────────────────────
describe('case06 — check task status', () => {
    it('happy path: all tasks done', async () => {
        const { api } = freshScope();
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        api.get('/search')
            .query(true)
            .reply(200, {
                issues: [{ key: 'TEST-1', fields: { status: { name: 'Done' } } }],
                total: 1,
            });
        const c = buildContext();
        const mod = require('../jira_management/commands/case06');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('verificar-status', 'v2.0.0', 'ok');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case07 — Close tasks  (getReleaseTasks + moveCardsToDone)
// ──────────────────────────────────────────────
describe('case07 — close tasks', () => {
    it('happy path: close 2 tasks from New → approve → use test case', async () => {
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

        getPrompt().smartPrompt.mockReturnValueOnce('v2.0.0');
        getPrompt().confirm.mockReturnValueOnce(true);

        const c = buildContext();
        const mod = require('../jira_management/commands/case07');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('fechar-tarefas', '2 tarefa(s)', 'ok');
        expect(nock.isDone()).toBe(true);
    });

    it('no tasks found — returns early', async () => {
        const { api } = freshScope();
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        api.get('/search').query(true).reply(200, { issues: [], total: 0 });
        getPrompt().smartPrompt.mockReturnValueOnce('v2.0.0');
        getPrompt().confirm.mockReturnValueOnce(true);
        const c = buildContext();
        const mod = require('../jira_management/commands/case07');
        await mod.handler(c);
        expect(c.pushHistory).not.toHaveBeenCalled();
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case08 — Publish version  (releaseVersion)
// ──────────────────────────────────────────────
describe('case08 — publish version', () => {
    it('happy path: releases version', async () => {
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

        getPrompt().smartPrompt.mockReturnValueOnce('v2.0.0');
        getPrompt().confirm.mockReturnValueOnce(true);

        const c = buildContext();
        const mod = require('../jira_management/commands/case08');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('publicar-versão', 'v2.0.0', 'ok');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case09 — Switch project  (local — no HTTP)
// ──────────────────────────────────────────────
describe('case09 — switch project', () => {
    it('updates ctx.project_name and persists to state', () => {
        getPrompt().prompt.mockReturnValueOnce('NEWPROJ');
        const c = buildContext();
        const mod = require('../jira_management/commands/case09');
        mod.handler(c);
        expect(c.ctx.project_name).toBe('NEWPROJ');
        expect(c.pushHistory).toHaveBeenCalledWith('trocar-projeto', 'NEWPROJ', 'ok');
        expect(require('../shared/state').update).toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// case10 — Change git directory  (local — no HTTP)
// ──────────────────────────────────────────────
describe('case10 — change git directory', () => {
    it('sets git directory and packageManager', () => {
        getPrompt().prompt.mockReturnValueOnce(tmpGitDir);
        const c = buildContext();
        const mod = require('../jira_management/commands/case10');
        mod.handler(c);
        expect(c.ctx.git_directory).toBe(tmpGitDir);
        expect(c.ctx.packageManager).toBeDefined();
    });
});

// ──────────────────────────────────────────────
// case11 — Generate CSV template  (local — copies file)
// ──────────────────────────────────────────────
describe('case11 — generate CSV template', () => {
    it('copies template file to target path', () => {
        const dest = path.join(tmpHome, 'template.csv');
        getPrompt().prompt.mockReturnValueOnce(dest);
        const c = buildContext();
        const mod = require('../jira_management/commands/case11');
        mod.handler(c);
        expect(fs.existsSync(dest)).toBe(true);
        expect(c.pushHistory).toHaveBeenCalledWith('gerar-template', dest, 'ok');
    });
});

// ──────────────────────────────────────────────
// case12 — Diagnose connection  (3 GET endpoints)
// ──────────────────────────────────────────────
describe('case12 — diagnose connection', () => {
    it('all 3 endpoints respond 200', async () => {
        const { api, xray } = freshScope();
        api.get('/myself').reply(200, { displayName: 'Bot' });
        xray.get('/').reply(200, { info: 'xray-ok' });
        api.get('/project/ECSPOL').reply(200, { id: '123', name: 'ECSPOL' });
        const c = buildContext();
        const mod = require('../jira_management/commands/case12');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('3/3'), 'ok');
        expect(nock.isDone()).toBe(true);
    });

    it('one endpoint fails with 401', async () => {
        const { api, xray } = freshScope();
        api.get('/myself').reply(200, { displayName: 'Bot' });
        xray.get('/').reply(401);
        api.get('/project/ECSPOL').reply(200, { id: '123' });
        const c = buildContext();
        const mod = require('../jira_management/commands/case12');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('diagnostico', expect.stringContaining('2/3'), 'error');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case13 — Create Test Execution  (uses in-memory tasks, helper → HTTP)
// ──────────────────────────────────────────────
describe('case13 — create Test Execution', () => {
    it('happy path with in-memory tasks', async () => {
        const { api } = freshScope();
        // createTestExecution → GET /issuetype, GET /field, POST /issue
        api.get('/issuetype').reply(200, [
            { id: '11200', name: 'Epic' },
            { id: '11802', name: 'Test Execution' },
        ]);
        api.get('/field').reply(200, [
            {
                id: 'cf_13715',
                name: 'Tests association',
                schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
            },
        ]);
        api.post('/issue').reply(201, { key: 'EXEC-1', id: '20001' });
        // createWithLinks → GET /issue/EXEC-1 to check existing links
        api.get('/issue/EXEC-1').reply(200, { key: 'EXEC-1', fields: { issuelinks: [] } });
        // createIssueLinks → GET /issueLinkType (cached), POST /issueLink per key
        api.get('/issueLinkType').reply(200, {
            issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
        });
        api.post('/issueLink').times(2).reply(201);

        getPrompt().confirm.mockReturnValueOnce(true); // use in-memory
        getPrompt().prompt.mockReturnValueOnce(''); // name (default '')
        getPrompt().prompt.mockReturnValueOnce(''); // title
        getPrompt().prompt.mockReturnValueOnce(''); // description

        const c = buildContext();
        const mod = require('../jira_management/commands/case13');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'EXEC-1', 'ok');
        expect(nock.isDone()).toBe(true);
    });
});

// ──────────────────────────────────────────────
// case14 — Change Cypress directory  (local — no HTTP)
// ──────────────────────────────────────────────
describe('case14 — change Cypress directory', () => {
    it('sets cypress dir in state', () => {
        getPrompt().prompt.mockReturnValueOnce('/tmp/cypress');
        const c = buildContext();
        const mod = require('../jira_management/commands/case14');
        mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('config-cypress', '/tmp/cypress', 'ok');
        expect(require('../shared/state').update).toHaveBeenCalled();
    });
});

// ──────────────────────────────────────────────
// case15 — Import JSON tests  (createTestsFromJson + optional TE)
// ──────────────────────────────────────────────
describe('case15 — import JSON tests', () => {
    it('happy path: creates test from JSON then Test Execution', async () => {
        const { api, xray } = freshScope();
        // createTestsFromJson creates 1 test from JSON fixture:
        // 1. POST /issue to create the test case
        api.post('/issue').reply(201, { key: 'TEST-1', id: '10001' });
        // 2. POST /test/{key}/steps via jiraResourceXray (baseURL = HOST)
        xray.post('/test/TEST-1/steps').reply(201);
        // Then TE creation (confirm=true):
        api.get('/issuetype').reply(200, [
            { id: '11200', name: 'Epic' },
            { id: '11802', name: 'Test Execution' },
        ]);
        api.get('/field').reply(200, [
            {
                id: 'cf_13715',
                name: 'Tests association',
                schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
            },
        ]);
        api.post('/issue').reply(201, { key: 'EXEC-1', id: '20001' });
        api.get('/issue/EXEC-1').reply(200, { key: 'EXEC-1', fields: { issuelinks: [] } });
        api.get('/issueLinkType').reply(200, {
            issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
        });
        api.post('/issueLink').reply(201);

        getPrompt().smartPrompt.mockReturnValueOnce(jsonFixture); // json path
        getPrompt().prompt.mockReturnValueOnce('e2e,manual'); // labels
        getPrompt().confirm.mockReturnValueOnce(true); // create TE
        getPrompt().prompt.mockReturnValueOnce(''); // name
        getPrompt().prompt.mockReturnValueOnce(''); // title
        getPrompt().prompt.mockReturnValueOnce(''); // description

        const c = buildContext();
        c.ctx.packageManager = undefined;
        const mod = require('../jira_management/commands/case15');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('importar-json', '1 testes', 'ok');
        expect(c.pushHistory).toHaveBeenCalledWith('create-testexec', 'EXEC-1', 'ok');
        expect(nock.isDone()).toBe(true);
    }, 15000);
});

// ──────────────────────────────────────────────
// case16 — Change JSON directory  (local — no HTTP)
// ──────────────────────────────────────────────
describe('case16 — change JSON directory', () => {
    it('sets json dir in state', () => {
        getPrompt().prompt.mockReturnValueOnce('/tmp/json');
        const c = buildContext();
        const mod = require('../jira_management/commands/case16');
        mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalledWith('config-json-dir', '/tmp/json', 'ok');
        expect(require('../shared/state').update).toHaveBeenCalled();
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
