import { expect, vi } from 'vitest';
import { IssueLinkService } from '../issue-link.service.js';
import type { LinkTypeManager, LinkType } from '../../link-types.js';
import type { CoverageLinkTypeResolver } from '../coverage-link-type-resolver.js';
import type { JiraResourceLike } from '../../../shared/types/jira.js';
import { rootLogger } from '../../../shared/logger.js';

const TEST_TYPE_10042: LinkType = { id: '10042', name: 'Test', inward: 'is tested by', outward: 'is a test for' };
const TESTS_TYPE_10007: LinkType = { id: '10007', name: 'Tests', inward: 'is tested by', outward: 'tests' };
const RELATES_TYPE_11701: LinkType = { id: '11701', name: 'Relates', inward: 'relates to', outward: 'relates to' };

function makeLinkTypeManager(): LinkTypeManager {
    return {
        resolveLinkTypeId: vi.fn().mockResolvedValue('10007'),
        getIssueLinkTypes: vi.fn().mockResolvedValue([TEST_TYPE_10042, TESTS_TYPE_10007, RELATES_TYPE_11701]),
        getLinkTypeByName: vi.fn().mockImplementation(async (name: string) => {
            const lower = String(name ?? '')
                .trim()
                .toLowerCase();
            if (lower === 'is a test for' || lower === 'is tested by' || lower === 'test') return TEST_TYPE_10042;
            if (lower === 'tests' || lower === 'tested by') return TESTS_TYPE_10007;
            if (lower === 'relates' || lower === 'relates to') return RELATES_TYPE_11701;
            return null;
        }),
    } as unknown as LinkTypeManager;
}

function makeServerResolver(): CoverageLinkTypeResolver {
    return { isCloudMode: () => false, resolveCoverageLinkType: vi.fn(async () => null) };
}

