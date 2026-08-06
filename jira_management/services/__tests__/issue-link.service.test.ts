import { expect, vi } from 'vitest';
import { IssueLinkService } from '../issue-link.service.js';
import type { LinkTypeManager } from '../../link-types.js';
import type { JiraResourceLike } from '../../../shared/types/jira.js';

function makeLinkTypeManager(): LinkTypeManager {
    return {
        resolveLinkTypeId: vi.fn().mockResolvedValue('10600'),
        getIssueLinkTypes: vi.fn().mockResolvedValue([{ id: '10600', name: 'Tests' }]),
    } as unknown as LinkTypeManager;
}

function makeJiraResource(overrides?: Partial<JiraResourceLike>): JiraResourceLike {
    return {
        getJiraResource: vi.fn(),
        postJiraResource: vi.fn().mockResolvedValue(undefined),
        putJiraResource: vi.fn(),
        deleteJiraResource: vi.fn(),
        searchJiraIssues: vi.fn(),
        getTransitionsForIssue: vi.fn(),
        transitionIssue: vi.fn(),
        ...(overrides ?? {}),
    } as JiraResourceLike;
}

function setupLinks(emptyLinks = true): { service: IssueLinkService; jira: JiraResourceLike; ltm: LinkTypeManager } {
    const ltm = makeLinkTypeManager();
    const jira = makeJiraResource({
        getJiraResource: vi.fn().mockResolvedValue({ fields: { issuelinks: emptyLinks ? [] : undefined } }),
    });
    return { service: new IssueLinkService(jira, ltm), jira, ltm };
}

describe('IssueLinkService', () => {
    describe('linkTestsToRequirement — Test Coverage direction (RED repro §7.1)', () => {
        it('emite payload inward=requirement, outward=test (direção CORRETA)', async () => {
            expect.hasAssertions();
            const { service, jira, ltm } = setupLinks();

            const result = await service.linkTestsToRequirement('US-1', ['TEST-1']);

            expect(result).toEqual({ created: 1, skipped: 0, failed: [], missing: [] });
            expect(ltm.resolveLinkTypeId).toHaveBeenCalledWith('Tests');
            expect(jira.postJiraResource).toHaveBeenCalledWith('issueLink', {
                type: { id: '10600' },
                inwardIssue: { key: 'US-1' },
                outwardIssue: { key: 'TEST-1' },
            });
        });

        it('nunca inverte: inwardKey é a requirement, outwardKey é o teste', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();

            await service.linkTestsToRequirement('ECSPOL-731', ['ECSPOL-900', 'ECSPOL-901']);

            const payload = vi.mocked(jira.postJiraResource).mock.calls[0]?.[1] as {
                inwardIssue: { key: string };
                outwardIssue: { key: string };
            };
            expect(payload.inwardIssue.key).toBe('ECSPOL-731');
            expect(payload.outwardIssue.key).toBe('ECSPOL-900');
            const payload2 = vi.mocked(jira.postJiraResource).mock.calls[1]?.[1] as {
                inwardIssue: { key: string };
                outwardIssue: { key: string };
            };
            expect(payload2.inwardIssue.key).toBe('ECSPOL-731');
            expect(payload2.outwardIssue.key).toBe('ECSPOL-901');
        });
    });

    describe('linkTestToTestExecution — direction', () => {
        it('emite payload inward=te, outward=test', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();

            await service.linkTestToTestExecution('TE-1', ['TEST-1']);

            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({
                    inwardIssue: { key: 'TE-1' },
                    outwardIssue: { key: 'TEST-1' },
                }),
            );
        });
    });

    describe('createLink — idempotency', () => {
        it('duplicado detectado na pré-checagem → retorna duplicate e NÃO posta', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockResolvedValue({
                fields: {
                    issuelinks: [
                        {
                            id: '1000',
                            type: { name: 'Tests' },
                            inwardIssue: { key: 'US-1' },
                            outwardIssue: { key: 'TEST-1' },
                        },
                    ],
                },
            });

            const outcome = await service.createLink({
                linkType: 'Tests',
                inwardKey: 'US-1',
                outwardKey: 'TEST-1',
            });

            expect(outcome).toBe('duplicate');
            expect(jira.postJiraResource).not.toHaveBeenCalled();
        });

        it('duplicado detectado na resposta do Jira (404-message) → retorna duplicate', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.postJiraResource).mockRejectedValue(
                new Error('An issue of type Tests already exists for the current issue'),
            );

            const outcome = await service.createLink({
                linkType: 'Tests',
                inwardKey: 'US-1',
                outwardKey: 'TEST-1',
            });

            expect(outcome).toBe('duplicate');
        });
    });

    describe('createLink — missing-key', () => {
        it('404 na criação → retorna missing-key (nunca silencia)', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.postJiraResource).mockRejectedValue(
                new Error('404 - issue TEST-NOPE not found (the issue does not exist)'),
            );

            const outcome = await service.createLink({
                linkType: 'Tests',
                inwardKey: 'US-1',
                outwardKey: 'TEST-NOPE',
            });

            expect(outcome).toBe('missing-key');
        });

        it('inwardKey vazia → missing-key com warn explícito, sem postar', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();

            const outcome = await service.createLink({ linkType: 'Tests', inwardKey: '  ', outwardKey: 'TEST-1' });

            expect(outcome).toBe('missing-key');
            expect(jira.postJiraResource).not.toHaveBeenCalled();
        });
    });

    describe('safeguards §24 — argumentos inválidos', () => {
        it('linkTestsToRequirement com lista vazia → throw explícito', async () => {
            expect.hasAssertions();
            const { service } = setupLinks();

            await expect(service.linkTestsToRequirement('US-1', [])).rejects.toThrow(/ao menos uma chave/);
        });

        it('linkTestsToRequirement com key não-string → throw explícito', async () => {
            expect.hasAssertions();
            const { service } = setupLinks();

            await expect(service.linkTestsToRequirement('US-1', [''])).rejects.toThrow(/chave inválida/);
        });

        it('createLink com linkType vazio → throw explícito', async () => {
            expect.hasAssertions();
            const { service } = setupLinks();

            await expect(
                service.createLink({ linkType: '  ', inwardKey: 'US-1', outwardKey: 'TEST-1' }),
            ).rejects.toThrow(/linkType/);
        });
    });

    describe('getIssueLinks — preserva direção', () => {
        it('mapeia inwardKey/outwardKey do payload Jira', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockResolvedValue({
                fields: {
                    issuelinks: [
                        {
                            id: '5000',
                            type: { name: 'Tests' },
                            inwardIssue: { key: 'US-1' },
                            outwardIssue: { key: 'TEST-1' },
                        },
                    ],
                },
            });

            const links = await service.getIssueLinks('TEST-1');

            expect(links).toEqual([{ id: '5000', linkType: 'Tests', inwardKey: 'US-1', outwardKey: 'TEST-1' }]);
            expect(jira.getJiraResource).toHaveBeenCalledWith('issue/TEST-1?fields=issuelinks');
        });

        it('falha ao listar → warn explícito + lista vazia (nunca silencioso de forma ambígua)', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockRejectedValue(new Error('network down'));

            const links = await service.getIssueLinks('TEST-1');

            expect(links).toEqual([]);
        });
    });
});
