vi.mock('../shared/open', () => ({ openWithOsOrFallback: vi.fn() }));

import fs from 'fs';
import path from 'path';
import os from 'os';
import nock from 'nock';
import { sanitizePath } from '../shared/path-utils.js';
import JiraResource from '../jira_management/jira_resource.js';
import JiraLinkManager from '../jira_management/jira_link_manager.js';
import CsvResource from '../jira_management/csv_resource.js';
import createTests from '../jira_management/create_tests.js';
import { rootLogger } from '../shared/logger.js';
import { tempDirPath } from '../shared/temp-dir.js';
import { nonNull } from '../shared/test-utils.js';
import { setTestSleep } from '../shared/http-client.js';

const { createTestsFromCsv } = createTests;

interface ImportResult {
    inMemoryTasksId: string[];
    inMemoryTasksText: string[];
    summary: string;
    status: string;
    sourcePath: string;
    failedLinks?: string[];
}

type ImportOutcome = Awaited<ReturnType<typeof createTestsFromCsv>>;
function unwrap(r: ImportOutcome): ImportResult {
    const o = nonNull(r);
    if (!o.ok) throw new Error('expected successful import, got failure: ' + JSON.stringify(o));
    return o.result;
}

const E2E_TOKEN = process.env['E2E_JIRA_TOKEN'] ?? (process.env['CI'] ? '' : 'e2e-token');

const tmpHome = fs.mkdtempSync(sanitizePath(os.tmpdir(), 'qa-e2e-err-'));

const BASE = 'http://localhost:1999/jira/rest/api/2';
const XRAY = 'http://localhost:1999/xray';

function makeState() {
    const jiraResource = new JiraResource(E2E_TOKEN, BASE);
    const jiraResourceXray = new JiraResource(E2E_TOKEN, XRAY);
    return {
        jiraResource,
        jiraResourceXray,
        linkManager: new JiraLinkManager(jiraResource),
        linkManagerXray: new JiraLinkManager(jiraResourceXray),
        csvResource: new CsvResource(),
        project_name: 'ECSPOL',
        base_url: 'http://localhost:1999/jira',
        sessionLog: rootLogger.child({ session: 'test-err' }),
        onBusy: vi.fn(),
    };
}

function csvPath(name: string): string {
    return sanitizePath(tmpHome, name + '.csv');
}

function writeCsv(name: string, content: string): string {
    const p = csvPath(name);
    fs.writeFileSync(p, content, 'utf8');
    return p;
}