function makeCloudResolver(): CoverageLinkTypeResolver {
    return {
        isCloudMode: () => true,
        resolveCoverageLinkType: vi.fn(async () => TESTS_TYPE_10007),
    };
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

function setupLinks(
    emptyLinks = true,
    coverageResolver: CoverageLinkTypeResolver = makeServerResolver(),
): { service: IssueLinkService; jira: JiraResourceLike; ltm: LinkTypeManager } {
    const ltm = makeLinkTypeManager();
    const jira = makeJiraResource({
        getJiraResource: vi.fn().mockResolvedValue({ fields: { issuelinks: emptyLinks ? [] : undefined } }),
    });
    return { service: new IssueLinkService(jira, ltm, coverageResolver), jira, ltm };
}

describe('IssueLinkService', () => {
    describe('linkTestsToRequirement — Test Coverage direction (Xray Cloud: requirement OUTWARD)', () => {
        it('cloud: emite payload outward=requirement, inward=test, tipo de cobertura (10007)', async () => {
            expect.hasAssertions();
            const { service, jira, ltm } = setupLinks(true, makeCloudResolver());

            const result = await service.linkTestsToRequirement('US-1', ['TEST-1']);

            expect(result).toEqual({ created: 1, skipped: 0, failed: [], missing: [] });
            expect(ltm.getLinkTypeByName).toHaveBeenCalledWith('Tests');
            expect(jira.postJiraResource).toHaveBeenCalledWith('issueLink', {
                type: { id: '10007' },
                inwardIssue: { key: 'TEST-1' },
                outwardIssue: { key: 'US-1' },
            });
        });

        it('cloud: nunca inverte — outward é a requirement, inward é o teste', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks(true, makeCloudResolver());

            await service.linkTestsToRequirement('ECSPOL-731', ['ECSPOL-900', 'ECSPOL-901']);

            const payload = vi.mocked(jira.postJiraResource).mock.calls[0]?.[1] as {
                inwardIssue: { key: string };
                outwardIssue: { key: string };
            };
            expect(payload.inwardIssue.key).toBe('ECSPOL-900');
            expect(payload.outwardIssue.key).toBe('ECSPOL-731');
            const payload2 = vi.mocked(jira.postJiraResource).mock.calls[1]?.[1] as {
                inwardIssue: { key: string };
                outwardIssue: { key: string };
            };
            expect(payload2.inwardIssue.key).toBe('ECSPOL-901');
            expect(payload2.outwardIssue.key).toBe('ECSPOL-731');
        });

        it('server: preserva direção legada (inward=requirement, outward=test)', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks(true, makeServerResolver());

            await service.linkTestsToRequirement('US-1', ['TEST-1']);

            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({
                    inwardIssue: { key: 'US-1' },
                    outwardIssue: { key: 'TEST-1' },
                }),
            );
        });

        it('cloud sem resolução de cobertura → throw explícito, nenhum link postado', async () => {
            expect.hasAssertions();
            const failing = makeCloudResolver();
            vi.mocked(failing.resolveCoverageLinkType).mockRejectedValue(
                new Error('XRAY_CLIENT_ID/XRAY_CLIENT_SECRET ausentes'),
            );
            const { service, jira } = setupLinks(true, failing);

            await expect(service.linkTestsToRequirement('US-1', ['TEST-1'])).rejects.toThrow(/XRAY_CLIENT_ID/);
            expect(jira.postJiraResource).not.toHaveBeenCalled();
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

        it('Jira Cloud: link com apenas outwardIssue → a própria issue é o inward (direção completa reconstruída)', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockResolvedValue({
                fields: {
                    issuelinks: [
                        {
                            id: '3351217',
                            type: { name: 'Test' },
                            outwardIssue: { key: 'ECSPOL-1906' },
                        },
                    ],
                },
            });

            const links = await service.getIssueLinks('ECSPOL-1640');

            expect(links).toEqual([
                { id: '3351217', linkType: 'Test', inwardKey: 'ECSPOL-1640', outwardKey: 'ECSPOL-1906' },
            ]);
        });

        it('Jira Cloud: link com apenas inwardIssue → a própria issue é o outward', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockResolvedValue({
                fields: {
                    issuelinks: [
                        {
                            id: '3351217',
                            type: { name: 'Test' },
                            inwardIssue: { key: 'ECSPOL-1640' },
                        },
                    ],
                },
            });

            const links = await service.getIssueLinks('ECSPOL-1906');

            expect(links).toEqual([
                { id: '3351217', linkType: 'Test', inwardKey: 'ECSPOL-1640', outwardKey: 'ECSPOL-1906' },
            ]);
        });

        it('falha ao listar → warn explícito + lista vazia (nunca silencioso de forma ambígua)', async () => {
            expect.hasAssertions();
            const { service, jira } = setupLinks();
            vi.mocked(jira.getJiraResource).mockRejectedValue(new Error('network down'));

            const links = await service.getIssueLinks('TEST-1');

            expect(links).toEqual([]);
        });
    });

    describe('linkSourceToTargets — cobertura Xray Cloud (tipo dinâmico + requirement outward)', () => {
        function makeRealInstance(cloud: boolean) {
            const ltm = makeLinkTypeManager();
            const jira = makeJiraResource({
                getJiraResource: vi.fn().mockResolvedValue({ fields: { issuelinks: [] } }),
            });
            return {
                service: new IssueLinkService(jira, ltm, cloud ? makeCloudResolver() : makeServerResolver()),
                jira,
                ltm,
            };
        }

        it('cloud: CSV "is a test for" → tipo de cobertura 10007, outward=requirement, inward=test', async () => {
            expect.hasAssertions();
            const { service, jira } = makeRealInstance(true);

            const result = await service.linkSourceToTargets('ECSPOL-1847', [
                { key: 'ECSPOL-1498', linkType: 'is a test for' },
            ]);

            expect(result).toEqual({ created: 1, skipped: 0, failed: [], missing: [] });
            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({
                    type: { id: '10007' },
                    inwardIssue: { key: 'ECSPOL-1847' },
                    outwardIssue: { key: 'ECSPOL-1498' },
                }),
            );
        });

        it('cloud: "is tested by" (inward do tipo Test) → tipo de cobertura 10007, outward=requirement', async () => {
            expect.hasAssertions();
            const { service, jira } = makeRealInstance(true);

            await service.linkSourceToTargets('ECSPOL-1847', [{ key: 'ECSPOL-1498', linkType: 'is tested by' }]);

            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({
                    type: { id: '10007' },
                    inwardIssue: { key: 'ECSPOL-1847' },
                    outwardIssue: { key: 'ECSPOL-1498' },
                }),
            );
        });

        it('server: "is a test for" → tipo Test (10042), outward=source (legado preservado)', async () => {
            expect.hasAssertions();
            const { service, jira } = makeRealInstance(false);

            await service.linkSourceToTargets('ECSPOL-1847', [{ key: 'ECSPOL-1498', linkType: 'is a test for' }]);

            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({
                    type: { id: '10042' },
                    inwardIssue: { key: 'ECSPOL-1498' },
                    outwardIssue: { key: 'ECSPOL-1847' },
                }),
            );
        });

        it('cloud: falha ao resolver tipo de cobertura → link reportado como failed (nunca cria cego)', async () => {
            expect.hasAssertions();
            const ltm = makeLinkTypeManager();
            const failing = makeCloudResolver();
            vi.mocked(failing.resolveCoverageLinkType).mockRejectedValue(new Error('Xray Cloud indisponível'));
            const jira = makeJiraResource({
                getJiraResource: vi.fn().mockResolvedValue({ fields: { issuelinks: [] } }),
            });
            const service = new IssueLinkService(jira, ltm, failing);

            const result = await service.linkSourceToTargets('ECSPOL-1847', [
                { key: 'ECSPOL-1498', linkType: 'is a test for' },
            ]);

            expect(result.created).toBe(0);
            expect(result.failed).toEqual(['ECSPOL-1498']);
            expect(jira.postJiraResource).not.toHaveBeenCalled();
        });

        it('linkType não relacionado a test (ex: Relates) → resolve normalmente, sem flip', async () => {
            expect.hasAssertions();
            const { service, jira } = makeRealInstance(true);

            await service.linkSourceToTargets('ECSPOL-1847', [{ key: 'ECSPOL-1498', linkType: 'Relates' }]);

            expect(jira.postJiraResource).toHaveBeenCalledWith(
                'issueLink',
                expect.objectContaining({ type: { id: '11701' } }),
            );
        });
    });

    describe('resolveDirection — validação de orientação por instância (§4.3)', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('orientação consistente (inward=is tested by, outward=is a test for) → link criado SEM warn', async () => {
            expect.hasAssertions();
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            const { service, ltm } = setupLinks();
            vi.mocked(ltm.getLinkTypeByName).mockResolvedValue({
                id: '10042',
                name: 'Test',
                inward: 'is tested by',
                outward: 'is a test for',
            });

            const outcome = await service.createLink({
                linkType: 'Test',
                inwardKey: 'US-1',
                outwardKey: 'TEST-1',
            });

            expect(outcome).toBe('created');
            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('orientação divergente') as string);
        });

        it('orientação INVERTIDA (inward=is a test for, outward=is tested by) → warn explícito mas link criado', async () => {
            expect.hasAssertions();
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            const { service, ltm, jira } = setupLinks();
            vi.mocked(ltm.getLinkTypeByName).mockResolvedValue({
                id: '10042',
                name: 'Test',
                inward: 'is a test for',
                outward: 'is tested by',
            });

            const outcome = await service.createLink({
                linkType: 'Test',
                inwardKey: 'US-1',
                outwardKey: 'TEST-1',
            });

            expect(outcome).toBe('created');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orientação divergente') as string);
            expect(jira.postJiraResource).toHaveBeenCalled();
        });

        it('frases AUSENTES (instância não expõe inward/outward) → warn explícito (não confirma contrato)', async () => {
            expect.hasAssertions();
            const warnSpy = vi.spyOn(rootLogger, 'warn').mockImplementation(() => undefined);
            const { service, ltm } = setupLinks();
            vi.mocked(ltm.getLinkTypeByName).mockResolvedValue({ id: '10042', name: 'Test' });

            await service.createLink({ linkType: 'Test', inwardKey: 'US-1', outwardKey: 'TEST-1' });

            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orientação divergente') as string);
        });

        it('link type não encontrado na instância → throw explícito (nunca cria cego)', async () => {
            expect.hasAssertions();
            const { service, ltm, jira } = setupLinks();
            vi.mocked(ltm.getLinkTypeByName).mockResolvedValue(null);

            await expect(
                service.createLink({ linkType: 'NOPE', inwardKey: 'US-1', outwardKey: 'TEST-1' }),
            ).rejects.toThrow(/não encontrado/);
            expect(jira.postJiraResource).not.toHaveBeenCalled();
        });
    });
});
