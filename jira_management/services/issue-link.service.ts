/** Issue Link Service — centralized issue link engine with explicit direction.
 *
 *  Single source of truth for Jira issue-link direction. Consumers never pick
 *  inward/outward: they call semantic operations and this service derives the
 *  direction from the link-type semantics.
 *
 *  Direction rule (Jira Cloud Xray Test Coverage): the *target* of a Test link
 *  is the INWARD issue ("is tested by"), the *source* (test) is the OUTWARD
 *  issue ("tests"). This is the opposite of the legacy `linkIssues()` payload
 *  (inward=source, outward=target) which produced inverted Test Coverage.
 *
 *  Every public method is guarded (§24): empty/invalid args are rejected with
 *  explicit warnings; duplicate links are skipped (idempotency); 404/missing
 *  keys are reported explicitly via `missing`, never silently swallowed (§25).
 *  Consumers can always distinguish `created` / `duplicate` / `missing-key`. */
import { formatErr } from '../../shared/errors.js';
import { rootLogger } from '../../shared/logger.js';
import type { JiraResourceLike } from '../../shared/types.js';
import type { LinkTypeManager } from '../link-types.js';

/** A single issue link with explicit direction. */
export interface IssueLink {
    id: string;
    linkType: string;
    inwardKey: string;
    outwardKey: string;
}

/** Raw input for the low-level primitive. */
export interface CreateLinkInput {
    linkType: string;
    inwardKey: string;
    outwardKey: string;
}

/** Outcome of a single `createLink` attempt — never ambiguous (§25). */
export type CreateLinkOutcome = 'created' | 'duplicate' | 'missing-key';

/** Expected orientation contract of a directional link type. */
export interface OrientationHint {
    /** Phrase the instance's INWARD side should carry (requirement side). */
    inward: string;
    /** Phrase the instance's OUTWARD side should carry (test side). */
    outward: string;
}

/** Known Xray link-type orientation contracts (Test Coverage). Link types not
 *  listed here (e.g. `Relates` — symmetric — and `Pre-Condition`, whose exact
 *  instance phrases are not part of the Test Coverage contract) skip the
 *  orientation validation. Only types with a documented directional contract
 *  are validated — never a speculative guess (§9). */
export const ORIENTATION_HINTS: Readonly<Record<string, OrientationHint>> = {
    Tests: { inward: 'is tested by', outward: 'tests' },
};

/** Normalize a phrase for comparison: lowercase, collapsed whitespace, trimmed. */
function normPhrase(s: string | undefined): string {
    return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether an instance phrase matches the expected phrase. Tolerates minor
 *  instance-local wording (one contains the other). An absent phrase NEVER
 *  matches — absence cannot confirm the contract (§25: explicit, not silent). */
export function orientationPhraseMatches(actual: string | undefined, expected: string): boolean {
    const a = normPhrase(actual);
    const e = normPhrase(expected);
    if (a === '' || e === '') return false;
    return a === e || a.includes(e) || e.includes(a);
}

/** Whether an instance link-type definition is consistent with the expected
 *  orientation contract. Absent/incomplete phrases are NOT consistent — the
 *  caller surfaces the discrepancy explicitly (§25). */
export function isOrientationConsistent(
    def: { inward?: string; outward?: string },
    expected: OrientationHint,
): boolean {
    return (
        orientationPhraseMatches(def.inward, expected.inward) && orientationPhraseMatches(def.outward, expected.outward)
    );
}

/** Result of a batch semantic operation. */
export interface LinkBatchResult {
    created: number;
    skipped: number;
    /** Keys that failed for a non-recoverable reason (network, auth, etc.). */
    failed: string[];
    /** Keys that do not exist in Jira (404 / not found) — data defect. */
    missing: string[];
}

interface IssueLinkEntry {
    id?: string;
    type?: { name?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
}

function isMissingKeyError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /(404|not found|does not exist|issue.*not.*found|could not find|no issue.*with key)/i.test(msg);
}

function isDuplicateLinkError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /(?:duplicate|already.*linked|link.*already.*exists|issue.*is.*already|already exists for the|already exists for this|already exists between|Link.*of.*type.*already.*exists|issue.*already.*linked)/i.test(
        msg,
    );
}

