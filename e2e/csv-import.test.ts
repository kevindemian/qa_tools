jest.mock('../shared/open', () => ({ openWithOsOrFallback: jest.fn() }));

import fs from 'fs';
import path from 'path';
import os from 'os';
import nock from 'nock';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import CsvResource from '../jira_management/csv_resource';
import createTests from '../jira_management/create_tests';
import { rootLogger } from '../shared/logger';
import { setupHandlers, resetHandlers } from './handlers';

const { createTestsFromCsv } = createTests;

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-e2e-'));

describe('E2E: CSV Import', () => {
    beforeAll(() => {
        nock.cleanAll();
        process.env.HOME = tmpHome;
        process.env.JIRA_BASE_URL = 'http://localhost:9999/jira';
        process.env.JIRA_PERSONAL_TOKEN = 'e2e-token';
        process.env.XRAY_BASE_URL = 'http://localhost:9999/xray';
        process.env.CSV_PATH = path.join(__dirname, 'fixtures', 'testes-simples.csv');
        process.env.CSV_LABELS = 'e2e,automated';
        process.env.AUTO_CONFIRM = 'true';
        process.env.ON_ERROR = 'skip';
        process.env.QUIET = 'true';
        setupHandlers();
    });

    afterAll(() => {
        resetHandlers();
        nock.restore();
        if (fs.existsSync(tmpHome)) {
            fs.rmSync(tmpHome, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('cria 2 issues, preconditions, steps, linked issue, e cross-ref', async () => {
        const jiraResource = new JiraResource('e2e-token', 'http://localhost:9999/jira/rest/api/2');
        const jiraResourceXray = new JiraResource('e2e-token', 'http://localhost:9999/xray');
        const linkManager = new JiraLinkManager(jiraResource);
        const linkManagerXray = new JiraLinkManager(jiraResourceXray);
        const csvResource = new CsvResource();
        const onBusy = jest.fn();

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

        const result = (await createTestsFromCsv(state))!;
        expect(result.inMemoryTasksId).toEqual(['TEST-1', 'TEST-2']);
        expect(result.inMemoryTasksText).toEqual(['TC01 - Login valido', 'TC02 - Login invalido']);
        expect(result.status).toBe('ok');
        expect(result.summary).toMatch(/2\/2/);

        expect(onBusy).toHaveBeenCalledWith(true);
        expect(onBusy).toHaveBeenCalledWith(false);

        expect(nock.isDone()).toBe(true);
    });
});
