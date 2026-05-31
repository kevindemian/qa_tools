import nock from 'nock';
import JiraResource from '../jira_management/jira_resource';
import JiraLinkManager from '../jira_management/jira_link_manager';
import createTests from '../jira_management/create_tests';

const { createTestExecution } = createTests;

const JIRA = 'http://localhost:1998/jira';

beforeAll(() => {
    nock.disableNetConnect();

    const api = nock(JIRA + '/rest/api/2');

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
});

afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
});

describe('E2E: createTestExecution', () => {
    let jiraResource: JiraResource;
    let linkManager: JiraLinkManager;

    beforeAll(() => {
        jiraResource = new JiraResource('e2e-token', JIRA + '/rest/api/2');
        linkManager = new JiraLinkManager(jiraResource);
    });

    it('creates Test Execution with 2 test keys', async () => {
        const result = await createTestExecution({
            jiraResource,
            linkManager,
            projectName: 'EXECPROJ',
            testKeys: ['TEST-1', 'TEST-2'],
            csvName: 'meus-testes',
        });

        expect(result!.key).toBe('EXEC-2');
        expect(result!.summary).toMatch(/^meus-testes - /);
    });

    it('creates Test Execution with single key and default name', async () => {
        const result = await createTestExecution({
            jiraResource,
            linkManager,
            projectName: 'EXECPROJ',
            testKeys: ['TEST-3'],
            csvName: '',
        });

        expect(result!.key).toBe('EXEC-1');
        expect(result!.summary).toMatch(/^Automated Execution - /);
    });
});