function assertValidKeys(keys: string[], label: string): void {
    if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error(`IssueLinkService: ${label} requer ao menos uma chave válida (lista vazia recebida).`);
    }
    for (const key of keys) {
        if (typeof key !== 'string' || !key.trim()) {
            throw new Error(`IssueLinkService: ${label} contém chave inválida (vazia ou não-string).`);
        }
    }
}

function assertValidLinkType(linkType: string): void {
    if (typeof linkType !== 'string' || !linkType.trim()) {
        throw new Error('IssueLinkService: linkType é obrigatório (string não-vazia).');
    }
}

export class IssueLinkService {
    private readonly jiraResource: JiraResourceLike;
    private readonly linkTypeManager: LinkTypeManager;

    constructor(jiraResource: JiraResourceLike, linkTypeManager: LinkTypeManager) {
        this.jiraResource = jiraResource;
        this.linkTypeManager = linkTypeManager;
    }

    // ─────────────────────────────────────────────────────────────
    // READING
    // ─────────────────────────────────────────────────────────────

    /** List all issue links of an issue, preserving direction. */
    async getIssueLinks(issueKey: string): Promise<IssueLink[]> {
        if (typeof issueKey !== 'string' || !issueKey.trim()) {
            rootLogger.warn('IssueLinkService.getIssueLinks: issueKey vazia recebida — retornando lista vazia.');
            return [];
        }
        let issue: { fields?: { issuelinks?: IssueLinkEntry[] } };
        try {
            issue = await this.jiraResource.getJiraResource<{ fields?: { issuelinks?: IssueLinkEntry[] } }>(
                'issue/' + issueKey + '?fields=issuelinks',
            );
        } catch (err) {
            rootLogger.warn(
                'IssueLinkService.getIssueLinks: falha ao listar links de ' +
                    issueKey +
                    ': ' +
                    formatErr(err) +
                    ' — retornando lista vazia.',
            );
            return [];
        }
        const raw = issue?.fields?.issuelinks ?? [];
        const links: IssueLink[] = [];
        for (const link of raw) {
            if (!link.id || !link.type?.name) continue;
            const inwardKey = link.inwardIssue?.key ?? '';
            const outwardKey = link.outwardIssue?.key ?? '';
            if (!inwardKey || !outwardKey) {
                rootLogger.warn(
                    'IssueLinkService.getIssueLinks: link ' +
                        link.id +
                        ' em ' +
                        issueKey +
                        ' sem inward/outward completo — ignorado.',
                );
                continue;
            }
            links.push({ id: link.id, linkType: link.type.name, inwardKey, outwardKey });
        }
        return links;
    }

    /** List issue links of an issue filtered by link type, preserving direction. */
    async getIssueLinksByType(issueKey: string, linkTypeName: string): Promise<IssueLink[]> {
        const all = await this.getIssueLinks(issueKey);
        return all.filter((l) => l.linkType === linkTypeName);
    }

    // ─────────────────────────────────────────────────────────────
    // REMOVAL
    // ─────────────────────────────────────────────────────────────

    /** Remove a single issue link by id. */
    async removeIssueLink(linkId: string): Promise<void> {
        if (typeof linkId !== 'string' || !linkId.trim()) {
            rootLogger.warn('IssueLinkService.removeIssueLink: linkId vazia recebida — nenhuma ação tomada.');
            return;
        }
        await this.jiraResource.deleteJiraResource('issueLink/' + linkId);
    }

