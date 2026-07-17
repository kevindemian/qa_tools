vi.mock('../../shared/open', () => ({ openWithOsOrFallback: vi.fn() }));

import fs from 'fs';
import path from 'path';
import os from 'os';
import nock from 'nock';
import JiraResource from '../../jira_management/jira_resource.js';
import JiraLinkManager from '../../jira_management/jira_link_manager.js';
import CsvResource from '../../jira_management/csv_resource.js';
import createTests from '../../jira_management/create_tests.js';
import { rootLogger } from '../../shared/logger.js';
import { nonNull } from '../../shared/test-utils.js';
import { setupHandlers, resetHandlers } from '../handlers.js';
import { setTestSleep } from '../../shared/http-client.js';

const { createTestsFromCsv } = createTests;

const E2E_TOKEN = process.env['E2E_JIRA_TOKEN'] ?? (process.env['CI'] ? '' : 'e2e-token');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-'));

describe('E2E: CSV Import', () => {
    beforeAll(() => {
        nock.cleanAll();
        setTestSleep(() => Promise.resolve());
        // This test builds JiraResource without an explicit mode (defaults to
        // 'server'), so pin the config mode to match for a consistent flow.
        process.env['JIRA_MODE'] = 'server';
        process.env['HOME'] = tmpHome;
        process.env['JIRA_BASE_URL'] = 'http://localhost:9999/jira';
        process.env['JIRA_PERSONAL_TOKEN'] = E2E_TOKEN;
        process.env['XRAY_BASE_URL'] = 'http://localhost:9999/xray';
        process.env['CSV_PATH'] = path.join(import.meta.dirname, '..', 'fixtures', 'testes-simples.csv');
        process.env['CSV_LABELS'] = 'e2e,automated';
        process.env['AUTO_CONFIRM'] = 'true';
        process.env['ON_ERROR'] = 'skip';
        process.env['QUIET'] = 'true';
        setupHandlers();
    });

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        nock.cleanAll();
        nock.disableNetConnect();
        const jira = nock('http://localhost:9999/jira/rest/api/2');
        jira.persist().get('/search').query(true).reply(200, { issues: [] });
        let issueCount = 0;
        jira.post('/issue')
            .times(2)
            .reply(201, () => {
                issueCount++;
                return { key: 'TEST-' + issueCount, id: '' + (10000 + issueCount) };
            });
        jira.get('/field').reply(200, [
            {
                id: 'customfield_13708',
                name: 'Pre-Conditions association',
                schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' },
            },
        ]);
        jira.persist()
            .get('/issue/TEST-1')
            .reply(200, { key: 'TEST-1', fields: { description: '', customfield_13708: [] } });
        jira.persist().put('/issue/TEST-1').reply(200, {});
        jira.persist()
            .get('/issue/TEST-2')
            .reply(200, { key: 'TEST-2', fields: { description: '', customfield_13708: [] } });
        jira.persist().put('/issue/TEST-2').reply(200, {});
        jira.get('/issueLinkType').reply(200, {
            issueLinkTypes: [
                { id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' },
                { id: '10202', name: 'Pre-Condition', inward: 'is pre-condition of', outward: 'has pre-condition' },
            ],
        });
        jira.persist().post('/issueLink').reply(201, {});
        const xray = nock('http://localhost:9999/xray');
        xray.persist()
            .post(/\/test\/TEST-\d+\/steps/)
            .reply(201);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(() => {
        resetHandlers();
        nock.restore();
        if (fs.existsSync(path.resolve(tmpHome))) {
            fs.rmSync(tmpHome, { recursive: true, force: true });
        }
    });

    it('cria 2 issues, preconditions, steps, linked issue, e cross-ref', async () => {
        expect.hasAssertions();

        const jiraResource = new JiraResource(E2E_TOKEN, 'http://localhost:9999/jira/rest/api/2');
        const jiraResourceXray = new JiraResource(E2E_TOKEN, 'http://localhost:9999/xray');
        const linkManager = new JiraLinkManager(jiraResource);
        const linkManagerXray = new JiraLinkManager(jiraResourceXray);
        const csvResource = new CsvResource();
        const onBusy = vi.fn();

        const state = {
            jiraResource,
            jiraResourceXray,
            linkManager,
            linkManagerXray,
            csvResource,
            project_name: 'ECSPOL',
            base_url: 'http://localhost:9999/jira',
            sessionLog: rootLogger.child({ session: 'test' }),
            onBusy,
        };

        const outcome = nonNull(await createTestsFromCsv(state));
        const result = nonNull(outcome.ok ? outcome.result : null);

        expect(result.inMemoryTasksId).toStrictEqual(['TEST-1', 'TEST-2']);
        expect(result.inMemoryTasksText).toStrictEqual(['TC01 - Login valido', 'TC02 - Login invalido']);
        expect(result.status).toBe('ok');
        expect(result.summary).toMatch(/2\/2/);

        expect(onBusy).toHaveBeenCalledWith(true);
        expect(onBusy).toHaveBeenCalledWith(false);

        expect(nock.isDone()).toBeTruthy();
    });
});
