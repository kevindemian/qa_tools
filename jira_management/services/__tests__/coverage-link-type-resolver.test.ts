import { describe, it, expect, vi } from 'vitest';
import { XrayCloudCoverageLinkTypeResolver, COVERAGE_LINK_TYPE_QUERY } from '../coverage-link-type-resolver.js';
import type { LinkType } from '../../link-types.js';

const TESTS_TYPE_10007: LinkType = { id: '10007', name: 'Tests', inward: 'is tested by', outward: 'tests' };
const DEFECT_TYPE: LinkType = { id: '10008', name: 'Defect' };

function makeDeps(overrides?: { xrayMode?: string; clientId?: string; clientSecret?: string }) {
    const cfg = {
        get: vi.fn((key: string) => {
            if (key === 'xrayMode') return overrides?.xrayMode ?? 'server';
            if (key === 'xrayClientId') return overrides?.clientId ?? 'cid';
            if (key === 'xrayClientSecret') return overrides?.clientSecret ?? 'csecret';
            return undefined;
        }),
    };
    const linkTypeManager = {
        getIssueLinkTypes: vi.fn(async () => [TESTS_TYPE_10007, DEFECT_TYPE]),
    };
    const client = {
        graphql: vi.fn<
            (...args: [string, Record<string, unknown>, string, string]) => Promise<Record<string, unknown> | null>
        >(async () => ({
            getIssueLinkTypes: [
                { id: '10007', name: 'Test' },
                { id: '10008', name: 'Defect' },
            ],
        })),
    };
    return { cfg, linkTypeManager, client };
}

function makeResolver(deps: ReturnType<typeof makeDeps>): XrayCloudCoverageLinkTypeResolver {
    return new XrayCloudCoverageLinkTypeResolver(deps.linkTypeManager, deps.client, deps.cfg);
}

describe('XrayCloudCoverageLinkTypeResolver', () => {
    it('server mode → resolveCoverageLinkType retorna null e NÃO consulta o Xray Cloud', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'server' });
        const resolver = makeResolver(deps);

        const result = await resolver.resolveCoverageLinkType();

        expect(result).toBeNull();
        expect(deps.client.graphql).not.toHaveBeenCalled();
    });

    it('cloud mode → resolve o tipo de cobertura do Xray Cloud e casa por id contra o Jira REST', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud' });
        const resolver = makeResolver(deps);

        const result = await resolver.resolveCoverageLinkType();

        expect(result).toEqual(TESTS_TYPE_10007);
        expect(deps.client.graphql).toHaveBeenCalledWith(COVERAGE_LINK_TYPE_QUERY, {}, 'cid', 'csecret');
        expect(deps.linkTypeManager.getIssueLinkTypes).toHaveBeenCalled();
    });

    it('cloud mode → resultado é cacheado (segunda chamada não consulta o client)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud' });
        const resolver = makeResolver(deps);

        await resolver.resolveCoverageLinkType();
        await resolver.resolveCoverageLinkType();

        expect(deps.client.graphql).toHaveBeenCalledTimes(1);
    });

    it('cloud mode sem credenciais → throw explícito (XRAY_CLIENT_ID)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud', clientId: '', clientSecret: '' });
        const resolver = makeResolver(deps);

        await expect(resolver.resolveCoverageLinkType()).rejects.toThrow(/XRAY_CLIENT_ID/);
        expect(deps.client.graphql).not.toHaveBeenCalled();
    });

    it('cloud mode com resposta nula do client → throw explícito (nunca fallback silencioso)', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud' });
        deps.client.graphql.mockResolvedValueOnce(null);
        const resolver = makeResolver(deps);

        await expect(resolver.resolveCoverageLinkType()).rejects.toThrow(/não retornou dados/);
    });

    it('cloud mode sem tipo "Test" na resposta → throw explícito listando os disponíveis', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud' });
        deps.client.graphql.mockResolvedValueOnce({
            getIssueLinkTypes: [{ id: '10008', name: 'Defect' }],
        });
        const resolver = makeResolver(deps);

        await expect(resolver.resolveCoverageLinkType()).rejects.toThrow(/Defect/);
    });

    it('cloud mode com id de cobertura ausente no Jira REST → throw explícito', async () => {
        expect.hasAssertions();
        const deps = makeDeps({ xrayMode: 'cloud' });
        deps.linkTypeManager.getIssueLinkTypes.mockResolvedValueOnce([{ id: '99999', name: 'Other' }]);
        const resolver = makeResolver(deps);

        await expect(resolver.resolveCoverageLinkType()).rejects.toThrow(/não encontrado entre os link types/);
    });
});
