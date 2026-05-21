const nock = require('nock');
const JiraResource = require('../jira_management/jira_resource');
const { createTestExecution } = require('../jira_management/create_tests');

const JIRA = 'http://localhost:1998/jira';

beforeAll(() => {
    nock.disableNetConnect();

    const api = nock(JIRA + '/rest/api/2');

    api.get('/issuetype').times(2).reply(200, [
        { id: '11200', name: 'Epic' },
        { id: '11800', name: 'Test' },
        { id: '11802', name: 'Test Execution' },
    ]);

    api.get('/field').times(2).reply(200, [
        { id: 'customfield_13715', name: 'Tests association with a Test Execution', schema: { custom: 'com.xpandit.plugins.xray:testexec-tests-custom-field' } },
    ]);

    api.post('/issue').times(2).reply(201, (_, body) => {
        const keys = body.fields?.customfield_13715 || [];
        return { key: 'EXEC-' + keys.length, id: '20001' };
    });
});

afterAll(() => {
    nock.cleanAll();
    nock.enableNetConnect();
});

describe('E2E: createTestExecution', () => {
    let jiraResource;

    beforeAll(() => {
        jiraResource = new JiraResource('e2e-token', JIRA + '/rest/api/2');
    });

    it('creates Test Execution with 2 test keys', async () => {
        const result = await createTestExecution(jiraResource, 'EXECPROJ', ['TEST-1', 'TEST-2'], 'meus-testes');

        expect(result.key).toBe('EXEC-2');
        expect(result.summary).toMatch(/^meus-testes - /);
    });

    it('creates Test Execution with single key and default name', async () => {
        const result = await createTestExecution(jiraResource, 'EXECPROJ', ['TEST-3'], '');

        expect(result.key).toBe('EXEC-1');
        expect(result.summary).toMatch(/^Automated Execution - /);
    });
});
