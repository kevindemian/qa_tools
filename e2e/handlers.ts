import nock from 'nock';

let issueCount = 0;

export function setupHandlers(): void {
    nock.disableNetConnect();
    issueCount = 0;

    const jira = nock('http://localhost:9999/jira/rest/api/2');

    jira.get('/search').query(true).times(2).reply(200, { issues: [] });

    jira.post('/issue')
        .times(2)
        .reply(201, () => {
            issueCount++;
            return { key: `TEST-${issueCount}`, id: `${10000 + issueCount}` };
        });

    jira.get('/issueLinkType').reply(200, {
        issueLinkTypes: [{ id: '10201', name: 'Tests', inward: 'is tested by', outward: 'tests' }],
    });

    jira.post('/issueLink').reply(201);

    jira.get('/field').reply(200, [
        {
            id: 'customfield_13708',
            name: 'Pre-Conditions association',
            schema: { custom: 'com.xpandit.plugins.xray:test-precondition-custom-field' },
        },
    ]);

    jira.get('/issue/TEST-1')
        .times(2)
        .reply(200, { key: 'TEST-1', fields: { description: '', customfield_13708: [] } });
    jira.get('/issue/TEST-2').reply(200, { key: 'TEST-2', fields: { description: '', customfield_13708: [] } });
    jira.put('/issue/TEST-1').times(2).reply(204);
    jira.put('/issue/TEST-2').reply(204);

    const xray = nock('http://localhost:9999/xray');

    xray.post('/test/TEST-1/steps').times(4).reply(201);
    xray.post('/test/TEST-2/steps').times(2).reply(201);
}

export function resetHandlers(): void {
    nock.cleanAll();
    nock.enableNetConnect();
    issueCount = 0;
}
