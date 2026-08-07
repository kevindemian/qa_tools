/** Xray Cloud Test Coverage link-type resolver.
 *
 *  Xray Cloud Test Coverage Analysis recognizes exactly one issue link type as
 *  the coverage relationship (requirement → test). That type is NOT a constant
 *  this project invents: it is declared by the Xray Cloud instance itself via
 *  its GraphQL `getIssueLinkTypes` query. This resolver discovers it at runtime
 *  (never a hardcoded id, §0) and matches it by id against the Jira REST link
 *  types so the Jira REST `issueLink` API can be used with the right type id.
 *
 *  Mode contract:
 *   - Server mode (`xrayMode === 'server'`): coverage resolution is disabled —
 *     returns null. Server flows keep their legacy link semantics unchanged.
 *   - Cloud mode (`xrayMode === 'cloud'`): coverage phrases resolve through the
 *     Xray Cloud GraphQL API. Any failure to resolve (missing credentials, API
 *     error, absent "Test" type, no Jira id match) THROWS explicitly (§25) —
 *     silently creating a coverage link with a non-coverage type/direction
 *     would recreate the empty-coverage defect (never a silent fallback, §3). */
import { XrayCloudClient } from '../../shared/jira/xray-cloud-client.js';
import Config from '../../shared/config-accessor.js';
import type { LinkType } from '../link-types.js';

/** Minimal resolver contract — injectable so the service stays hermetic. */
export interface CoverageLinkTypeResolver {
    isCloudMode(): boolean;
    resolveCoverageLinkType(): Promise<LinkType | null>;
}

/** Xray Cloud GraphQL query: the instance's own link-type catalogue. The
 *  coverage relationship type is identified by the documented Xray Cloud
 *  naming ("Test"). The instance's `IssueLinkType` exposes only `id` and
 *  `name` (verified against the real GraphQL schema via introspection); the
 *  direction phrases come from the Jira REST link-type definition matched by
 *  id. */
export const COVERAGE_LINK_TYPE_QUERY = `
    query GetIssueLinkTypes {
        getIssueLinkTypes {
            id
            name
        }
    }
`;

export class XrayCloudCoverageLinkTypeResolver implements CoverageLinkTypeResolver {
    private cached: LinkType | null | undefined;

    constructor(
        private readonly linkTypeManager: { getIssueLinkTypes(): Promise<LinkType[]> },
        private readonly client?: {
            graphql(
                query: string,
                variables: Record<string, unknown>,
                clientId: string,
                clientSecret: string,
            ): Promise<Record<string, unknown> | null>;
        },
        private readonly cfg?: { get(key: string): unknown },
    ) {}

    /** Whether the resolver is in Xray Cloud mode. An unavailable Config is
     *  treated as non-cloud (server default) — never a network attempt (§25:
     *  the explicit failure surface is the coverage resolution itself, which
     *  only runs when cloud mode is confirmed). */
    isCloudMode(): boolean {
        const cfg = this.cfg ?? Config.getDefault();
        if (!cfg || typeof cfg.get !== 'function') return false;
        return cfg.get('xrayMode') === 'cloud';
    }

    /** Resolve the Xray Cloud coverage link type (Jira REST definition matched
     *  by id). Returns null in server mode; throws explicitly on any failure in
     *  cloud mode (§25) — never a silent fallback. The successful result is
     *  cached; failures are NOT cached (a later transient may succeed). The
     *  Xray client is constructed lazily — only when cloud-mode coverage
     *  resolution actually runs, never at service construction. */
    async resolveCoverageLinkType(): Promise<LinkType | null> {
        if (!this.isCloudMode()) return null;
        if (this.cached !== undefined) return this.cached;

        const cfg = this.cfg ?? Config.getDefault();
        const clientId = cfg?.get('xrayClientId');
        const clientSecret = cfg?.get('xrayClientSecret');
        if (!clientId || !clientSecret) {
            throw new Error(
                'Xray Cloud: XRAY_CLIENT_ID/XRAY_CLIENT_SECRET ausentes — não é possível resolver o tipo de link de cobertura.',
            );
        }

        const client = this.client ?? new XrayCloudClient();
        const data = await client.graphql(COVERAGE_LINK_TYPE_QUERY, {}, String(clientId), String(clientSecret));
        if (!data) {
            throw new Error(
                'Xray Cloud: getIssueLinkTypes não retornou dados — tipo de link de cobertura não resolvido.',
            );
        }

        const raw = data['getIssueLinkTypes'];
        const results = Array.isArray(raw) ? raw : [];
        const coverage = (results as Array<{ id?: unknown; name?: unknown }>).find(
            (t) => typeof t?.name === 'string' && t.name.toLowerCase() === 'test',
        );
        if (!coverage) {
            const names = (results as Array<{ name?: unknown }>).map((t) => String(t?.name ?? '?')).join(', ');
            throw new Error(
                'Xray Cloud: nenhum link type de cobertura "Test" em getIssueLinkTypes (disponíveis: ' +
                    (names || 'nenhum') +
                    ').',
            );
        }

        const coverageId = String(coverage.id);
        const jiraTypes = await this.linkTypeManager.getIssueLinkTypes();
        const match = jiraTypes.find((t) => t.id === coverageId);
        if (!match) {
            throw new Error(
                'Xray Cloud: link type de cobertura id=' +
                    coverageId +
                    ' não encontrado entre os link types do Jira REST.',
            );
        }
        this.cached = match;
        return match;
    }
}
