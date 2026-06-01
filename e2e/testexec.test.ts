import nock from 'nock';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import TestExecutionCreator from '../jira_management/test-execution-creator';
import { nonNull } from '../shared/test-utils';
import createTests from '../jira_management/create_tests';

const { createTestExecution } = createTests;

const JIRA = 'http://localhost:1998/jira';

let testExecutionCreator: TestExecutionCreator;
let jiraResource: JiraResource;

beforeAll(() => {
    nock.cleanAll();
    nock.disableNetConnect();

    const api = nock(JIRA + '/rest/api/2');

    // findExistingTe → GET /search (called before /issuetype)
    api.get('/search').query(true).times(2).reply(200, { issues: [], total: 0 });

    api.get('/issuetype')
        .times(2)
        .reply(200, [
            { id: '11200', name: 'Epic' },
            { id: '11800', name: 'Test' },
            { id: '11802', name: 'Test Execution' },
        ]);

    api.get('/field')
        .times(2)
        .reply(200, [
            {
                id: 'customfield_13715',
                name: 'Tests association with a Test Execution',
                schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' },
            },
        ]);

    api.post('/issue')
        .times(2)
        .reply(201, (_, body) => {
            const b = body as Record<string, unknown>;
            const keys = ((b.fields as Record<string, unknown>)?.customfield_13715 as string[]) || [];
            return { key: 'EXEC-' + keys.length, id: '20001' };
        });

    jiraResource = new JiraResource('e2e-token', JIRA + '/rest/api/2');
    const linkManager = new JiraLinkManager(jiraResource);
    testExecutionCreator = new TestExecutionCreator(jiraResource, linkManager);
});

afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
});

describe('E2E: createTestExecution', () => {
    it('creates Test Execution with 2 test keys', async () => {
        const result = await createTestExecution({
            testExecutionCreator,
            projectName: 'EXECPROJ',
            testKeys: ['TEST-1', 'TEST-2'],
            csvName: 'meus-testes',
        });

        expect(nonNull(result).key).toBe('EXEC-2');
        expect(nonNull(result).summary).toMatch(/^meus-testes - /);
    });

    it('creates Test Execution with single key and default name', async () => {
        const result = await createTestExecution({
            testExecutionCreator,
            projectName: 'EXECPROJ',
            testKeys: ['TEST-3'],
            csvName: '',
        });

        expect(nonNull(result).key).toBe('EXEC-1');
        expect(nonNull(result).summary).toMatch(/^Automated Execution - /);
    });
});
