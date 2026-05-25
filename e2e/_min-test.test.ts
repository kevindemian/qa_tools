jest.mock('../shared/prompt', () => {
    const actual = jest.requireActual('../shared/prompt');
    const askMock = jest
        .fn()
        .mockResolvedValueOnce('v2.0.0') // Nome da versão
        .mockResolvedValueOnce(''); // ID da sprint (empty → skip)
    const askConfirmMock = jest
        .fn()
        .mockResolvedValueOnce(true) // Usar tarefas criadas anteriormente
        .mockResolvedValueOnce(true) // Confirmar atribuicao de fixVersion
        .mockResolvedValueOnce(false); // Adicionar tarefas a uma sprint (no)
    return {
        ...actual,
        prompt: jest.fn().mockReturnValue(''),
        confirm: jest.fn().mockReturnValue(true),
        smartPrompt: jest.fn().mockResolvedValue('v2.0.0'),
        ask: askMock,
        askConfirm: askConfirmMock,
    };
});
jest.mock('../shared/state', () => ({ load: jest.fn().mockReturnValue({}), update: jest.fn() }));

import nock from 'nock';
import { SessionContext } from '../shared/session-context';

describe('case04', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.restoreAllMocks();
        nock.cleanAll();
        nock.disableNetConnect();
    });
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('happy path', async () => {
        const JiraResource = require('../jira_management/jira_resource');
        const API = 'http://localhost:1999/rest/api/2';
        const api = nock(API).defaultReplyHeaders({ 'Content-Type': 'application/json' });
        // updateFixVersions is called PER TASK in the handler's for loop
        // Each call does getVersionId → getProjectId + getProjectVersions
        api.get('/project/ECSPOL').times(2).reply(200, { id: '123' });
        api.get('/project/123/versions')
            .times(2)
            .reply(200, [{ name: 'v2.0.0', id: '99' }]);
        api.put('/issue/IMT-1').reply(204);
        api.put('/issue/IMT-2').reply(204);
        jest.spyOn(console, 'log').mockImplementation(() => {});

        const jira = new JiraResource('e2e', API);
        const ctx = new SessionContext();
        ctx.project_name = 'ECSPOL';
        ctx.inMemoryTasksId = ['IMT-1', 'IMT-2'];
        const c = {
            jiraResource: jira,
            jiraResourceXray: jira,
            linkManager: {},
            linkManagerXray: {},
            csvResource: {},
            ctx,
            pushHistory: jest.fn(),
            printSessionSummary: jest.fn(),
            base_url: 'http://localhost:1999',
            sessionLog: { child: () => ({ info: jest.fn(), error: jest.fn() }) },
        };

        const mod = require('../jira_management/commands/case04');
        await mod.handler(c);
        expect(c.pushHistory).toHaveBeenCalled();
        expect(nock.isDone()).toBe(true);
    }, 15000);
});