    /** Remove all links of a given type from an issue. Returns the count removed. */
    async clearIssueLinksByType(issueKey: string, linkTypeName: string): Promise<number> {
        if (
            typeof issueKey !== 'string' ||
            !issueKey.trim() ||
            typeof linkTypeName !== 'string' ||
            !linkTypeName.trim()
        ) {
            rootLogger.warn(
                'IssueLinkService.clearIssueLinksByType: issueKey/linkType inválidos — nenhuma ação tomada.',
            );
            return 0;
        }
        let links: IssueLink[];
        try {
            links = await this.getIssueLinksByType(issueKey, linkTypeName);
        } catch (err) {
            rootLogger.warn(
                'IssueLinkService.clearIssueLinksByType: falha ao listar links de "' +
                    linkTypeName +
                    '" em ' +
                    issueKey +
                    ': ' +
                    formatErr(err) +
                    ' — retornando 0.',
            );
            return 0;
        }
        let removed = 0;
        for (const link of links) {
            try {
                await this.removeIssueLink(link.id);
                removed++;
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.clearIssueLinksByType: falha ao remover link ' +
                        link.id +
                        ' (' +
                        link.outwardKey +
                        ' → ' +
                        link.inwardKey +
                        '): ' +
                        formatErr(err),
                );
            }
        }
        return removed;
    }

    // ─────────────────────────────────────────────────────────────
    // PRIMITIVE
    // ─────────────────────────────────────────────────────────────

    /** Resolve a link type to its instance id and validate its orientation
     *  against the known Xray contract. Direction is ALWAYS provided by the
     *  caller (the semantic operation) — this method never picks it. It only
     *  surfaces a reversed/absent instance definition as an explicit warning
     *  (§25), so the operator can verify Test Coverage before relying on it.
     *  The link is still created (validation never blocks, §3/§9); the
     *  warning carries the cause and the corrective action. */
    private async resolveDirection(
        linkTypeName: string,
        inwardKey: string,
        outwardKey: string,
    ): Promise<{ linkTypeId: string; inwardKey: string; outwardKey: string }> {
        const def = await this.linkTypeManager.getLinkTypeByName(linkTypeName);
        if (!def) {
            const types = await this.linkTypeManager.getIssueLinkTypes();
            throw new Error(
                `Tipo de link '${linkTypeName}' não encontrado. Disponíveis: ${types.map((t) => t.name).join(', ')}`,
            );
        }
        const hint = ORIENTATION_HINTS[linkTypeName];
        if (hint && !isOrientationConsistent(def, hint)) {
            rootLogger.warn(
                'IssueLinkService: o link type "' +
                    linkTypeName +
                    '" desta instância está configurado com orientação divergente do contrato Xray Test Coverage ' +
                    '(inward="' +
                    (def.inward ?? '') +
                    '", outward="' +
                    (def.outward ?? '') +
                    '" vs esperado inward="' +
                    hint.inward +
                    '", outward="' +
                    hint.outward +
                    '"). ' +
                    'O link será criado com a direção da operação semântica (inward=' +
                    inwardKey +
                    ', outward=' +
                    outwardKey +
                    '), mas confira a configuração do tipo de link na instância se o Test Coverage não popular na issue esperada.',
            );
        }
        return { linkTypeId: def.id, inwardKey, outwardKey };
    }

    /** Create a single issue link with explicit direction.
     *  Idempotent: an identical existing link returns `duplicate`.
     *  A missing issue key (404 / not found) returns `missing-key`.
     *  Non-recoverable failures are rethrown — never swallowed (§25). */
    async createLink(input: CreateLinkInput): Promise<CreateLinkOutcome> {
        assertValidLinkType(input.linkType);
        const inward = input.inwardKey.trim();
        const outward = input.outwardKey.trim();
        if (!inward || !outward) {
            rootLogger.warn(
                'IssueLinkService.createLink: inwardKey/outwardKey são obrigatórios — link não criado (' +
                    input.linkType +
                    ').',
            );
            return 'missing-key';
        }
        if (inward === outward) {
            rootLogger.warn(
                'IssueLinkService.createLink: inwardKey e outwardKey são a mesma issue (' +
                    inward +
                    ') — link não criado.',
            );
            return 'missing-key';
        }

        const resolved = await this.resolveDirection(input.linkType, inward, outward);
        const payload = {
            type: { id: resolved.linkTypeId },
            inwardIssue: { key: resolved.inwardKey },
            outwardIssue: { key: resolved.outwardKey },
        };

        // Idempotency: skip when an identical link already exists on the outward issue.
        const existing = await this.getIssueLinks(outward);
        const duplicate = existing.some(
            (l) => l.linkType === input.linkType && l.inwardKey === inward && l.outwardKey === outward,
        );
        if (duplicate) {
            rootLogger.warn(
                'IssueLinkService.createLink: link "' +
                    input.linkType +
                    '" (' +
                    inward +
                    ' ← ' +
                    outward +
                    ') já existe — pulando (idempotência).',
            );
            return 'duplicate';
        }

        try {
            await this.jiraResource.postJiraResource('issueLink', payload);
            return 'created';
        } catch (err) {
            if (isDuplicateLinkError(err)) {
                rootLogger.warn(
                    'IssueLinkService.createLink: link duplicado detectado pelo Jira ("' +
                        input.linkType +
                        '", ' +
                        inward +
                        ' ← ' +
                        outward +
                        ') — tratado como idempotência.',
                );
                return 'duplicate';
            }
            if (isMissingKeyError(err)) {
                rootLogger.warn(
                    'IssueLinkService.createLink: chave de issue inexistente ao criar link "' +
                        input.linkType +
                        '" (' +
                        inward +
                        ' ← ' +
                        outward +
                        '): ' +
                        formatErr(err) +
                        ' — link não criado.',
                );
                return 'missing-key';
            }
            throw err;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // SEMANTIC OPERATIONS — direction derived here, never by callers
    // ─────────────────────────────────────────────────────────────

    /** Link test cases to a requirement/user story with the correct Test
     *  Coverage direction: requirement is INWARD ("is tested by"), test is
     *  OUTWARD ("tests"). */
    async linkTestsToRequirement(requirementKey: string, testKeys: string[]): Promise<LinkBatchResult> {
        assertValidKeys(testKeys, 'linkTestsToRequirement(testKeys)');
        if (typeof requirementKey !== 'string' || !requirementKey.trim()) {
            throw new Error('IssueLinkService.linkTestsToRequirement: requirementKey é obrigatória.');
        }
        const result: LinkBatchResult = { created: 0, skipped: 0, failed: [], missing: [] };
        for (const testKey of testKeys) {
            try {
                const outcome = await this.createLink({
                    linkType: 'Tests',
                    inwardKey: requirementKey.trim(),
                    outwardKey: testKey.trim(),
                });
                if (outcome === 'created') {
                    result.created++;
                } else if (outcome === 'duplicate') {
                    result.skipped++;
                } else {
                    result.missing.push(testKey.trim());
                }
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.linkTestsToRequirement: falha ao linkar teste ' +
                        testKey.trim() +
                        ' → ' +
                        requirementKey.trim() +
                        ': ' +
                        formatErr(err),
                );
                result.failed.push(testKey.trim());
            }
        }
        return result;
    }

    /** Link test cases to a Test Execution: TE is INWARD, test is OUTWARD.
     *  Preserves the legacy createIssueLink(test, te, 'Tests') direction. */
    async linkTestToTestExecution(teKey: string, testKeys: string[]): Promise<LinkBatchResult> {
        assertValidKeys(testKeys, 'linkTestToTestExecution(testKeys)');
        if (typeof teKey !== 'string' || !teKey.trim()) {
            throw new Error('IssueLinkService.linkTestToTestExecution: teKey é obrigatória.');
        }
        const result: LinkBatchResult = { created: 0, skipped: 0, failed: [], missing: [] };
        for (const testKey of testKeys) {
            try {
                const outcome = await this.createLink({
                    linkType: 'Tests',
                    inwardKey: teKey.trim(),
                    outwardKey: testKey.trim(),
                });
                if (outcome === 'created') {
                    result.created++;
                } else if (outcome === 'duplicate') {
                    result.skipped++;
                } else {
                    result.missing.push(testKey.trim());
                }
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.linkTestToTestExecution: falha ao linkar teste ' +
                        testKey.trim() +
                        ' → ' +
                        teKey.trim() +
                        ': ' +
                        formatErr(err),
                );
                result.failed.push(testKey.trim());
            }
        }
        return result;
    }

    /** Link a source issue to target issues with the Relates (symmetric) type. */
    async linkRelated(sourceKey: string, targetKeys: string[]): Promise<LinkBatchResult> {
        assertValidKeys(targetKeys, 'linkRelated(targetKeys)');
        if (typeof sourceKey !== 'string' || !sourceKey.trim()) {
            throw new Error('IssueLinkService.linkRelated: sourceKey é obrigatória.');
        }
        const result: LinkBatchResult = { created: 0, skipped: 0, failed: [], missing: [] };
        for (const targetKey of targetKeys) {
            try {
                const outcome = await this.createLink({
                    linkType: 'Relates',
                    inwardKey: targetKey.trim(),
                    outwardKey: sourceKey.trim(),
                });
                if (outcome === 'created') {
                    result.created++;
                } else if (outcome === 'duplicate') {
                    result.skipped++;
                } else {
                    result.missing.push(targetKey.trim());
                }
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.linkRelated: falha ao linkar ' +
                        sourceKey.trim() +
                        ' → ' +
                        targetKey.trim() +
                        ': ' +
                        formatErr(err),
                );
                result.failed.push(targetKey.trim());
            }
        }
        return result;
    }

    /** Link a test to precondition issues (Pre-Condition type). */
    async linkPreCondition(testKey: string, preconditionKeys: string[]): Promise<LinkBatchResult> {
        assertValidKeys(preconditionKeys, 'linkPreCondition(preconditionKeys)');
        if (typeof testKey !== 'string' || !testKey.trim()) {
            throw new Error('IssueLinkService.linkPreCondition: testKey é obrigatória.');
        }
        const result: LinkBatchResult = { created: 0, skipped: 0, failed: [], missing: [] };
        for (const pcKey of preconditionKeys) {
            try {
                const outcome = await this.createLink({
                    linkType: 'Pre-Condition',
                    inwardKey: pcKey.trim(),
                    outwardKey: testKey.trim(),
                });
                if (outcome === 'created') {
                    result.created++;
                } else if (outcome === 'duplicate') {
                    result.skipped++;
                } else {
                    result.missing.push(pcKey.trim());
                }
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.linkPreCondition: falha ao linkar pre-condition ' +
                        pcKey.trim() +
                        ' → ' +
                        testKey.trim() +
                        ': ' +
                        formatErr(err),
                );
                result.failed.push(pcKey.trim());
            }
        }
        return result;
    }

    /** Generic batch link: source → targets with explicit per-target link types.
     *  Direction follows the Test-Coverage convention: target is INWARD, source
     *  is OUTWARD. Used by CSV/JSON import where each linked issue carries its
     *  own link type. */
    async linkSourceToTargets(
        sourceKey: string,
        targets: Array<{ key: string; linkType: string }>,
    ): Promise<LinkBatchResult> {
        if (!Array.isArray(targets) || targets.length === 0) {
            return { created: 0, skipped: 0, failed: [], missing: [] };
        }
        if (typeof sourceKey !== 'string' || !sourceKey.trim()) {
            rootLogger.warn('IssueLinkService.linkSourceToTargets: sourceKey inválida — nenhum link criado.');
            return { created: 0, skipped: 0, failed: [], missing: [] };
        }
        const result: LinkBatchResult = { created: 0, skipped: 0, failed: [], missing: [] };
        for (const target of targets) {
            if (
                !target ||
                typeof target.key !== 'string' ||
                !target.key.trim() ||
                typeof target.linkType !== 'string' ||
                !target.linkType.trim()
            ) {
                rootLogger.warn(
                    'IssueLinkService.linkSourceToTargets: target inválido (' + JSON.stringify(target) + ') — pulado.',
                );
                result.failed.push(String(target?.key ?? '(vazio)'));
                continue;
            }
            try {
                const outcome = await this.createLink({
                    linkType: target.linkType.trim(),
                    inwardKey: target.key.trim(),
                    outwardKey: sourceKey.trim(),
                });
                if (outcome === 'created') {
                    result.created++;
                } else if (outcome === 'duplicate') {
                    result.skipped++;
                } else {
                    result.missing.push(target.key.trim());
                }
            } catch (err) {
                rootLogger.warn(
                    'IssueLinkService.linkSourceToTargets: falha ao criar link "' +
                        target.linkType +
                        '" de ' +
                        sourceKey +
                        ' para ' +
                        target.key +
                        ': ' +
                        formatErr(err),
                );
                result.failed.push(target.key);
            }
        }
        return result;
    }
}