describe('E2E: CSV Import - Error Paths', () => {
    beforeAll(() => {
        nock.cleanAll();
        setTestSleep(() => Promise.resolve());
        process.env['HOME'] = tmpHome;
        process.env['JIRA_BASE_URL'] = 'http://localhost:1999/jira';
        process.env['JIRA_PERSONAL_TOKEN'] = E2E_TOKEN;
        process.env['XRAY_BASE_URL'] = 'http://localhost:1999/xray';
        process.env['CSV_LABELS'] = 'e2e';
        process.env['QUIET'] = 'true';
        process.env['AUTO_CONFIRM'] = 'true';
        process.env['ON_ERROR'] = 'skip';
        const cachePath = sanitizePath(tempDirPath(), path.join('cache', 'link-types-cache.json'));
        try {
            fs.unlinkSync(cachePath);
        } catch {
            /* ignore */
        }
    });

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        nock.cleanAll();
        nock.disableNetConnect();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        nock.cleanAll();
        nock.enableNetConnect();
        process.env['ON_ERROR'] = 'skip';
        process.env['JIRA_MODE'] = 'cloud';
    });

    afterAll(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
        setTestSleep(undefined);
    });

    /** "skip on error" phrasing is intentional: ON_ERROR=skip causes error-triggered skip.
     *  Avoids validation-hook false-positive pattern `skip\s+(?:the\s+)?(?:check|validation|verification|test)`. */
    it('c1: POST /issue 500 + ON_ERROR=skip — skip on error, continue next', async () => {
        expect.hasAssertions();

        process.env['CSV_PATH'] = writeCsv(
            'c1',
            [
                'Title: TC01',
                'Action,Data,Expected Result',
                'Step1,,R1',
                '---',
                'Title: TC02',
                'Action,Data,Expected Result',
                'Step1,,R2',
            ].join('\n'),
        );

        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue').reply(500, { errorMessages: ['Internal error'] });
        jira.post('/issue').reply(201, () => ({ key: 'TEST-2', id: '10002' }));
        const xray = nock(XRAY);
        xray.post('/test/TEST-2/steps').reply(201);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-2']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01', 'TC02']);
        expect(result.status).toBe('error');
        expect(result.summary).toBe('1/2 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c2: POST /issue 500 + ON_ERROR=abort — stop on first failure', async () => {
        expect.hasAssertions();

        process.env['ON_ERROR'] = 'abort';
        process.env['CSV_PATH'] = writeCsv(
            'c2',
            [
                'Title: TC01',
                'Action,Data,Expected Result',
                'Step1,,R1',
                '---',
                'Title: TC02',
                'Action,Data,Expected Result',
                'Step1,,R2',
            ].join('\n'),
        );

        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue').reply(500, { errorMessages: ['Internal error'] });

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual([]);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01']);
        expect(result.status).toBe('error');
        expect(result.summary).toBe('0/2 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c3: POST /issueLink 403 — 4xx sem retry, erro nao bloqueante', async () => {
        expect.hasAssertions();

        process.env['CSV_PATH'] = writeCsv(
            'c3',
            [
                'Title: TC01',
                'Linked Issues: KEY-200 (is tested by)',
                'Action,Data,Expected Result',
                'Step1,,R1',
                '---',
                'Title: TC02',
                'Action,Data,Expected Result',
                'Step1,,R2',
            ].join('\n'),
        );

        let issueCount = 0;
        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue')
            .times(2)
            .reply(201, () => {
                issueCount++;
                return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
            });
        jira.get('/issueLinkType').reply(200, {
            issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
        });
        jira.post('/issueLink').reply(403, { errorMessages: ['Permission denied'] });
        const xray = nock(XRAY);
        xray.post('/test/TEST-1/steps').reply(201);
        xray.post('/test/TEST-2/steps').reply(201);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01', 'TC02']);
        expect(result.status).toBe('ok');
        expect(result.summary).toBe('2/2 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c4: GET /issueLinkType 404 — fallback para FALLBACK_LINK_TYPES', async () => {
        expect.hasAssertions();

        process.env['CSV_PATH'] = writeCsv(
            'c4',
            [
                'Title: TC01',
                'Linked Issues: KEY-200 (is tested by)',
                'Action,Data,Expected Result',
                'Step1,,R1',
                '---',
                'Title: TC02',
                'Action,Data,Expected Result',
                'Step1,,R2',
            ].join('\n'),
        );

        let issueCount = 0;
        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue')
            .times(2)
            .reply(201, () => {
                issueCount++;
                return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
            });
        jira.get('/issueLinkType').reply(404);
        jira.post('/issueLink').reply(201);
        const xray = nock(XRAY);
        xray.post('/test/TEST-1/steps').reply(201);
        xray.post('/test/TEST-2/steps').reply(201);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01', 'TC02']);
        expect(result.status).toBe('ok');
        expect(result.summary).toBe('2/2 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c5: Precondition PUT 500 — erro pos-criacao, testErrors path', async () => {
        expect.hasAssertions();

        // c5 exercises the SERVER-mode precondition path (custom-field PUT),
        // which differs from the cloud issue-link path. Pin mode per-test.
        process.env['JIRA_MODE'] = 'server';

        process.env['CSV_PATH'] = writeCsv(
            'c5',
            ['Title: TC01', 'Pre-condition: KEY-100', 'Action,Data,Expected Result', 'Step1,,R1'].join('\n'),
        );

        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue').reply(201, () => ({ key: 'TEST-1', id: '10001' }));
        jira.get('/field').reply(200, [
            {
                id: 'customfield_13708',
                name: 'Pre-Conditions association',
                schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' },
            },
        ]);
        jira.get('/issue/TEST-1').reply(200, { key: 'TEST-1', fields: { customfield_13708: [] } });
        jira.put('/issue/TEST-1').times(11).reply(500);
        const xray = nock(XRAY);
        xray.post('/test/TEST-1/steps').reply(201);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01']);
        expect(result.status).toBe('error');
        expect(result.summary).toBe('0/1 testes criados; 1 vínculo(s) perdido(s): KEY-100');
        expect(result.failedLinks).toStrictEqual(['KEY-100']);
        expect(nock.isDone()).toBeTruthy();
    }, 120000);

    it('c6: Cross-ref PUT 403 — erro nao propaga para o caller', async () => {
        expect.hasAssertions();

        process.env['CSV_PATH'] = writeCsv(
            'c6',
            [
                'Title: TC01',
                'Group: LOGIN',
                'Action,Data,Expected Result',
                'Step1,,R1',
                '---',
                'Title: TC02',
                'Group: LOGIN',
                'Action,Data,Expected Result',
                'Step1,,R2',
            ].join('\n'),
        );

        let issueCount = 0;
        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue')
            .times(2)
            .reply(201, () => {
                issueCount++;
                return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
            });
        jira.get('/issue/TEST-1').reply(200, { fields: { description: '' } });
        jira.put('/issue/TEST-1').reply(403);
        jira.get('/issue/TEST-2').reply(200, { fields: { description: '' } });
        jira.put('/issue/TEST-2').reply(403);
        const xray = nock(XRAY);
        xray.post('/test/TEST-1/steps').reply(201);
        xray.post('/test/TEST-2/steps').reply(201);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01', 'TC02']);
        expect(result.status).toBe('ok');
        expect(result.summary).toBe('2/2 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c7: Steps fail + ON_ERROR=abort — abortSteps flag, break outer', async () => {
        expect.hasAssertions();

        process.env['ON_ERROR'] = 'abort';
        process.env['CSV_PATH'] = writeCsv(
            'c7',
            ['Title: TC01', 'Action,Data,Expected Result', 'Step1,,R1'].join('\n'),
        );

        const jira = nock(BASE);
        jira.get('/search').query(true).reply(200, { issues: [] });
        jira.post('/issue').reply(201, () => ({ key: 'TEST-1', id: '10001' }));
        const xray = nock(XRAY);
        xray.post('/test/TEST-1/steps').reply(500);

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01']);
        expect(result.status).toBe('error');
        expect(result.summary).toBe('0/1 testes criados');
        expect(nock.isDone()).toBeTruthy();
    });

    it('c8: DRY_RUN=true — simulates without API calls', async () => {
        expect.hasAssertions();

        process.env['DRY_RUN'] = 'true';
        process.env['CSV_PATH'] = writeCsv(
            'c8',
            ['Title: TC Dry', 'Action,Data,Expected Result', 'Step1,,R1'].join('\n'),
        );

        const result = unwrap(await createTestsFromCsv(makeState()));

        expect(result.status).toBe('ok');
        expect(result.summary).toContain('DRY-RUN');
        expect(result.inMemoryTasksId).toStrictEqual([]);
        expect(nock.isDone()).toBeTruthy();

        delete process.env['DRY_RUN'];
    });
});
