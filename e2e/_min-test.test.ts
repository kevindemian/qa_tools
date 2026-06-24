vi.mock('../shared/prompt', async () => {
    const actual = await vi.importActual('../shared/prompt');
    const askMock = vi
        .fn()
        .mockResolvedValueOnce('v2.0.0') // Nome da versão
        .mockResolvedValueOnce(''); // ID da sprint (empty → skip)
    const askConfirmMock = vi
        .fn()
        .mockResolvedValueOnce(true) // Usar tarefas criadas anteriormente
        .mockResolvedValueOnce(true) // Confirmar atribuicao de fixVersion
        .mockResolvedValueOnce(false); // Adicionar tarefas a uma sprint (no)
    return {
        ...actual,
        prompt: vi.fn().mockReturnValue(''),
        confirm: vi.fn().mockReturnValue(true),
        smartPrompt: vi.fn().mockResolvedValue('v2.0.0'),
        ask: askMock,
        askConfirm: askConfirmMock,
    };
});
vi.mock('../shared/state', () => ({ load: vi.fn().mockReturnValue({}), update: vi.fn() }));

import nock from 'nock';
import { SessionContext } from '../shared/session-context.js';
import type { CommandContext } from '../jira_management/commands/context.js';
import { createMockLinkManager } from '../shared/test-utils/factories/link-manager-factory.js';
import CsvResource from '../jira_management/csv_resource.js';
import { createMockLogger } from '../shared/test-utils.js';

describe('Case04', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        nock.cleanAll();
        nock.disableNetConnect();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
        nock.restore();
    });

    it('happy path', async () => {expect.hasAssertions();

        const { default: JiraResource } = await vi.importActual<typeof import('../jira_management/jira_resource.js')>(
            '../jira_management/jira_resource',
        );
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
        vi.spyOn(console, 'log').mockImplementation(() => {});

        const jira = new JiraResource('e2e', API);
        const ctx = new SessionContext();
        ctx.project_name = 'ECSPOL';
        ctx.inMemoryTasksId = ['IMT-1', 'IMT-2'];
        const c: CommandContext = {
            jiraResource: jira,
            jiraResourceXray: jira,
            linkManager: createMockLinkManager(),
            linkManagerXray: createMockLinkManager(),
            csvResource: new CsvResource(),
            ctx,
            pushHistory: vi.fn(),
            printSessionSummary: vi.fn(),
            base_url: 'http://localhost:1999',
            sessionLog: createMockLogger(),
        };

        const mod = (
            await vi.importActual<typeof import('../jira_management/commands/case04.js')>(
                '../jira_management/commands/case04',
            )
        ).default;
        await mod.handler(c);

        expect(c.pushHistory).toHaveBeenCalled();
        expect(nock.isDone()).toBeTruthy();
    }, 15000);
});
